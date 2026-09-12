"""The per-message journey through the live path (step 4c).

/request, accept, /join, a message through the handler, and the client's End,
driven through the real routers and the real message handler with the model
stubbed at the streaming helper (as tests/test_reading_single.py does). Every
entry point of the old pipeline is replaced by a recorder, so each test can say
not only what the new path did but that the old one was never entered.

The routes hand message ids to reading_single.enqueue_reply, which is also a
recorder here: a worker task started inside a test-client request would run on
the client's own loop thread, so instead each test replays the recorded ids
through the real engine and waits for it. The last test pins the per-minute
default: /join still greets and the handler still notes the burst.
"""

from __future__ import annotations

import asyncio
import time
from collections import defaultdict
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 - registers every model on Base.metadata
from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.chat_session_status import ChatSessionStatus
from app.enums.chat_status import ChatStatus
from app.enums.response_mode import ResponseMode
from app.enums.role import Role
from app.enums.transaction_type import TransactionType
from app.models import Chat, ChatSession, Message, ReadingSteeringNote, Transaction, User
from app.models.base import Base
from app.routers import chats as chats_router
from app.services import session_manager as sm
from app.services.ai import (
    reading_assistant,
    reading_burst,
    reading_first_word,
    reading_pre_session,
    reading_single,
    registry,
)
from app.services.ai import client as ai_client
from app.services.ai.reading_draft_log import DraftAttemptLog
from app.services.ai.reading_session import SessionStore
from app.services.chat.handlers.message_handler import MessageHandler
from app.services.session_manager import SessionManager

RATE = 1 / 60  # one point per minute, for the per-minute control test
PRICE = 2.0

OLD_ENTRY_POINTS = (
    "note_client_message",
    "pre_session_write",
    "open_first_turn",
    "greet_now",
    "first_word",
    "old_goodbye",
)


