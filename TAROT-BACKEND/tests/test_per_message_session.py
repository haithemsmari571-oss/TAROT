"""Per-message billing: the session carries no clock.

In per_message mode a reading is opened, joined and ended without a time budget,
a minimum balance, an interval, a minute charge or anything for the monitor to
run. These drive the real SessionManager on an in-memory SQLite database that
also stands in for SessionLocal, the pattern of tests/test_reflection.py.

The last test pins the per-minute default, where the first interval and minute 1
must still appear exactly as they always have.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 - registers every model on Base.metadata
from app.enums.chat_session_status import ChatSessionStatus
from app.enums.chat_status import ChatStatus
from app.enums.chat_termination_reason import ChatTerminationReason
from app.enums.role import Role
from app.enums.transaction_status import TransactionStatus
from app.enums.transaction_type import TransactionType
from app.models import Chat, ChatSession, Message, SessionInterval, Transaction, User
from app.models.base import Base
from app.routers import chats as chats_router
from app.services import session_manager as sm
from app.services.session_manager import SessionManager

RATE = 1 / 60  # one point per minute, so a "minute" is one unit of balance
PRICE_PER_MESSAGE = 2.0


@pytest.fixture
def sqlite(monkeypatch):
    """An in-memory database that ALSO stands in for app.database.client.SessionLocal,
    because SessionManager opens its own sessions per operation."""
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
    """Force the billing mode everywhere it is read. session_manager and the chats
    router both hold the one lru_cached settings object."""
    monkeypatch.setattr(sm.settings, "BILLING_MODE", mode)
    monkeypatch.setattr(chats_router.settings, "BILLING_MODE", mode)


def _requested_reading(db, *, balance=0.0, price_per_message=PRICE_PER_MESSAGE):
    """A chat that has been requested and is waiting for the reader to accept."""
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
        price_per_second=RATE,
        price_per_message=price_per_message,
    )
    db.add_all([client, psychic])
    db.commit()
    chat = Chat(user_id=client.id, psychic_id=psychic.id, status=ChatStatus.REQUESTED)
    db.add(chat)
    db.commit()
    session = ChatSession(chat_id=chat.id, status=ChatSessionStatus.REQUESTED)
    db.add(session)
    db.commit()
    return chat, session, client, psychic


async def _one_monitor_pass(manager):
    """Run exactly one pass of the real monitor loop."""
    manager._running = True
    task = asyncio.create_task(manager._monitor_sessions())
    await asyncio.sleep(0.3)  # the first pass runs before the loop's sleep
    manager._running = False
    task.cancel()
    try:
        await task
    except (asyncio.CancelledError, Exception):  # noqa: BLE001
        pass


def _minute_debits(db):
    return db.query(Transaction).filter(Transaction.description.contains("Minute")).all()


# -- 1. Opening and joining a clockless reading ------------------------------
@pytest.mark.parametrize("balance", [0.0, 50.0])
def test_start_and_join_build_no_clock(sqlite, monkeypatch, balance):
    """Any balance, including nothing at all: the reading opens. Balance is the
    message gate's business from here on, not the session's."""
    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    chat, session, client, psychic = _requested_reading(db, balance=balance)
    manager = SessionManager()

    asyncio.run(manager.start_session(chat.id))
    asyncio.run(manager.mark_client_joined(chat.id))

    db.expire_all()
    assert db.get(ChatSession, session.id).status == ChatSessionStatus.ACTIVE
    assert db.get(Chat, chat.id).status == ChatStatus.ACTIVE
    assert db.get(Chat, chat.id).client_joined_at is not None

    # No timer segments, and nothing was charged by the clock.
    assert db.query(SessionInterval).count() == 0
    assert _minute_debits(db) == []
    assert db.query(Transaction).count() == 0

    # The state the monitor would read carries no clock at all: no interval to
    # bill against, no seconds budget, no minutes charged.
    state = manager.active_sessions[chat.id]
    assert state.interval_id is None
    assert state.max_session_duration_seconds == 0
    assert state.minutes_charged == 0


# -- 2. The monitor leaves a clockless reading alone -------------------------
def test_the_monitor_charges_and_expires_nothing(sqlite, monkeypatch):
    """Balance at zero and the disconnect window long gone: under per-minute
    rules this session would be charged, graced or ended. Here nothing happens."""
    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    chat, session, client, psychic = _requested_reading(db, balance=0.0)
    manager = SessionManager()
    asyncio.run(manager.start_session(chat.id))
    asyncio.run(manager.mark_client_joined(chat.id))

    state = manager.active_sessions[chat.id]
    state.started_at = datetime.now() - timedelta(hours=2)
    state.client_disconnected_at = datetime.now() - timedelta(hours=2)

    asyncio.run(_one_monitor_pass(manager))

    db.expire_all()
    assert db.query(SessionInterval).count() == 0
    assert db.query(Transaction).count() == 0
    assert db.get(Chat, chat.id).status == ChatStatus.ACTIVE
    assert db.get(ChatSession, session.id).status == ChatSessionStatus.ACTIVE
    assert chat.id not in manager.paused_sessions
    assert chat.id in manager.active_sessions  # still open, not ended
    assert manager.active_sessions[chat.id].is_grace is False


# -- 3. What she actually paid is the sum of her message charges -------------
def test_end_session_final_cost_is_the_unreversed_message_debits(sqlite, monkeypatch):
    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    chat, session, client, psychic = _requested_reading(db, balance=100.0)
    manager = SessionManager()
    asyncio.run(manager.start_session(chat.id))
    asyncio.run(manager.mark_client_joined(chat.id))

    # Three charged messages, one of them refunded.
    for i in range(3):
        message = Message(chat_id=chat.id, sender_id=client.id, content=f"m{i}")
        db.add(message)
        db.commit()
        db.add(
            Transaction(
                user_id=client.id,
                transaction_type=TransactionType.DEBIT,
                amount=2.0,
                balance_before=100.0,
                balance_after=98.0,
                status=(
                    TransactionStatus.REVERSED if i == 2 else TransactionStatus.COMPLETED
                ),
                description=f"Message #{message.id}",
                related_chat_id=chat.id,
                related_message_id=message.id,
                idempotency_key=f"msg_fee:{message.id}",
            )
        )
        db.commit()

    ended = {}

    async def _capture(chat_id, reason, final_info):
        ended["final_info"] = final_info

    monkeypatch.setattr(manager, "_broadcast_session_ended", _capture)

    asyncio.run(manager.end_session(chat.id, ChatTerminationReason.MANUAL_EXIT))

    assert ended["final_info"].estimated_cost == 4.0  # the reversed one does not count
    db.expire_all()
    assert db.get(ChatSession, session.id).status == ChatSessionStatus.COMPLETED
    assert db.get(Chat, chat.id).status == ChatStatus.ENDED
    assert db.query(SessionInterval).count() == 0


# -- 4. The payloads report no clock -----------------------------------------
CLOCK_FIELDS = (
    "elapsed_seconds",
    "estimated_cost",
    "remaining_seconds",
    "remaining_minutes",
    "minutes_charged",
)


def test_session_time_and_details_send_clock_fields_as_null(sqlite, monkeypatch):
    db, _ = sqlite
    _mode(monkeypatch, "per_message")
    chat, session, client, psychic = _requested_reading(db, balance=30.0)
    manager = SessionManager()
    asyncio.run(manager.start_session(chat.id))
    info = asyncio.run(manager.mark_client_joined(chat.id))

    live = chats_router._session_info_json(info, chat=chat, db=db)
    idle = chats_router._no_session_json(chat, db=db)

    for shape, name in ((live, "live"), (idle, "idle")):
        for field in CLOCK_FIELDS:
            assert field in shape, f"{name} dropped {field}"
            assert shape[field] is None, f"{name} {field} was {shape[field]!r}"
        assert shape["billing_mode"] == "per_message"
        assert shape["price_per_message"] == PRICE_PER_MESSAGE
        assert shape["balance"] is not None
    assert live["total_seconds"] is None

    # The details payload never carried a clock figure, so there is none to null.
    billing = chats_router._billing_fields(db, chat)
    assert billing["billing_mode"] == "per_message"
    assert billing["price_per_message"] == PRICE_PER_MESSAGE
    assert not set(CLOCK_FIELDS) & set(billing)


# -- 5. The per-minute default still builds its clock ------------------------
def test_per_minute_mode_still_creates_the_interval_and_charges_minute_one(
    sqlite, monkeypatch
):
    """Default BILLING_MODE. This is the behaviour the whole change must not
    disturb: joining creates the first interval and charges minute 1 upfront."""
    db, _ = sqlite
    assert sm.settings.BILLING_MODE == "per_minute"
    chat, session, client, psychic = _requested_reading(db, balance=50.0)
    manager = SessionManager()

    asyncio.run(manager.start_session(chat.id))
    asyncio.run(manager.mark_client_joined(chat.id))

    db.expire_all()
    interval = db.query(SessionInterval).one()  # exactly one, the initial start
    assert interval.session_id == session.id
    assert interval.is_billed is True

    minute_debits = _minute_debits(db)
    assert len(minute_debits) == 1
    assert minute_debits[0].description == f"Session #{session.id} - Minute 1"
    assert float(minute_debits[0].amount) == 1.0  # RATE * 60

    state = manager.active_sessions[chat.id]
    assert state.interval_id == interval.id
    assert state.minutes_charged == 1
    assert state.max_session_duration_seconds > 0
    db.refresh(client)
    assert float(client.balance) == 49.0
