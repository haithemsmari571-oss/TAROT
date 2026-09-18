"""Per-message billing: the endpoints.

/request opens the thread with the reader's unbilled opener and charges the
question as the first paid message. The five clock-only endpoints
answer 409. The Stripe webhook credits without resuming and tells the room. The
restart reload and a client disconnect are clockless. These drive the real
routers through a FastAPI test client (the pattern of tests/test_rejoin_greeting.py)
on an in-memory SQLite database that also stands in for SessionLocal (the pattern
of tests/test_reflection.py:42-59).

The last two tests pin the per-minute default.
"""

from __future__ import annotations

import asyncio

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
from app.enums.role import Role
from app.enums.transaction_type import TransactionType
from app.models import Chat, ChatSession, Message, SessionInterval, Transaction, User
from app.models.base import Base
from app.models.settings import Settings
from app.routers import chats as chats_router
from app.routers import payments as payments_router
from app.services import session_manager as sm
from app.services.session_manager import SessionManager

RATE = 1 / 60  # one point per minute
PRICE = 2.0


@pytest.fixture
def sqlite(monkeypatch):
    """An in-memory database that ALSO stands in for app.database.client.SessionLocal,
    because SessionManager and the webhook open their own sessions."""
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


def _mode(monkeypatch, mode):
    """One lru_cached settings object serves every module, so one patch is enough."""
    monkeypatch.setattr(sm.settings, "BILLING_MODE", mode)


def _people(db, *, balance=10.0, price=PRICE, price_per_second=RATE):
    n = db.query(User).count()
    client = User(
        email=f"client{n}@test.co",
        username=f"client{n}",
        password_hash="hash",
        balance=balance,
        role=Role.USER,
    )
    psychic = User(
        email=f"psychic{n}@test.co",
        username=f"psychic{n}",
        password_hash="hash",
        role=Role.PSYCHIC,
        price_per_second=price_per_second,
        price_per_message=price,
    )
    db.add_all([client, psychic])
    db.commit()
    return client, psychic


def _active_chat(db, client, psychic):
    chat = Chat(user_id=client.id, psychic_id=psychic.id, status=ChatStatus.ACTIVE)
    db.add(chat)
    db.commit()
    session = ChatSession(chat_id=chat.id, status=ChatSessionStatus.ACTIVE)
    db.add(session)
    db.commit()
    return chat, session


def _client(db, current_user, manager=None, monkeypatch=None):
    """A test app with the chats and payments routers mounted at their real prefixes."""
    test_app = FastAPI()
    test_app.include_router(chats_router.router, prefix="/api/chat")
    test_app.include_router(payments_router.router, prefix="/api/payment")
    test_app.dependency_overrides[get_db] = lambda: db
    test_app.dependency_overrides[get_current_user] = lambda: current_user
    if manager is not None and monkeypatch is not None:
        monkeypatch.setattr(sm, "get_session_manager", lambda: manager)
    return TestClient(test_app, raise_server_exceptions=False)


def _quiet_request_side_effects(monkeypatch):
    """The pre-reading is a fire-and-forget model call; keep it out of a unit test."""
    from app.services.ai import reading_pre_session

    monkeypatch.setattr(reading_pre_session, "schedule_pre_reading", lambda *a, **k: None)


def _msg_fee_debits(db):
    return db.query(Transaction).filter(Transaction.idempotency_key.like("msg_fee:%")).all()