# ── fixtures ─────────────────────────────────────────────────────────────────
@pytest.fixture
def sqlite(monkeypatch):
    """An in-memory database that ALSO stands in for app.database.client.SessionLocal,
    because the session manager, the engine and the routes open their own sessions."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    Local = sessionmaker(bind=engine, expire_on_commit=False)
    from app.database import client as database_client

    monkeypatch.setattr(database_client, "SessionLocal", Local)
    db = Local()
    try:
        yield db, Local
    finally:
        db.close()
        engine.dispose()


class _Log:
    def __init__(self):
        self.events = []

    def _record(self, level, event, **fields):
        self.events.append((level, event, fields))

    def debug(self, event, **fields):
        self._record("debug", event, **fields)

    def info(self, event, **fields):
        self._record("info", event, **fields)

    def warning(self, event, **fields):
        self._record("warning", event, **fields)

    def error(self, event, **fields):
        self._record("error", event, **fields)

    def exception(self, event, **fields):
        self._record("exception", event, **fields)

    def find(self, event):
        return [fields for _level, name, fields in self.events if name == event]


class _FakeWebSocket:
    """Captures exactly what the room sends the client."""

    def __init__(self):
        self.sent = []

    async def send_json(self, payload):
        self.sent.append(payload)

    def messages(self):
        return [p for p in self.sent if p.get("type") == "message"]

    def events(self, name):
        return [p for p in self.sent if p.get("event") == name]


class _Model:
    """Stands in for ai_client.run_chat_stream: each script entry is one call."""

    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        step = self.script.pop(0)
        if isinstance(step, Exception):
            raise step
        return iter([step])


@pytest.fixture
def journey(sqlite, monkeypatch):
    """BILLING_MODE per_message, the engine on the test database, every old entry
    point a recorder, the routes' enqueue a recorder, and one real SessionManager."""
    db, Local = sqlite
    monkeypatch.setattr(sm.settings, "BILLING_MODE", "per_message")
    registry.seed_prompts(db)

    store = SessionStore(session_factory=Local)
    draft_log = DraftAttemptLog(session_factory=Local)

    async def _atlas(state, user_id, psychic_id=None):
        state.atlas_memory_text = "ATLAS MEMORY TEXT"
        return state.atlas_memory_text

    async def _no_sleep(seconds):
        return None

    monkeypatch.setattr(reading_single, "get_session_store", lambda: store)
    monkeypatch.setattr(reading_single, "get_draft_log", lambda: draft_log)
    monkeypatch.setattr(reading_single, "schedule_fold", lambda chat_id: None)
    monkeypatch.setattr(reading_single, "_atlas_memory", _atlas)
    monkeypatch.setattr(reading_single, "_sleep", _no_sleep)
    monkeypatch.setattr(reading_single, "_queues", {})
    monkeypatch.setattr(reading_single, "_workers", {})
    monkeypatch.setattr(reading_single, "_in_flight", {})
    monkeypatch.setattr(reading_burst, "_message_flow_locks", {})
    monkeypatch.setattr(
        reading_assistant, "build_client_file", lambda db, client_id: "CLIENT FILE TEXT"
    )
    monkeypatch.setattr("app.services.push.notify_user_push", lambda *a, **k: None)

    calls = defaultdict(list)

    def _sync(name):
        def _record(*args, **kwargs):
            calls[name].append((args, kwargs))
            return None

        return _record

    def _async(name, result=None):
        async def _record(*args, **kwargs):
            calls[name].append((args, kwargs))
            return result

        return _record

    # The old pipeline, every way in.
    monkeypatch.setattr(reading_burst, "note_client_message", _async("note_client_message"))
    monkeypatch.setattr(reading_burst, "_start_first_word", _sync("first_word"))
    monkeypatch.setattr(reading_pre_session, "schedule_pre_reading", _sync("pre_session_write"))
    monkeypatch.setattr(reading_pre_session, "open_first_turn", _async("open_first_turn", False))
    monkeypatch.setattr(reading_first_word, "greet_now", _sync("greet_now"))
    monkeypatch.setattr(reading_first_word, "say_goodbye", _async("old_goodbye"))

    # The new engine's hand-off, recorded at the seam and replayed for real.
    real_enqueue = reading_single.enqueue_reply
    monkeypatch.setattr(reading_single, "enqueue_reply", _async("enqueue_reply"))
    real_drain = reading_single.drain_on_end

    async def _drain(chat_id):
        calls["drain_on_end"].append(chat_id)
        return await real_drain(chat_id)

    monkeypatch.setattr(reading_single, "drain_on_end", _drain)

    manager = SessionManager()
    monkeypatch.setattr(sm, "get_session_manager", lambda: manager)
    return SimpleNamespace(
        db=db, Local=Local, store=store, calls=calls, manager=manager,
        monkeypatch=monkeypatch, real_enqueue=real_enqueue,
    )


def _model(journey, script):
    model = _Model(script)
    journey.monkeypatch.setattr(ai_client, "run_chat_stream", model)
    return model


def _people(db, *, balance=20.0):
    client = User(
        email="client@test.co", username="client", password_hash="hash",
        balance=balance, role=Role.USER,
    )
    psychic = User(
        email="sophie@test.co", username="sophie", password_hash="hash",
        role=Role.PSYCHIC, price_per_second=RATE, price_per_message=PRICE,
    )
    db.add_all([client, psychic])
    db.commit()
    return client, psychic


def _chat(db, client, psychic, *, status, mode=ResponseMode.SABRI, session=None):
    chat = Chat(user_id=client.id, psychic_id=psychic.id, status=status, response_mode=mode)
    db.add(chat)
    db.commit()
    if session is not None:
        db.add(ChatSession(chat_id=chat.id, status=session))
        db.commit()
    db.refresh(chat)
    return chat


def _http(journey, current):
    """A test app with the chats router at its real prefix. ``current`` is a
    one-key dict so a test can switch who is calling between requests."""
    test_app = FastAPI()
    test_app.include_router(chats_router.router, prefix="/api/chat")
    test_app.dependency_overrides[get_db] = lambda: journey.db
    test_app.dependency_overrides[get_current_user] = lambda: current["user"]
    return TestClient(test_app, raise_server_exceptions=False)


def _room(journey, chat, client):
    from app.manager import manager

    ws = _FakeWebSocket()
    journey.monkeypatch.setitem(manager.active_chats, str(chat.id), [(ws, client.id)])
    return ws


