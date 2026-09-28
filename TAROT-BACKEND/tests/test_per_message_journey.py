"""The per-message journey through the live path, as deployed.

/request opening the thread in one call (the reader's unbilled opener and the
charged question), a message through the handler, the client's End refused
because the thread never closes, the offline queue and its 24 hour refund, and
the reader's decline of a request row left over from the old request flow,
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
import json
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
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
from app.enums.message_status import MessageStatus
from app.enums.transaction_type import TransactionType
from app.models import (
    Chat,
    ChatSession,
    Message,
    Notification,
    ReadingSteeringNote,
    Transaction,
    User,
)
from app.models.base import Base
from app.routers import chats as chats_router
from app.services import offline_replies, per_message_billing
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
from app.services.per_message_start import AUTOMATIC_READER_OPENER
from app.services.reader_hours import UK_TIME, reader_availability
from app.services.transactions import create_debit_transaction
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
    # A live send's reply takes the queue entry its charge wrote, through the
    # queue's own sessions (offline_replies.claim_live).
    monkeypatch.setattr(offline_replies, "SessionLocal", Local)
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
    """Stands in for ai_client.run_chat_stream: each script entry is one call. A
    string is streamed back, an Exception is raised, and a (seconds, text) tuple
    blocks that long first, which is how a reply is still in flight."""

    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        step = self.script.pop(0)
        if isinstance(step, tuple):
            time.sleep(step[0])
            step = step[1]
        if isinstance(step, Exception):
            raise step
        return iter([step])


class _Notifications:
    """Stands in for the notification socket manager and keeps every frame."""

    def __init__(self):
        self.sent = []
        self.active_connections = {}

    async def send_to_user(self, message, user_id):
        self.sent.append((user_id, message))

    def is_user_connected(self, user_id):
        return False

    def find(self, notification_type):
        return [
            (user_id, message)
            for user_id, message in self.sent
            if message.get("notification_type") == notification_type
        ]


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
    notifications = _Notifications()
    monkeypatch.setattr("app.notification_manager.notification_manager", notifications)

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
        monkeypatch=monkeypatch, real_enqueue=real_enqueue, notifications=notifications,
    )


def _model(journey, script):
    model = _Model(script)
    journey.monkeypatch.setattr(ai_client, "run_chat_stream", model)
    return model


def _people(db, *, balance=20.0, per_second=RATE):
    # A client who has confirmed her email: an unconfirmed one sends one
    # message only (ROUND38, tests/test_email_confirmation_gate.py).
    client = User(
        email="client@test.co", username="client", password_hash="hash",
        balance=balance, role=Role.USER, is_verified=True,
    )
    psychic = User(
        email="sophie@test.co", username="sophie", password_hash="hash",
        role=Role.PSYCHIC, price_per_second=per_second, price_per_message=PRICE,
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


def _app(journey, current):
    """A test app with the chats router at its real prefix. ``current`` is a
    one-key dict so a test can switch who is calling between requests."""
    test_app = FastAPI()
    test_app.include_router(chats_router.router, prefix="/api/chat")
    test_app.dependency_overrides[get_db] = lambda: journey.db
    test_app.dependency_overrides[get_current_user] = lambda: current["user"]
    return test_app


def _http(journey, current):
    return TestClient(_app(journey, current), raise_server_exceptions=False)


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


END_DISABLED = "PER_MESSAGE_END_DISABLED"


def _open_thread(
    journey, *, hall_question="will he come back? we broke up in march", per_second=RATE
):
    """/request as the client, and nothing else: in the deployed flow that one
    call opens the thread ACTIVE with the reader's opener, charges the question
    and hands it to the engine (per_message_start.py start_automatic_conversation).
    Returns everything the tests need to carry on from a live conversation."""
    db = journey.db
    client, psychic = _people(db, per_second=per_second)
    current = {"user": client}
    http = _http(journey, current)

    resp = http.post("/api/chat/request", json={"psychic_id": psychic.id, "message": hall_question})
    assert resp.status_code == 201, resp.text
    chat = db.query(Chat).one()
    assert chat.status == ChatStatus.ACTIVE
    opener = _reader_messages(db, chat, psychic)[0]
    assert opener.content == AUTOMATIC_READER_OPENER
    hall = _client_messages(db, chat, client)[-1]
    assert hall.content == hall_question
    assert opener.id < hall.id
    assert [t.related_message_id for t in _rows(db, TransactionType.DEBIT)] == [hall.id]
    ws = _room(journey, chat, client)
    return SimpleNamespace(
        client=client, psychic=psychic, chat=chat, opener=opener, hall=hall, ws=ws,
        http=http, current=current,
    )


def _end(r):
    """The client's End, as the room would ask for it."""
    r.current["user"] = r.client
    return r.http.post(f"/api/chat/{r.chat.id}/status", json={"status": ChatStatus.ENDED.value})


