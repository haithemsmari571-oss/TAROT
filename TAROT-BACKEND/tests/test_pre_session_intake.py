"""The reading is written while she waits to be accepted, not while she is being billed.

Every session used to start empty, so the first minute went on intake — what is going on,
who is he, when was he born — with the meter running. She writes it once on the request now,
and Valentina writes the whole reading from it in the gap before anyone accepts, where
nothing is billed.

Acceptance itself is NOT here: it lives in the Second Brain CRM. What is here is the signal
it waits on instead of a random five-to-twenty-second timer.
"""

from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 — registers every model
from app.enums.chat_status import ChatStatus
from app.enums.response_mode import ResponseMode
from app.enums.role import Role
from app.models.base import Base
from app.models.chat import Chat
from app.models.settings import Settings
from app.models.user import User
from app.schemas.chat import ChatStart
from app.services.ai import reading_pre_session as P
from app.services.ai.reading_session import create_session_state, get_session_store


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    session.add(User(id=10, email="c@t.co", username="c", password_hash="x", role=Role.USER))
    session.add(User(id=20, email="p@t.co", username="p", password_hash="x", role=Role.PSYCHIC))
    session.flush()
    session.add(Chat(id=1, user_id=10, psychic_id=20, status=ChatStatus.REQUESTED,
                     response_mode=ResponseMode.SABRI))
    session.commit()
    try:
        yield session
    finally:
        session.close()


def _state(chat_id=1, **kwargs):
    store = get_session_store()
    store.delete(f"chat:{chat_id}")
    state = create_session_state(f"chat:{chat_id}", client_id=10, chat_id=chat_id)
    for key, value in kwargs.items():
        setattr(state, key, value)
    store._sessions[f"chat:{chat_id}"] = state       # in-memory only; no DB in this test
    return state


# ── item 1: she must say something ───────────────────────────────────────────
def test_a_request_without_a_question_is_rejected():
    with pytest.raises(ValidationError):
        ChatStart(psychic_id=20, message="   ")
    with pytest.raises(ValidationError):
        ChatStart(psychic_id=20, message="")


def test_four_words_is_a_complete_answer():
    """No minimum length and no shape. "will he come back" is the whole question."""
    assert ChatStart(psychic_id=20, message="will he come back").message == (
        "will he come back"
    )


def test_her_text_is_never_substituted():
    """The old form sent "I'm ready to begin my reading." when she left it blank, which
    would now mean a reading written from nothing."""
    assert ChatStart(psychic_id=20, message="  he left in March  ").message == (
        "he left in March"
    )


# ── item 4: the signal the CRM waits on ──────────────────────────────────────
def test_never_accepted_before_ten_seconds_even_when_the_reading_is_instant(db):
    _state(pre_reading_status=P.READY,
           pre_reading_requested_at=datetime.now(timezone.utc) - timedelta(seconds=4),
           pre_reading_ready_at=datetime.now(timezone.utc))
    signal = P.acceptance_signal(db, 1)
    assert signal["ready"] is True
    assert signal["accept_now"] is False       # the floor: instant reads as a machine
    assert signal["waited_seconds"] < 10


def test_accepted_once_the_reading_is_banked_and_the_floor_has_passed(db):
    ready = datetime.now(timezone.utc) - timedelta(seconds=20)
    _state(pre_reading_status=P.READY,
           pre_reading_requested_at=datetime.now(timezone.utc) - timedelta(seconds=45),
           pre_reading_ready_at=ready)
    signal = P.acceptance_signal(db, 1)
    assert signal["accept_now"] is True
    assert signal["status"] == "READY"
    assert signal["ready_at"] is not None


def test_a_slow_reading_holds_acceptance_until_the_ceiling(db):
    _state(pre_reading_status=P.PENDING,
           pre_reading_requested_at=datetime.now(timezone.utc) - timedelta(seconds=45))
    assert P.acceptance_signal(db, 1)["accept_now"] is False

    _state(pre_reading_status=P.PENDING,
           pre_reading_requested_at=datetime.now(timezone.utc) - timedelta(seconds=121))
    late = P.acceptance_signal(db, 1)
    assert late["accept_now"] is True          # never hangs
    assert late["status"] == "PENDING"