# -- 1. /request opens the thread in one call and charges only the question ---
def test_request_opens_the_thread_and_charges_only_the_question(sqlite, monkeypatch):
    """One transaction (per_message_start.py start_automatic_conversation): the
    chat is ACTIVE and automatic at once, the reader's opener sits first and is
    never billed, the question is charged with the msg_fee key, and the reply is
    handed to the engine straight away. No REQUESTED state, no accept, no /join."""
    from app.enums.author_type import AuthorType
    from app.enums.response_mode import ResponseMode
    from app.services.per_message_start import AUTOMATIC_READER_OPENER

    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    calls = _quiet_reply_side_effects(monkeypatch)
    client, psychic = _people(db, balance=10.0)
    manager = SessionManager()
    http = _client(db, client, manager, monkeypatch)

    resp = http.post(
        "/api/chat/request",
        json={"psychic_id": psychic.id, "message": "will my ex come back"},
    )

    assert resp.status_code == 201, resp.text
    body = resp.json()
    chat = db.query(Chat).one()
    assert chat.status == ChatStatus.ACTIVE
    assert chat.response_mode == ResponseMode.SABRI
    session = db.query(ChatSession).one()
    assert session.status == ChatSessionStatus.ACTIVE
    opener, message = db.query(Message).order_by(Message.id).all()
    assert (opener.sender_id, opener.author_type, opener.content) == (
        psychic.id, AuthorType.SYSTEM, AUTOMATIC_READER_OPENER,
    )
    assert message.sender_id == client.id
    assert message.content == "will my ex come back"
    assert opener.id < message.id
    debit = db.query(Transaction).one()  # the opener is not billed
    assert debit.transaction_type == TransactionType.DEBIT
    assert debit.description == f"Message #{message.id}"
    assert debit.related_message_id == message.id
    assert debit.idempotency_key == f"msg_fee:{message.id}"
    assert float(debit.amount) == PRICE
    db.refresh(client)
    assert float(client.balance) == 10.0 - PRICE
    assert body["chat_id"] == chat.id
    assert body["status"] == "ACTIVE"
    assert body["opener_message_id"] == opener.id
    assert body["message_id"] == message.id
    assert body["price_per_message"] == PRICE
    assert body["client_balance"] == 10.0 - PRICE
    assert calls["enqueue"] == [(chat.id, message.id)]
    assert calls["stage"] == [message.id]  # the offline check ran on the charge
    assert manager.active_sessions[chat.id].session_id == session.id
    assert chat.id not in manager.requested_sessions


# -- 2. /request below the price: refused, nothing created --------------------
def test_request_below_the_price_is_refused_with_nothing_created(sqlite, monkeypatch):
    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    client, psychic = _people(db, balance=1.0)
    http = _client(db, client, SessionManager(), monkeypatch)

    resp = http.post("/api/chat/request", json={"psychic_id": psychic.id, "message": "hello"})

    assert resp.status_code == 402
    assert resp.json() == {
        "detail": "INSUFFICIENT_BALANCE",
        "required": PRICE,
        "balance": 1.0,
        "psychic_name": psychic.username,
    }
    assert db.query(Chat).count() == 0
    assert db.query(Message).count() == 0
    assert db.query(Transaction).count() == 0


# -- 3. /request with no per-message price: the reader is unavailable ---------
def test_request_with_an_unpriced_reader_is_refused_with_nothing_created(
    sqlite, monkeypatch
):
    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    client, psychic = _people(db, balance=10.0, price=None)
    http = _client(db, client, SessionManager(), monkeypatch)

    resp = http.post("/api/chat/request", json={"psychic_id": psychic.id, "message": "hello"})

    # The refusal comes from the one charge (per_message_billing.py
    # require_priced_reader) and is shaped by the router's one 402
    # (_per_message_refusal_response), so /request answers exactly as
    # /conversation does: no price, and no balance.
    assert resp.status_code == 402
    assert resp.json() == {
        "detail": "READER_UNAVAILABLE",
        "required": None,
        "balance": None,
        "psychic_name": psychic.username,
    }
    assert db.query(Chat).count() == 0
    assert db.query(Message).count() == 0
    assert db.query(Transaction).count() == 0


# -- 4. The five clock endpoints are closed ----------------------------------
CLOCK_ENDPOINTS = ("pause", "topup", "resume", "reflect", "reflect/return")


@pytest.mark.parametrize("endpoint", CLOCK_ENDPOINTS)
def test_clock_endpoints_answer_409_and_touch_nothing(sqlite, monkeypatch, endpoint):
    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    client, psychic = _people(db, balance=10.0)
    chat, session = _active_chat(db, client, psychic)
    manager = SessionManager()
    http = _client(db, client, manager, monkeypatch)
    before = (db.query(Transaction).count(), db.query(SessionInterval).count())

    resp = http.post(f"/api/chat/{chat.id}/{endpoint}")

    assert resp.status_code == 409, resp.text
    assert resp.json() == {"detail": "NOT_AVAILABLE_PER_MESSAGE"}
    db.expire_all()
    assert db.get(Chat, chat.id).status == ChatStatus.ACTIVE
    assert db.get(ChatSession, session.id).status == ChatSessionStatus.ACTIVE
    assert db.get(ChatSession, session.id).reflecting_since is None
    assert (db.query(Transaction).count(), db.query(SessionInterval).count()) == before
    assert manager.paused_sessions == {}