def _assert_end_refused(resp):
    assert resp.status_code == 403, resp.text
    assert resp.json()["reason"] == END_DISABLED


# ── 1. the full journey ───────────────────────────────────────────────────────
def test_full_journey_request_message_and_the_thread_stays_open(journey):
    db = journey.db
    model = _model(journey, [
        "u started timing the replies\n\nfast and u breathe. slow and ur body braces",
        "the job is the thing u are not asking about and it is the thing that moves",
    ])

    r = _open_thread(journey)

    # /request entered nothing of the old pipeline and handed the question to the
    # engine itself: there is no accept and no /join any more.
    _assert_old_pipeline_dark(journey)
    assert _enqueued(journey) == [(r.chat.id, r.hall.id)]

    asyncio.run(_replay(journey, r.chat.id, r.hall.id))
    first_reply = [m.content for m in _reader_messages(db, r.chat, r.psychic)]
    assert first_reply == [
        AUTOMATIC_READER_OPENER,
        "u started timing the replies",
        "fast and u breathe. slow and ur body braces",
    ]
    assert model.calls[0]["user_content"].rstrip().endswith(r.hall.content)

    # A second message through the handler: charged, handed over, replied in order.
    _send(journey, r.chat, r.client, "and what about the job")
    second = _client_messages(db, r.chat, r.client)[-1]
    assert second.content == "and what about the job"
    assert [t.related_message_id for t in _rows(db, TransactionType.DEBIT)] == [r.hall.id, second.id]
    assert [t.idempotency_key for t in _rows(db, TransactionType.DEBIT)] == [
        f"msg_fee:{r.hall.id}", f"msg_fee:{second.id}",
    ]
    db.refresh(r.client)
    assert r.client.balance == 20.0 - 2 * PRICE
    assert _enqueued(journey) == [(r.chat.id, r.hall.id), (r.chat.id, second.id)]
    _assert_old_pipeline_dark(journey)

    asyncio.run(_replay(journey, r.chat.id, second.id))
    assert [m.content for m in _reader_messages(db, r.chat, r.psychic)] == first_reply + [
        "the job is the thing u are not asking about and it is the thing that moves"
    ]
    assert "u started timing the replies" in model.calls[1]["user_content"]

    # The client's End is refused: the thread never closes (chats.py
    # update_chat_status_endpoint, the PER_MESSAGE_END_DISABLED 403). Nothing is
    # drained, nothing said, nothing refunded, and the thread stays as it was.
    db.expire_all()
    _assert_end_refused(_end(r))

    assert journey.calls["drain_on_end"] == []
    assert len(model.calls) == 2
    db.expire_all()
    assert db.get(Chat, r.chat.id).status == ChatStatus.ACTIVE
    assert [s.status for s in db.query(ChatSession).all()] == [ChatSessionStatus.ACTIVE]
    assert r.ws.events("session_ended_confirmed") == []
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


# ── 3. a message to an offline reader waits, and is refunded after 24 hours ──
def _offline_hours(now_uk):
    """A daily window that opens two hours from now and closes an hour later."""
    opening = (now_uk + timedelta(hours=2)).time().replace(second=0, microsecond=0)
    closing = (now_uk + timedelta(hours=3)).time().replace(second=0, microsecond=0)
    return opening, closing


