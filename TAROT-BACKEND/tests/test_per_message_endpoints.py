"""Per-message billing: the endpoints.

/request charges the hall question as message one. The five clock-only endpoints
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


# -- 1. /request charges the hall question as message one --------------------
def test_request_stores_and_charges_the_question_as_message_one(sqlite, monkeypatch):
    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    _quiet_request_side_effects(monkeypatch)
    client, psychic = _people(db, balance=10.0)
    http = _client(db, client, SessionManager(), monkeypatch)

    resp = http.post(
        "/api/chat/request",
        json={"psychic_id": psychic.id, "message": "will my ex come back"},
    )

    assert resp.status_code == 201, resp.text
    chat = db.query(Chat).one()
    assert chat.status == ChatStatus.REQUESTED
    message = db.query(Message).filter(Message.is_system.is_(False)).one()
    assert message.sender_id == client.id
    assert message.content == "will my ex come back"
    debit = db.query(Transaction).one()
    assert debit.transaction_type == TransactionType.DEBIT
    assert debit.description == f"Message #{message.id}"
    assert debit.related_message_id == message.id
    assert debit.idempotency_key == f"msg_fee:{message.id}"
    assert float(debit.amount) == PRICE
    db.refresh(client)
    assert float(client.balance) == 10.0 - PRICE


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

    assert resp.status_code == 402
    assert resp.json() == {
        "detail": "READER_UNAVAILABLE",
        "required": None,
        "balance": 10.0,
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