# -- 5. The Stripe webhook credits, does not resume, and tells the room -------
class _FakeSocket:
    def __init__(self):
        self.sent = []

    async def send_json(self, payload):
        self.sent.append(payload)


class _StripeSession(dict):
    """Stripe objects answer both item and attribute access; the webhook uses both."""

    payment_intent = "pi_test_123"
    amount_total = 1000


def test_webhook_topup_credits_without_resuming_and_sends_balance_updated(
    sqlite, monkeypatch
):
    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    client, psychic = _people(db, balance=0.0)
    chat, _session = _active_chat(db, client, psychic)
    db.add(Settings(key="stripe_endpoint_secret", value="whsec_test"))
    db.commit()

    resumed = []

    class _Manager(SessionManager):
        def resume_session(self, chat_id, new_balance=None):
            resumed.append((chat_id, new_balance))
            raise AssertionError("resume_session must not be called per-message")

    manager = _Manager()
    http = _client(db, client, manager, monkeypatch)

    event = {
        "id": "evt_test_1",
        "type": "checkout.session.completed",
        "data": {
            "object": _StripeSession(
                id="cs_test_1",
                metadata={"user_id": str(client.id), "points": "10"},
            )
        },
    }
    monkeypatch.setattr(
        payments_router.stripe.Webhook, "construct_event", lambda *a, **k: event
    )

    # Her room is open: one socket of hers, and one of the reader's that must NOT
    # be told her balance.
    from app.manager import manager as room

    her_socket, reader_socket = _FakeSocket(), _FakeSocket()
    monkeypatch.setitem(
        room.active_chats,
        str(chat.id),
        [(her_socket, client.id), (reader_socket, psychic.id)],
    )

    resp = http.post(
        "/api/payment/webhook", content=b"{}", headers={"stripe-signature": "sig"}
    )

    assert resp.status_code == 200, resp.text
    db.refresh(client)
    assert float(client.balance) == 10.0  # credited exactly as today
    assert resumed == []  # nothing resumed, nothing paused-related touched
    assert her_socket.sent == [
        {
            "event": "balance_updated",
            "data": {"balance": 10.0, "price_per_message": PRICE},
        }
    ]
    assert reader_socket.sent == []


# -- 6. Restart reload of a per-message session is clockless -----------------
def test_restart_reload_rebuilds_a_clockless_session(sqlite, monkeypatch):
    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    client, psychic = _people(db)
    chat, session = _active_chat(db, client, psychic)
    assert db.query(SessionInterval).count() == 0  # per-message never made one

    manager = SessionManager()
    manager._load_active_sessions_from_db()

    state = manager.active_sessions[chat.id]
    assert state.session_id == session.id
    assert state.interval_id is None
    assert state.max_session_duration_seconds == 0
    assert state.minutes_charged == 0
    assert db.query(SessionInterval).count() == 0


# -- 7. A client disconnect records itself and changes nothing else ----------
def test_client_disconnect_is_recorded_and_nothing_else_moves(sqlite, monkeypatch):
    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    client, psychic = _people(db)
    chat, session = _active_chat(db, client, psychic)
    manager = SessionManager()
    manager._load_active_sessions_from_db()
    state = manager.active_sessions[chat.id]

    manager.handle_client_disconnect(chat.id)

    assert state.client_disconnected_at is not None
    assert state.is_grace is False
    assert state.paused_elapsed_seconds == 0  # no meter to freeze
    db.expire_all()
    assert db.get(Chat, chat.id).status == ChatStatus.ACTIVE
    assert chat.id in manager.active_sessions
    assert chat.id not in manager.paused_sessions


