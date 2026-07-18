"""Durable SessionStore: a backend restart rehydrates the reading engine's working state
(reserve / held-back buffer / delivery queue + position / transcript) from the DB instead
of starting empty, and resume_delivery resumes from the saved position instead of silently
no-op-ing. The store is wired to a fresh in-memory SQLite DB (with the real schema); a
'restart' is simulated by wiping the in-memory dict ENTIRELY, not re-reading with it warm."""

import asyncio

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 — registers every model (incl. ReadingSessionStateRow) on Base.metadata
from app.models.base import Base
from app.services.ai import reading_executor
from app.services.ai.reading_contracts import DeliveryItem, HeldItem
from app.services.ai.reading_session import (
    SessionStore,
    create_session_state,
    record_client_message,
    record_sent_message,
)


def _db_backed_store() -> SessionStore:
    """A SessionStore wired to a fresh shared in-memory SQLite DB with the full schema."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    return SessionStore(session_factory=sessionmaker(bind=engine))


def _populate_mid_delivery(store: SessionStore):
    state = create_session_state("chat:42", client_id=7, chat_id=42, is_first_session=False)
    record_client_message(state, "will he come back?")
    record_sent_message(state, "he's circling, not gone")
    state.reserve = "BANKED: Knight of Cups keeps circling"
    state.held_back_buffer = [
        HeldItem(text="he came back louder", hold_trigger="if she mentions him"),
        HeldItem(text="mid-november is when it cracks", hold_trigger="if she asks timing"),
    ]
    state.delivery_queue = [
        DeliveryItem(message="bubble 1 (revealed)"),
        DeliveryItem(message="bubble 2 (pending)"),
        DeliveryItem(message="bubble 3 (pending)"),
    ]
    state.queue_position = 1  # 1 delivered, 2 remain
    state.messages_sent_count = 1
    store.put(state)  # write-through to the DB
    return state


def test_restart_rehydrates_state_byte_identical():
    store = _db_backed_store()
    before = _populate_mid_delivery(store)

    # simulate a backend restart: wipe the in-memory dict ENTIRELY
    store._sessions.clear()
    assert "chat:42" not in store._sessions

    after = store.get("chat:42")  # must rehydrate from the DB, not return None
    assert after is not None, "state was not rehydrated after restart"

    assert after.reserve == before.reserve
    assert [(h.text, h.hold_trigger) for h in after.held_back_buffer] == \
        [(h.text, h.hold_trigger) for h in before.held_back_buffer]
    assert [d.message for d in after.delivery_queue] == [d.message for d in before.delivery_queue]
    assert after.queue_position == before.queue_position == 1
    assert after.chat_transcript == before.chat_transcript
    assert after.messages_sent_count == before.messages_sent_count == 1
    assert after.is_first_session is False


def test_unknown_chat_starts_clean_no_false_rehydration():
    store = _db_backed_store()
    _populate_mid_delivery(store)
    store._sessions.clear()
    # a genuinely new/unknown chat is a clean miss (fresh start), never garbage-rehydrated
    assert store.get("chat:999") is None


def test_resume_delivery_resumes_after_restart(monkeypatch):
    store = _db_backed_store()
    _populate_mid_delivery(store)
    store._sessions.clear()  # restart

    # point the executor's store lookup at our DB-backed store; stub the real delivery
    monkeypatch.setattr("app.services.ai.reading_session.get_session_store", lambda: store)
    captured = {}

    def fake_start_delivery(chat_id, state, config=None):
        captured.update(
            chat_id=chat_id, position=state.queue_position,
            queue_len=len(state.delivery_queue), reserve=state.reserve,
        )
        return "DELIVERY_TASK"

    monkeypatch.setattr(reading_executor, "start_delivery", fake_start_delivery)

    result = asyncio.run(reading_executor.resume_delivery(42))

    assert result == "DELIVERY_TASK"        # resumed — NOT a silent no-op
    assert captured["position"] == 1         # from the correct saved position
    assert captured["queue_len"] == 3        # 2 bubbles still to reveal
    assert captured["reserve"].startswith("BANKED")


def test_rehydrated_aware_datetimes_are_normalised_to_naive():
    # Regression: Postgres returns timezone-AWARE datetimes for the store's timestamptz
    # columns; the engine uses naive datetime.now() throughout. Unnormalised, the first
    # record_client_message after a restart rehydration raised "can't subtract
    # offset-naive and offset-aware datetimes" and silently killed every hybrid/duo turn.
    # (SQLite hands back naive values, so the plain restart test above can't catch it —
    # this test injects aware values explicitly, as Postgres would.)
    from datetime import timezone

    from app.models.reading_session_state import ReadingSessionStateRow

    store = _db_backed_store()
    _populate_mid_delivery(store)
    with store._session_factory() as db:  # make the stored timestamps AWARE, as Postgres returns them
        row = db.get(ReadingSessionStateRow, 42)
        row.session_start = row.session_start.replace(tzinfo=timezone.utc)
        row.last_activity_at = row.last_activity_at.replace(tzinfo=timezone.utc)
        db.commit()
    store._sessions.clear()  # restart

    state = store.get("chat:42")
    assert state is not None
    assert state.session_start.tzinfo is None       # normalised back to naive
    assert state.last_activity_at.tzinfo is None
    record_client_message(state, "a message after the restart")  # must not raise
    assert state.chat_transcript[-1]["content"] == "a message after the restart"


def test_resume_delivery_noop_for_unknown_chat(monkeypatch):
    store = _db_backed_store()  # empty DB — no session for this chat
    monkeypatch.setattr("app.services.ai.reading_session.get_session_store", lambda: store)
    monkeypatch.setattr(reading_executor, "start_delivery", lambda *a, **k: "SHOULD_NOT_HAPPEN")
    result = asyncio.run(reading_executor.resume_delivery(12345))
    assert result is None  # nothing persisted -> correctly no-ops, no false resume