def _send(journey, chat, user, text):
    """One client message through the real handler, as the room would send it."""
    journey.db.expire_all()
    ws = _FakeWebSocket()
    handler = MessageHandler(websocket=ws, db=journey.db, chat_id=chat.id, user_id=user.id)
    asyncio.run(handler._handle_serialized({"content": text}))
    return ws


async def _replay(journey, chat_id, *message_ids):
    for message_id in message_ids:
        await journey.real_enqueue(chat_id, message_id)
    await reading_single.wait_for_idle(chat_id)


def _reader_messages(db, chat, psychic):
    db.expire_all()
    return (
        db.query(Message)
        .filter(Message.chat_id == chat.id, Message.sender_id == psychic.id)
        .order_by(Message.id.asc())
        .all()
    )


def _client_messages(db, chat, client):
    db.expire_all()
    return (
        db.query(Message)
        .filter(Message.chat_id == chat.id, Message.sender_id == client.id)
        .order_by(Message.id.asc())
        .all()
    )


def _rows(db, kind, message_id=None):
    query = db.query(Transaction).filter(Transaction.transaction_type == kind)
    if message_id is not None:
        query = query.filter(Transaction.related_message_id == message_id)
    return query.all()


def _enqueued(journey):
    return [args for args, _kwargs in journey.calls["enqueue_reply"]]


def _assert_old_pipeline_dark(journey):
    for name in OLD_ENTRY_POINTS:
        assert journey.calls[name] == [], f"old pipeline entered through {name}"


def _open_reading(journey, *, hall_question="will he come back? we broke up in march"):
    """/request as the client, accept as the psychic, /join as the client. Returns
    everything the tests need to carry on from a live per-message reading."""
    db = journey.db
    client, psychic = _people(db)
    current = {"user": client}
    http = _http(journey, current)

    resp = http.post("/api/chat/request", json={"psychic_id": psychic.id, "message": hall_question})
    assert resp.status_code == 201, resp.text
    chat = db.query(Chat).one()
    hall = _client_messages(db, chat, client)[-1]
    assert hall.content == hall_question
    assert [t.related_message_id for t in _rows(db, TransactionType.DEBIT)] == [hall.id]
    ws = _room(journey, chat, client)

    current["user"] = psychic
    db.expire_all()
    resp = http.post(f"/api/chat/{chat.id}/status", json={"status": ChatStatus.ACTIVE.value})
    assert resp.status_code == 201, resp.text

    current["user"] = client
    db.expire_all()
    resp = http.post(f"/api/chat/{chat.id}/join")
    assert resp.status_code == 200, resp.text
    db.expire_all()
    assert db.get(Chat, chat.id).status == ChatStatus.ACTIVE
    return SimpleNamespace(
        client=client, psychic=psychic, chat=chat, hall=hall, ws=ws, http=http, current=current,
    )