# -- 8. The per-minute default is untouched ----------------------------------
def test_per_minute_request_still_runs_the_minute_gate_and_charges_no_message(
    sqlite, monkeypatch
):
    db, _ = sqlite
    assert sm.settings.BILLING_MODE == "per_minute"
    _quiet_request_side_effects(monkeypatch)

    # Below one minute at the reader's rate: the per-minute gate refuses.
    poor, psychic = _people(db, balance=0.0, price=PRICE, price_per_second=RATE)
    http = _client(db, poor, SessionManager(), monkeypatch)
    resp = http.post("/api/chat/request", json={"psychic_id": psychic.id, "message": "hello"})
    assert resp.status_code == 402
    assert resp.json()["detail"].startswith("You need at least")
    assert db.query(Chat).count() == 0

    # Funded: the request goes through and no per-message debit exists.
    rich, psychic2 = _people(db, balance=50.0, price=PRICE, price_per_second=RATE)
    http = _client(db, rich, SessionManager(), monkeypatch)
    resp = http.post("/api/chat/request", json={"psychic_id": psychic2.id, "message": "hello"})
    assert resp.status_code == 201, resp.text
    assert db.query(Chat).count() == 1
    assert _msg_fee_debits(db) == []
    assert db.query(Transaction).count() == 0
    db.refresh(rich)
    assert float(rich.balance) == 50.0


def test_per_minute_pause_on_an_active_chat_still_works(sqlite, monkeypatch):
    """Reuses the session tests' path: start, join (minute 1 charged), then /pause."""
    db, _ = sqlite
    assert sm.settings.BILLING_MODE == "per_minute"
    client, psychic = _people(db, balance=50.0, price=PRICE, price_per_second=RATE)
    chat = Chat(user_id=client.id, psychic_id=psychic.id, status=ChatStatus.REQUESTED)
    db.add(chat)
    db.commit()
    db.add(ChatSession(chat_id=chat.id, status=ChatSessionStatus.REQUESTED))
    db.commit()
    manager = SessionManager()
    asyncio.run(manager.start_session(chat.id))
    asyncio.run(manager.mark_client_joined(chat.id))
    assert db.query(SessionInterval).count() == 1
    # The manager committed ACTIVE through its own session; drop this session's
    # cached REQUESTED copy so the router reads the row as it now is.
    db.expire_all()
    http = _client(db, client, manager, monkeypatch)

    resp = http.post(f"/api/chat/{chat.id}/pause")

    assert resp.status_code == 200, resp.text
    db.expire_all()
    assert db.get(Chat, chat.id).status == ChatStatus.PAUSED
    assert chat.id in manager.paused_sessions
    assert chat.id not in manager.active_sessions


# -- 11. GET /api/billing-mode is public and reports the setting ----------------
def test_billing_mode_endpoint_reports_the_setting(monkeypatch):
    """One route, no auth, both values: the app reads its mode from here once."""
    from app.routers import public_settings as public_settings_router

    test_app = FastAPI()
    test_app.include_router(public_settings_router.router, prefix="/api")
    http = TestClient(test_app)
    for mode in ("per_minute", "per_message"):
        _mode(monkeypatch, mode)
        resp = http.get("/api/billing-mode")
        assert resp.status_code == 200, resp.text
        assert resp.json() == {"billing_mode": mode}


# -- 12. POST /conversation opens a thread with the opener and no charge ----------
def _quiet_reply_side_effects(monkeypatch):
    """Record, instead of running, the two things a paid send would set off:
    the reply queue and the offline queue. /conversation must touch neither."""
    from app.services import offline_replies
    from app.services.ai import reading_single

    calls = {"enqueue": [], "stage": []}

    async def enqueue(chat_id, message_id, **kwargs):
        calls["enqueue"].append((chat_id, message_id))

    def stage(db, chat, message):
        calls["stage"].append(message.id)
        return False

    monkeypatch.setattr(reading_single, "enqueue_reply", enqueue)
    monkeypatch.setattr(offline_replies, "stage_if_offline", stage)
    return calls


def _rows(db):
    return (
        db.query(Chat).count(), db.query(ChatSession).count(),
        db.query(Message).count(), db.query(Transaction).count(),
    )


