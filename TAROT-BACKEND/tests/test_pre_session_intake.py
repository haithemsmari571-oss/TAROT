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


def test_the_opening_turn_delivers_the_banked_reading_instead_of_rewriting_it():
    """Live: the first turn routed "new" and spent another sixty seconds writing a second
    reading, because the router was asked whether the held material answered her and had no
    way to know the held material WAS written from her. On this one turn it is not a
    question."""
    import inspect

    from app.services.ai import reading_burst

    source = inspect.getsource(reading_burst._generate_auto)
    assert 'forced = "continue"' in source
    assert 'pre_reading_message_id' in source
    assert 'claim.through_message_id' in source
    # and it is passed positionally as forced_route into _duo_generate
    assert "claim.client_id,\n        forced," in source


# ── the wait clock counts the wait she actually served ───────────────────────
def _claim(*, chat_id, chat_session_id, through_message_id, contents):
    from app.services.ai import reading_burst

    return reading_burst._Claim(
        chat_session_id=chat_session_id,
        chat_id=chat_id,
        client_id=10,
        psychic_id=2,
        mode="auto",
        owner="test",
        version=1,
        through_message_id=through_message_id,
        contents=contents,
    )


def test_the_opening_turn_counts_the_wait_that_happened_before_the_session():
    """She waits while her reading is written, then the message she wrote before that
    wait reaches the session at the instant she is accepted. Measured from the session
    she has waited no time at all, so Sabri was being told she had just spoken."""
    from app.services.ai import reading_burst

    state = _state(chat_id=91)
    state.pre_reading_message_id = 4242
    state.pre_reading_requested_at = datetime.now(timezone.utc) - timedelta(seconds=70)
    claim = _claim(chat_id=91, chat_session_id=5, through_message_id=4242,
                   contents=["my partner left in february"])
    waited = reading_burst._wait_began_before_the_session(state, claim)
    assert 69.0 <= waited <= 75.0


def test_a_naive_timestamp_is_read_as_utc_rather_than_crashing_the_turn():
    from app.services.ai import reading_burst

    state = _state(chat_id=92)
    state.pre_reading_message_id = 7
    state.pre_reading_requested_at = datetime.utcnow() - timedelta(seconds=40)
    claim = _claim(chat_id=92, chat_session_id=6, through_message_id=7, contents=["hello"])
    assert 39.0 <= reading_burst._wait_began_before_the_session(state, claim) <= 45.0


def test_an_ordinary_turn_keeps_the_clock_it_already_had():
    """Every other message reaches the session when she sends it, so there is nothing
    to add — and a later turn of a pre-read session must not inherit the old wait."""
    from app.services.ai import reading_burst

    state = _state(chat_id=93)
    state.pre_reading_message_id = 11
    state.pre_reading_requested_at = datetime.now(timezone.utc) - timedelta(seconds=300)
    later_turn = _claim(chat_id=93, chat_session_id=7, through_message_id=12,
                        contents=["what about my sister"])
    assert reading_burst._wait_began_before_the_session(state, later_turn) == 0.0

    never_pre_read = _state(chat_id=94)
    plain = _claim(chat_id=94, chat_session_id=8, through_message_id=1, contents=["hi"])
    assert reading_burst._wait_began_before_the_session(never_pre_read, plain) == 0.0


def test_the_wait_is_carried_as_an_offset_so_it_keeps_running_during_generation():
    """The wait is re-read after Valentina finishes, so whatever is added at the start
    has to still be there at the end — a floor taken once would go stale mid-turn."""
    import inspect

    from app.services.ai import reading_burst

    source = inspect.getsource(reading_burst._generate_auto)
    assert "_wait_began_before_the_session(state, claim)" in source
    assert "wait_offset = max(0.0, already_waited - turn_elapsed)" in source
    assert "/ 1000.0 + wait_offset" in source