# ── 1. the full journey ───────────────────────────────────────────────────────
def test_full_journey_request_accept_join_message_end(journey):
    db = journey.db
    model = _model(journey, [
        "u started timing the replies\n\nfast and u breathe. slow and ur body braces",
        "the job is the thing u are not asking about and it is the thing that moves",
        "go gently. that thread about the timing is still there when u want it",
    ])

    r = _open_reading(journey)

    # /request, accept and /join entered nothing of the old pipeline, and /join
    # handed the hall question to the engine.
    _assert_old_pipeline_dark(journey)
    assert _enqueued(journey) == [(r.chat.id, r.hall.id)]

    asyncio.run(_replay(journey, r.chat.id, r.hall.id))
    first_reply = [m.content for m in _reader_messages(db, r.chat, r.psychic)]
    assert first_reply == [
        "u started timing the replies",
        "fast and u breathe. slow and ur body braces",
    ]
    assert model.calls[0]["user_content"].rstrip().endswith(r.hall.content)

    # A second message through the handler: charged, handed over, replied in order.
    _send(journey, r.chat, r.client, "and what about the job")
    second = _client_messages(db, r.chat, r.client)[-1]
    assert second.content == "and what about the job"
    assert [t.related_message_id for t in _rows(db, TransactionType.DEBIT)] == [r.hall.id, second.id]
    db.refresh(r.client)
    assert r.client.balance == 20.0 - 2 * PRICE
    assert _enqueued(journey) == [(r.chat.id, r.hall.id), (r.chat.id, second.id)]
    _assert_old_pipeline_dark(journey)

    asyncio.run(_replay(journey, r.chat.id, second.id))
    assert [m.content for m in _reader_messages(db, r.chat, r.psychic)] == first_reply + [
        "the job is the thing u are not asking about and it is the thing that moves"
    ]
    assert "u started timing the replies" in model.calls[1]["user_content"]

    # The client's End: drained, one unbilled goodbye, then the session ends.
    db.expire_all()
    resp = r.http.post(f"/api/chat/{r.chat.id}/status", json={"status": ChatStatus.ENDED.value})
    assert resp.status_code == 201, resp.text

    assert journey.calls["drain_on_end"] == [r.chat.id]
    assert journey.calls["old_goodbye"] == []
    reader = [m.content for m in _reader_messages(db, r.chat, r.psychic)]
    assert reader[-1] == "go gently. that thread about the timing is still there when u want it"
    assert len(reader) == 4
    assert reading_single.ENDED_NOTE in model.calls[2]["user_content"]
    db.expire_all()
    assert db.get(Chat, r.chat.id).status == ChatStatus.ENDED
    assert [s.status for s in db.query(ChatSession).all()] == [ChatSessionStatus.COMPLETED]
    ended = r.ws.events("session_ended_confirmed")
    assert len(ended) == 1
    assert ended[0]["data"]["final_cost"] == 2 * PRICE
    assert _rows(db, TransactionType.REVERSAL) == []
    assert len(_rows(db, TransactionType.DEBIT)) == 2
    _assert_old_pipeline_dark(journey)


# ── 2. a reader whose chat is not automatic ──────────────────────────────────
@pytest.mark.parametrize("mode", [ResponseMode.HUMAN, ResponseMode.HYBRID])
def test_request_refuses_a_non_automatic_reader(journey, mode):
    db = journey.db
    client, psychic = _people(db)
    earlier = _chat(db, client, psychic, status=ChatStatus.ENDED, mode=mode)
    http = _http(journey, {"user": client})

    resp = http.post("/api/chat/request", json={"psychic_id": psychic.id, "message": "hi"})

    assert resp.status_code == 402, resp.text
    assert resp.json() == {
        "detail": "READER_UNAVAILABLE", "required": None, "balance": 20.0, "psychic_name": "sophie",
    }
    db.expire_all()
    assert db.query(Chat).count() == 1
    assert db.get(Chat, earlier.id).status == ChatStatus.ENDED  # not re-requested
    assert db.query(Message).filter(Message.is_system.is_(False)).count() == 0
    assert db.query(Transaction).count() == 0
    assert journey.calls["pre_session_write"] == []


# ── 3. End while a message is queued and not started ─────────────────────────
def test_end_refunds_the_queued_message_and_still_says_goodbye(journey):
    db = journey.db
    model = _model(journey, [
        "u started timing the replies",
        "go gently. that thread is still there when u want it",
    ])
    r = _open_reading(journey)
    asyncio.run(_replay(journey, r.chat.id, r.hall.id))

    _send(journey, r.chat, r.client, "and what about the job")
    second = _client_messages(db, r.chat, r.client)[-1]
    assert _enqueued(journey)[-1] == (r.chat.id, second.id)
    # Queued for the engine and not started: exactly what the route handed over.
    reading_single._queues[r.chat.id] = [second.id]
    balance_before = db.get(User, r.client.id).balance

    db.expire_all()
    resp = r.http.post(f"/api/chat/{r.chat.id}/status", json={"status": ChatStatus.ENDED.value})
    assert resp.status_code == 201, resp.text

    assert journey.calls["drain_on_end"] == [r.chat.id]
    assert len(_rows(db, TransactionType.REVERSAL, second.id)) == 1
    assert _rows(db, TransactionType.REVERSAL, r.hall.id) == []
    db.refresh(r.client)
    assert r.client.balance == balance_before + PRICE
    assert not reading_single._queues.get(r.chat.id)
    reader = [m.content for m in _reader_messages(db, r.chat, r.psychic)]
    assert reader == [
        "u started timing the replies",
        "go gently. that thread is still there when u want it",
    ]
    db.expire_all()
    assert db.get(Chat, r.chat.id).status == ChatStatus.ENDED
    assert r.ws.events("session_ended_confirmed")[0]["data"]["final_cost"] == PRICE
    assert journey.calls["old_goodbye"] == []
    assert len(model.calls) == 2