def _naive_utc_now():
    """The offline queue's clock, naive. The test database is SQLite, which hands
    DateTime columns back without a zone (see conftest.py), so the queue's aware
    clock is swapped for the same instant without one."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _queue(db, message_id):
    db.expire_all()
    debit = (
        db.query(Transaction)
        .filter(Transaction.idempotency_key == f"msg_fee:{message_id}")
        .one()
    )
    return json.loads(debit.transaction_metadata)[offline_replies.QUEUE_KEY]


def test_a_message_to_an_offline_reader_is_queued_and_refunded_after_the_timeout(journey):
    db = journey.db
    journey.monkeypatch.setattr(offline_replies, "SessionLocal", journey.Local)
    journey.monkeypatch.setattr(offline_replies, "_now", _naive_utc_now)
    r = _open_thread(journey)  # no hours yet: always online, nothing queued
    assert not offline_replies.is_queued(db, r.hall.id)

    # The reader keeps UK hours that do not include now (reader_hours.py).
    opening, closing = _offline_hours(datetime.now(UK_TIME))
    reader = db.get(User, r.psychic.id)
    reader.online_from, reader.online_to = opening, closing
    db.commit()
    availability = reader_availability(opening, closing)
    assert availability.is_online is False
    assert availability.next_online_at > datetime.now(timezone.utc)

    # The send is charged at once and staged on its own debit receipt, DELIVERED
    # (offline_replies.py stage_if_offline, inside the charge's transaction).
    _send(journey, r.chat, r.client, "are you there")
    second = _client_messages(db, r.chat, r.client)[-1]
    assert second.status == MessageStatus.DELIVERED
    assert _queue(db, second.id) == {"state": "queued", "reply_ids": []}
    db.refresh(r.client)
    assert r.client.balance == 20.0 - 2 * PRICE

    # The sweep's own selection reads the queue state through a JSON path that
    # only PostgreSQL evaluates (SQLite renders the nested path as a quoted
    # string), so the test drives what the sweep does for each queued message:
    # claim_next per reader, refund_queued(expired=True) per message.
    # Inside the 24 hours: no claim while the reader is offline, and no refund.
    assert offline_replies.claim_next(r.psychic.id) is None
    assert offline_replies.refund_queued(second.id, expired=True) is None
    assert _rows(db, TransactionType.REVERSAL) == []
    assert _queue(db, second.id)["state"] == "queued"

    # Past OFFLINE_REPLY_TIMEOUT with no reply: the automatic refund, msg_refund.
    db.expire_all()
    stored = db.get(Message, second.id)
    stored.created_at = (
        _naive_utc_now() - offline_replies.OFFLINE_REPLY_TIMEOUT - timedelta(minutes=1)
    )
    db.commit()

    reversal_id = offline_replies.refund_queued(second.id, expired=True)
    reversals = _rows(db, TransactionType.REVERSAL, second.id)
    assert [(t.id, t.idempotency_key) for t in reversals] == [
        (reversal_id, f"msg_refund:{second.id}")
    ]
    assert float(reversals[0].amount) == PRICE
    queue = _queue(db, second.id)
    assert (queue["state"], queue["reason"]) == ("refunded", "expired")
    db.expire_all()
    assert db.get(User, r.client.id).balance == 20.0 - PRICE  # the question stays paid
    assert _rows(db, TransactionType.REVERSAL, r.hall.id) == []

    # Once only: a second pass moves nothing.
    assert offline_replies.refund_queued(second.id, expired=True) is None
    assert len(_rows(db, TransactionType.REVERSAL)) == 1
    db.expire_all()
    assert db.get(User, r.client.id).balance == 20.0 - PRICE
    assert db.get(Chat, r.chat.id).status == ChatStatus.ACTIVE


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


def _legacy_request(journey, *, hall_question="will he come back"):
    """A paid, unanswered request row as the old request flow left it: REQUESTED,
    with a REQUESTED session and the question charged with the msg_fee key, and
    registered with the session manager as the old /request registered it. The
    deployed /request never writes one; the decline path still ends and refunds it
    (chats.py update_chat_status_endpoint, per_message_billing.py
    refund_unanswered_request)."""
    db = journey.db
    client, psychic = _people(db)
    chat = _chat(
        db, client, psychic, status=ChatStatus.REQUESTED, session=ChatSessionStatus.REQUESTED
    )
    hall = Message(chat_id=chat.id, sender_id=client.id, content=hall_question)
    db.add(hall)
    db.commit()
    create_debit_transaction(
        db=db, user_id=client.id, amount=PRICE, description=f"Message #{hall.id}",
        related_chat_id=chat.id, related_message_id=hall.id,
        idempotency_key=f"msg_fee:{hall.id}",
    )
    journey.manager.register_request(chat.id)
    db.refresh(client)
    assert client.balance == 20.0 - PRICE
    current = {"user": psychic}
    return SimpleNamespace(
        client=client, psychic=psychic, chat=chat, hall=hall,
        http=_http(journey, current), current=current,
    )


# ── 7. a reader priced per message only opens with no accept step ────────────
def test_reader_with_no_per_second_rate_opens_the_thread_with_no_accept_step(journey):
    db = journey.db
    _model(journey, [])

    r = _open_thread(journey, per_second=None)

    assert _enqueued(journey) == [(r.chat.id, r.hall.id)]
    assert [float(t.amount) for t in _rows(db, TransactionType.DEBIT)] == [PRICE]
    # Nobody is asked to accept: no request, no accept, stored or sent.
    assert db.query(Notification).count() == 0
    assert journey.notifications.sent == []
    assert journey.manager.active_sessions[r.chat.id].max_session_duration_seconds == 0

    # The thread reports its per-message figures (chats.py _billing_fields).
    db.expire_all()
    details = r.http.get(f"/api/chat/{r.chat.id}/details")
    assert details.status_code == 200, details.text
    body = details.json()
    assert (body["status"], body["billing_mode"], body["price_per_message"], body["balance"]) == (
        "ACTIVE", "per_message", PRICE, 20.0 - PRICE,
    )


# ── 8. the client's End before any reply is refused and refunds nothing ──────
def test_client_end_before_any_reply_is_refused_and_refunds_nothing(journey):
    db = journey.db
    log = _Log()
    journey.monkeypatch.setattr(per_message_billing, "logger", log)
    r = _open_thread(journey)

    db.expire_all()
    _assert_end_refused(_end(r))

    # The question stays paid and waiting for its reply; only the offline queue's
    # 24 hour expiry ever gives a message back.
    assert _rows(db, TransactionType.REVERSAL) == []
    db.refresh(r.client)
    assert r.client.balance == 20.0 - PRICE
    assert log.find("per_message_request_refunded") == []
    assert _enqueued(journey) == [(r.chat.id, r.hall.id)]
    db.expire_all()
    assert db.get(Chat, r.chat.id).status == ChatStatus.ACTIVE
    assert journey.calls["old_goodbye"] == []
    assert journey.calls["drain_on_end"] == []


# ── 9. the reader declines a left-over request before any reply, both ways ───
@pytest.mark.parametrize("decline", [ChatStatus.ENDED, ChatStatus.ARCHIVED])
def test_reader_decline_of_a_legacy_request_before_any_reply_refunds_the_question(
    journey, decline
):
    db = journey.db
    log = _Log()
    journey.monkeypatch.setattr(per_message_billing, "logger", log)
    r = _legacy_request(journey)

    db.expire_all()
    resp = r.http.post(f"/api/chat/{r.chat.id}/status", json={"status": decline.value})
    assert resp.status_code == 201, resp.text

    reversals = _rows(db, TransactionType.REVERSAL, r.hall.id)
    assert [t.idempotency_key for t in reversals] == [f"msg_refund:{r.hall.id}"]
    db.refresh(r.client)
    assert r.client.balance == 20.0
    refunded = log.find("per_message_request_refunded")
    assert len(refunded) == 1 and refunded[0]["reversal_id"] == reversals[0].id
    db.expire_all()
    assert db.get(Chat, r.chat.id).status == decline


# ── 10. a decline after a reader reply refunds nothing ───────────────────────
def test_reader_decline_of_a_legacy_request_after_a_reply_refunds_nothing(journey):
    db = journey.db
    log = _Log()
    journey.monkeypatch.setattr(per_message_billing, "logger", log)
    r = _legacy_request(journey)
    db.add(Message(chat_id=r.chat.id, sender_id=r.psychic.id, content="i see him already"))
    db.commit()

    db.expire_all()
    resp = r.http.post(f"/api/chat/{r.chat.id}/status", json={"status": ChatStatus.ENDED.value})
    assert resp.status_code == 201, resp.text

    assert _rows(db, TransactionType.REVERSAL) == []
    db.refresh(r.client)
    assert r.client.balance == 20.0 - PRICE
    assert log.find("per_message_request_refunded") == []
    assert [f["reason"] for f in log.find("per_message_request_not_refunded")] == ["reader_replied"]