def test_a_failed_reading_opens_the_session_rather_than_hanging(db):
    _state(pre_reading_status=P.FAILED,
           pre_reading_requested_at=datetime.now(timezone.utc) - timedelta(seconds=15))
    signal = P.acceptance_signal(db, 1)
    assert signal["failed"] is True
    assert signal["accept_now"] is True        # go, at the floor, not at the ceiling


def test_a_chat_with_no_pre_reading_behaves_exactly_as_before(db):
    """Every request that predates this, and any blank one: nothing to wait for."""
    _state(pre_reading_requested_at=datetime.now(timezone.utc) - timedelta(seconds=15))
    signal = P.acceptance_signal(db, 1)
    assert signal["status"] == "NONE"
    assert signal["accept_now"] is True


# ── the global switch ────────────────────────────────────────────────────────
def test_the_switch_stops_acceptance_system_wide(db):
    _state(pre_reading_status=P.READY,
           pre_reading_requested_at=datetime.now(timezone.utc) - timedelta(seconds=45),
           pre_reading_ready_at=datetime.now(timezone.utc))
    assert P.acceptance_signal(db, 1)["accept_now"] is True

    db.add(Settings(key=P.AUTO_ACCEPT_SETTING_KEY, value="false"))
    db.commit()
    off = P.acceptance_signal(db, 1)
    assert off["auto_accept_enabled"] is False
    assert off["accept_now"] is False          # the reading is ready; acceptance still stops


def test_an_absent_switch_means_on(db):
    assert P.auto_accept_enabled(db) is True


# ── scope: only the automatic path ───────────────────────────────────────────
def test_a_human_handled_request_is_never_auto_accepted(db):
    _state(pre_reading_status=P.READY,
           pre_reading_requested_at=datetime.now(timezone.utc) - timedelta(seconds=45),
           pre_reading_ready_at=datetime.now(timezone.utc))
    for mode in (ResponseMode.HUMAN, ResponseMode.HYBRID):
        db.query(Chat).filter(Chat.id == 1).update({Chat.response_mode: mode})
        db.commit()
        assert P.acceptance_signal(db, 1)["accept_now"] is False


def test_an_already_accepted_request_is_not_accepted_twice(db):
    _state(pre_reading_status=P.READY,
           pre_reading_requested_at=datetime.now(timezone.utc) - timedelta(seconds=45),
           pre_reading_ready_at=datetime.now(timezone.utc))
    db.query(Chat).filter(Chat.id == 1).update({Chat.status: ChatStatus.ACTIVE})
    db.commit()
    assert P.acceptance_signal(db, 1)["accept_now"] is False


def test_an_unknown_chat_reports_not_found(db):
    assert P.acceptance_signal(db, 4242)["found"] is False


# ── this repo never accepts anything itself ──────────────────────────────────
def test_no_second_acceptance_path_was_built_here():
    """Acceptance stays in the CRM. Two services racing to claim the same request would be
    worse than the timer this replaces."""
    import inspect

    source = inspect.getsource(P)
    assert "start_session" not in source
    assert "ChatStatus.ACTIVE" not in source


# ── items 6 and 7: the session opens like a conversation, not like a dump ────
def test_the_first_turn_goes_through_the_ordinary_burst_coordinator():
    """She must not receive the whole reading the instant she connects. Handing her request
    message to the normal coordinator gives her the opening line, the read pause, the dots
    and then the reading at typing speed — the same as any other turn."""
    import inspect

    source = inspect.getsource(P.open_first_turn)
    assert "reading_burst.note_client_message" in source
    assert "chat_session_id" in source


def test_the_generic_hello_is_skipped_when_a_reading_is_waiting():
    import inspect

    from app.routers import chats

    source = inspect.getsource(chats.join_chat_endpoint)
    assert "open_first_turn" in source
    assert "if not opened:" in source
    assert source.index("open_first_turn") < source.index("greet_now")