# ── 4. a goodbye that hangs does not hold the End ────────────────────────────
def test_end_skips_a_goodbye_that_outlives_the_cap(journey):
    db = journey.db
    _model(journey, ["u started timing the replies"])
    r = _open_reading(journey)
    asyncio.run(_replay(journey, r.chat.id, r.hall.id))

    async def _hangs(chat_id):
        await asyncio.sleep(30)

    log = _Log()
    journey.monkeypatch.setattr(reading_single, "say_goodbye", _hangs)
    journey.monkeypatch.setattr(chats_router, "PER_MESSAGE_GOODBYE_TIMEOUT_S", 0.3)
    journey.monkeypatch.setattr(chats_router, "logger", log)

    db.expire_all()
    started = time.perf_counter()
    resp = r.http.post(f"/api/chat/{r.chat.id}/status", json={"status": ChatStatus.ENDED.value})
    elapsed = time.perf_counter() - started

    assert resp.status_code == 201, resp.text
    assert elapsed < 5.0
    db.expire_all()
    assert db.get(Chat, r.chat.id).status == ChatStatus.ENDED
    skipped = log.find("per_message_goodbye_skipped")
    assert skipped == [{"chat_id": r.chat.id, "reason": "timeout", "timeout_s": 0.3}]
    assert [m.content for m in _reader_messages(db, r.chat, r.psychic)] == [
        "u started timing the replies"
    ]
    assert journey.calls["old_goodbye"] == []


# ── 5. an operator steering note reaches the single input ────────────────────
def test_steering_note_sits_directly_before_the_marked_message(journey):
    db = journey.db
    client, psychic = _people(db)
    chat = _chat(
        db, client, psychic, status=ChatStatus.ACTIVE, mode=ResponseMode.HYBRID,
        session=ChatSessionStatus.ACTIVE,
    )
    session = db.query(ChatSession).one()
    db.add(ReadingSteeringNote(
        chat_id=chat.id, chat_session_id=session.id, note="she is grieving, go gentle",
        active=True, created_by=psychic.id,
    ))
    message = Message(chat_id=chat.id, sender_id=client.id, content="what does he feel")
    db.add(message)
    db.commit()
    db.refresh(chat)

    text = reading_single.build_single_input(db, chat, answer_message_id=message.id)

    guidance = text.index("OPERATOR GUIDANCE")
    marker = text.index(reading_single.MARKED_MESSAGE_HEADER)
    assert "- she is grieving, go gentle" in text
    assert text.index("KNOWN NUMEROLOGY") < guidance < marker
    # Directly before the marked block: nothing sits between the two.
    assert text[guidance:marker].rstrip().endswith("- she is grieving, go gentle")
    assert text[marker:].rstrip().endswith("what does he feel")


# ── 6. the per-minute default is untouched ───────────────────────────────────
def test_per_minute_join_still_greets_and_messages_still_note_the_burst(journey):
    db = journey.db
    journey.monkeypatch.setattr(sm.settings, "BILLING_MODE", "per_minute")
    client, psychic = _people(db, balance=50.0)
    chat = _chat(
        db, client, psychic, status=ChatStatus.REQUESTED, session=ChatSessionStatus.REQUESTED
    )
    asyncio.run(journey.manager.start_session(chat.id))
    http = _http(journey, {"user": client})

    db.expire_all()
    resp = http.post(f"/api/chat/{chat.id}/join")
    assert resp.status_code == 200, resp.text
    assert len(journey.calls["open_first_turn"]) == 1
    assert len(journey.calls["greet_now"]) == 1
    assert journey.calls["enqueue_reply"] == []

    _send(journey, chat, client, "hello there")
    assert len(journey.calls["note_client_message"]) == 1
    assert journey.calls["enqueue_reply"] == []
    assert _rows(db, TransactionType.DEBIT) != []  # minute 1, charged on join as always
    assert db.query(Transaction).filter(Transaction.idempotency_key.like("msg_fee:%")).count() == 0