def test_conversation_opens_with_the_opener_and_charges_nothing(sqlite, monkeypatch):
    from app.enums.author_type import AuthorType
    from app.enums.response_mode import ResponseMode
    from app.services.per_message_start import AUTOMATIC_READER_OPENER

    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    calls = _quiet_reply_side_effects(monkeypatch)
    client, psychic = _people(db, balance=0.0)  # nothing to spend: opening never asks
    manager = SessionManager()
    http = _client(db, client, manager, monkeypatch)

    resp = http.post("/api/chat/conversation", json={"psychic_id": psychic.id})

    assert resp.status_code == 201, resp.text
    body = resp.json()
    chat = db.query(Chat).one()
    session = db.query(ChatSession).one()
    opener = db.query(Message).one()
    assert body == {
        "chat_id": chat.id,
        "created": True,
        "chat_session_id": session.id,
        "status": "ACTIVE",
        "billing_mode": "per_message",
        "client_joined_at": chat.client_joined_at.isoformat(),
        "opener_message_id": opener.id,
        "price_per_message": PRICE,
        "client_balance": 0.0,
    }
    assert chat.status == ChatStatus.ACTIVE
    assert chat.response_mode == ResponseMode.SABRI
    assert session.status == ChatSessionStatus.ACTIVE
    assert (opener.sender_id, opener.author_type, opener.is_system) == (
        psychic.id, AuthorType.SYSTEM, False,
    )
    assert opener.content == AUTOMATIC_READER_OPENER
    assert opener.chat_session_id == session.id
    assert db.query(Transaction).count() == 0
    db.refresh(client)
    assert float(client.balance) == 0.0
    assert calls == {"enqueue": [], "stage": []}
    assert manager.active_sessions[chat.id].session_id == session.id


def test_conversation_again_answers_200_and_creates_nothing(sqlite, monkeypatch):
    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    calls = _quiet_reply_side_effects(monkeypatch)
    client, psychic = _people(db, balance=10.0)
    manager = SessionManager()
    http = _client(db, client, manager, monkeypatch)
    first = http.post("/api/chat/conversation", json={"psychic_id": psychic.id}).json()
    before = _rows(db)
    db.expire_all()
    joined_before = db.get(Chat, first["chat_id"]).client_joined_at

    resp = http.post("/api/chat/conversation", json={"psychic_id": psychic.id})

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["created"] is False
    assert body["chat_id"] == first["chat_id"]
    assert body["chat_session_id"] == first["chat_session_id"]
    assert body["opener_message_id"] is None
    assert body["status"] == "ACTIVE"
    assert _rows(db) == before
    db.expire_all()
    assert db.get(Chat, first["chat_id"]).client_joined_at == joined_before
    assert calls == {"enqueue": [], "stage": []}


def test_conversation_on_an_ended_chat_answers_200_and_revives_nothing(sqlite, monkeypatch):
    """Any status: an ENDED thread with a COMPLETED session is reported as it is.
    Reviving it is the send's business, not the opener's."""
    from app.enums.response_mode import ResponseMode

    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    calls = _quiet_reply_side_effects(monkeypatch)
    client, psychic = _people(db, balance=10.0)
    chat = Chat(
        user_id=client.id, psychic_id=psychic.id,
        status=ChatStatus.ENDED, response_mode=ResponseMode.SABRI,
    )
    db.add(chat)
    db.commit()
    session = ChatSession(chat_id=chat.id, status=ChatSessionStatus.COMPLETED)
    db.add(session)
    db.commit()
    manager = SessionManager()
    http = _client(db, client, manager, monkeypatch)
    before = _rows(db)

    resp = http.post("/api/chat/conversation", json={"psychic_id": psychic.id})

    assert resp.status_code == 200, resp.text
    assert resp.json() == {
        "chat_id": chat.id,
        "created": False,
        "chat_session_id": session.id,
        "status": "ENDED",
        "billing_mode": "per_message",
        "client_joined_at": None,
        "opener_message_id": None,
        "price_per_message": PRICE,
        "client_balance": 10.0,
    }
    db.expire_all()
    assert db.get(Chat, chat.id).status == ChatStatus.ENDED
    assert db.get(Chat, chat.id).client_joined_at is None
    assert db.get(ChatSession, session.id).status == ChatSessionStatus.COMPLETED
    assert _rows(db) == before
    assert manager.active_sessions == {}
    assert calls == {"enqueue": [], "stage": []}


def test_conversation_with_a_second_reader_opens_beside_an_active_one(sqlite, monkeypatch):
    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    _quiet_reply_side_effects(monkeypatch)
    client, first_reader = _people(db, balance=10.0)
    _, second_reader = _people(db, balance=10.0)
    manager = SessionManager()
    http = _client(db, client, manager, monkeypatch)
    first = http.post("/api/chat/conversation", json={"psychic_id": first_reader.id})
    assert first.status_code == 201
    assert db.get(Chat, first.json()["chat_id"]).status == ChatStatus.ACTIVE

    resp = http.post("/api/chat/conversation", json={"psychic_id": second_reader.id})

    assert resp.status_code == 201, resp.text
    assert resp.json()["created"] is True
    assert resp.json()["chat_id"] != first.json()["chat_id"]
    chats = db.query(Chat).filter(Chat.user_id == client.id).all()
    assert sorted(c.psychic_id for c in chats) == sorted([first_reader.id, second_reader.id])
    assert all(c.status == ChatStatus.ACTIVE for c in chats)
    assert db.query(Message).count() == 2  # one opener each
    assert set(manager.active_sessions) == {c.id for c in chats}


def test_request_with_a_second_reader_is_no_longer_refused(sqlite, monkeypatch):
    """The other-reader refusal is gone from start_automatic_conversation itself:
    /request with a message also opens beside an ACTIVE thread and charges it."""
    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    calls = _quiet_reply_side_effects(monkeypatch)
    client, first_reader = _people(db, balance=10.0)
    _, second_reader = _people(db, balance=10.0)
    http = _client(db, client, SessionManager(), monkeypatch)
    assert http.post("/api/chat/conversation", json={"psychic_id": first_reader.id}).status_code == 201

    resp = http.post(
        "/api/chat/request", json={"psychic_id": second_reader.id, "message": "hello"}
    )

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["opener_message_id"] is not None
    question = db.get(Message, body["message_id"])
    assert question.sender_id == client.id
    assert [m.related_message_id for m in _msg_fee_debits(db)] == [question.id]
    assert calls["enqueue"] == [(body["chat_id"], question.id)]


def test_conversation_under_per_minute_answers_409(sqlite, monkeypatch):
    db, _ = sqlite
    _mode(monkeypatch, "per_minute")
    client, psychic = _people(db, balance=10.0)
    http = _client(db, client, SessionManager(), monkeypatch)

    resp = http.post("/api/chat/conversation", json={"psychic_id": psychic.id})

    assert resp.status_code == 409, resp.text
    assert resp.json() == {"detail": "PER_MESSAGE_ONLY"}
    assert _rows(db) == (0, 0, 0, 0)


def test_conversation_with_an_unpriced_reader_is_refused(sqlite, monkeypatch):
    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    client, psychic = _people(db, balance=10.0, price=None)
    http = _client(db, client, SessionManager(), monkeypatch)

    resp = http.post("/api/chat/conversation", json={"psychic_id": psychic.id})

    assert resp.status_code == 402, resp.text
    assert resp.json() == {
        "detail": "READER_UNAVAILABLE",
        "required": None,
        "balance": None,
        "psychic_name": psychic.username,
    }
    assert _rows(db) == (0, 0, 0, 0)


def test_conversation_with_a_non_automatic_chat_is_refused(sqlite, monkeypatch):
    from app.enums.response_mode import ResponseMode

    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    client, psychic = _people(db, balance=10.0)
    chat = Chat(
        user_id=client.id, psychic_id=psychic.id,
        status=ChatStatus.ENDED, response_mode=ResponseMode.HUMAN,
    )
    db.add(chat)
    db.commit()
    http = _client(db, client, SessionManager(), monkeypatch)

    resp = http.post("/api/chat/conversation", json={"psychic_id": psychic.id})

    assert resp.status_code == 402, resp.text
    assert resp.json()["detail"] == "READER_UNAVAILABLE"
    assert _rows(db) == (1, 0, 0, 0)


def test_conversation_by_a_psychic_is_refused(sqlite, monkeypatch):
    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    _, psychic = _people(db, balance=10.0)
    _, other_psychic = _people(db, balance=10.0)
    http = _client(db, psychic, SessionManager(), monkeypatch)

    resp = http.post("/api/chat/conversation", json={"psychic_id": other_psychic.id})

    assert resp.status_code == 403, resp.text
    assert resp.json() == {"detail": "Psychics cannot request chats"}
    assert _rows(db) == (0, 0, 0, 0)


def test_conversation_with_an_unknown_reader_is_404(sqlite, monkeypatch):
    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    client, _ = _people(db, balance=10.0)
    http = _client(db, client, SessionManager(), monkeypatch)

    resp = http.post("/api/chat/conversation", json={"psychic_id": 999_999})

    assert resp.status_code == 404, resp.text
    assert _rows(db) == (0, 0, 0, 0)
