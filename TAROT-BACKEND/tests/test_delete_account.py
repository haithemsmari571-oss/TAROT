"""DELETE /api/profile/me: only a per-minute reading in progress refuses the delete.

A per-message thread is created ACTIVE and never closes, so it no longer
counts as a reading; the delete keeps it as it is under the anonymised
identity. The real profile router behind a FastAPI test client on the
in-memory database, the harness of tests/test_profile_picture.py.

The delete also closes what the screen says is lost: her messages still
waiting in the offline queue are forfeited, her earned lots are written off,
and her stated gender goes back to NOT_STATED.
"""

import asyncio
import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import or_
from sqlalchemy.orm import sessionmaker
from structlog.testing import capture_logs

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.chat_status import ChatStatus
from app.enums.gender import Gender
from app.enums.message_status import MessageStatus
from app.enums.response_mode import ResponseMode
from app.enums.role import Role
from app.enums.transaction_status import TransactionStatus
from app.enums.transaction_type import TransactionType
from app.enums.user_status import UserStatus
from app.models import Chat, Message, Transaction, User
from app.routers import profile as profile_router
from app.routers import transactions as transactions_router
from app.services import offline_replies
from app.services.per_message_billing import charge_client_message
from app.services.reader_hours import UK_TIME, reader_availability
from app.services.stardust_rewards import credit_earned_stardust

READING_IN_PROGRESS = (
    "You have a reading in progress. End it (or let it finish) before deleting your account."
)
PRICE = 2.5


def _client(db, user) -> TestClient:
    app = FastAPI()
    app.include_router(profile_router.router, prefix="/api/profile")
    app.include_router(transactions_router.router, prefix="/api/transactions")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app, raise_server_exceptions=False)


def _active_chat(db, client, reader, response_mode) -> Chat:
    chat = Chat(
        user_id=client.id,
        psychic_id=reader.id,
        status=ChatStatus.ACTIVE,
        response_mode=response_mode,
    )
    db.add(chat)
    db.commit()
    return chat


@pytest.mark.parametrize(
    "response_mode",
    [
        # Automatic, as every thread opens.
        ResponseMode.SABRI,
        # Hybrid: the owner answers it from AV Admin (owner_messaging.MODES).
        ResponseMode.HYBRID,
    ],
)
def test_client_with_an_active_per_message_thread_can_delete(db, make_user, monkeypatch, response_mode):
    monkeypatch.setattr(profile_router.settings, "BILLING_MODE", "per_message")
    client = make_user(balance=5, credit_balance=3)
    reader = make_user(role=Role.PSYCHIC)
    chat = _active_chat(db, client, reader, response_mode)

    response = _client(db, client).delete("/api/profile/me")

    assert response.status_code == 200, response.text
    assert response.json() == {"message": "Account deleted"}
    db.refresh(client)
    assert client.status == UserStatus.SUSPENDED
    assert client.email == f"deleted-{client.id}@deleted.askvalentina.co.uk"
    assert client.username == f"deleted-user-{client.id}"
    assert float(client.balance) == 0
    assert float(client.credit_balance) == 0
    db.refresh(chat)
    assert (chat.user_id, chat.psychic_id, chat.status, chat.response_mode) == (
        client.id, reader.id, ChatStatus.ACTIVE, response_mode,
    )


@pytest.mark.parametrize(
    "billing_mode, response_mode",
    [
        # A per-minute chat left from before per-message billing.
        ("per_message", ResponseMode.HUMAN),
        # In per-minute billing every chat is a per-minute reading, SABRI included.
        ("per_minute", ResponseMode.SABRI),
    ],
)
def test_client_with_an_active_per_minute_chat_still_gets_409(
    db, make_user, monkeypatch, billing_mode, response_mode
):
    monkeypatch.setattr(profile_router.settings, "BILLING_MODE", billing_mode)
    client = make_user(balance=5)
    reader = make_user(role=Role.PSYCHIC)
    chat = _active_chat(db, client, reader, response_mode)
    email = client.email

    response = _client(db, client).delete("/api/profile/me")

    assert response.status_code == 409, response.text
    assert response.json() == {"detail": READING_IN_PROGRESS}
    db.refresh(client)
    assert client.status == UserStatus.ACTIVE
    assert client.email == email
    assert float(client.balance) == 5
    db.refresh(chat)
    assert chat.status == ChatStatus.ACTIVE


# ── the offline queue: her waiting messages are forfeited, not refunded ──────
def _naive_utc_now():
    """The queue's clock without a zone, as test_per_message_journey.py:505-509:
    SQLite hands DateTime columns back naive."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _pending_as_text(db):
    """offline_replies._pending with its state test read as text. SQLite renders
    the JSON path as a quoted string and never selects (test_per_message_journey.py
    :547-550), so the real sweep would find nothing, forfeited or not."""
    pending = [
        Transaction.transaction_metadata.like(f'%"state": "{state}"%')
        for state in offline_replies.PENDING_STATES
    ]
    return (
        db.query(Transaction, Message, Chat)
        .join(Message, Message.id == Transaction.related_message_id)
        .join(Chat, Chat.id == Message.chat_id)
        .filter(
            Transaction.transaction_type == TransactionType.DEBIT,
            Transaction.status == TransactionStatus.COMPLETED,
            or_(*pending),
        )
        .order_by(Message.created_at, Message.id)
    )


@pytest.fixture
def queue(db, monkeypatch):
    """The real queue, claim and sweep, on the test database."""
    local = sessionmaker(bind=db.get_bind(), expire_on_commit=False)
    monkeypatch.setattr(offline_replies, "SessionLocal", local)
    monkeypatch.setattr(offline_replies, "_now", _naive_utc_now)
    monkeypatch.setattr(offline_replies, "_pending", _pending_as_text)


def _offline_hours():
    """UK hours that do not include now (test_per_message_journey.py:498-502)."""
    now_uk = datetime.now(UK_TIME)
    opening = (now_uk + timedelta(hours=2)).time().replace(second=0, microsecond=0)
    closing = (now_uk + timedelta(hours=3)).time().replace(second=0, microsecond=0)
    return opening, closing


def _send_while_offline(db, chat, client, text) -> Message:
    """Charged and queued in one commit, as per_message_start.py:166-181 does it."""
    message = Message(
        chat_id=chat.id, sender_id=client.id, content=text, status=MessageStatus.SENT
    )
    db.add(message)
    db.flush()
    asyncio.run(charge_client_message(db, chat, text, client, commit=False, message=message))
    assert offline_replies.stage_if_offline(db, chat, message)
    db.commit()
    return message


def _queue_state(db, message_id) -> str:
    db.expire_all()
    debit = (
        db.query(Transaction)
        .filter(Transaction.idempotency_key == f"msg_fee:{message_id}")
        .one()
    )
    return json.loads(debit.transaction_metadata)[offline_replies.QUEUE_KEY]["state"]


def test_delete_forfeits_her_waiting_messages_and_the_sweep_neither_refunds_nor_claims_them(
    db, make_user, monkeypatch, queue
):
    monkeypatch.setattr(profile_router.settings, "BILLING_MODE", "per_message")
    client = make_user(balance=20)
    # She sends two messages, so her email is confirmed (ROUND38,
    # tests/test_email_confirmation_gate.py).
    client.is_verified = True
    other = make_user(balance=20)
    reader = make_user(role=Role.PSYCHIC)
    reader.price_per_message = PRICE
    reader.online_from, reader.online_to = _offline_hours()
    db.commit()
    assert reader_availability(reader.online_from, reader.online_to).is_online is False
    hers = _active_chat(db, client, reader, ResponseMode.SABRI)
    theirs = _active_chat(db, other, reader, ResponseMode.SABRI)
    claimed = _send_while_offline(db, hers, client, "are you there")
    waiting = _send_while_offline(db, hers, client, "hello?")
    control = _send_while_offline(db, theirs, other, "still there?")

    # The reader comes online and a worker claims her oldest message.
    reader.online_from = reader.online_to = None
    db.commit()
    chat_id, message_id, token = offline_replies.claim_next(reader.id)
    assert (chat_id, message_id) == (hers.id, claimed.id)
    assert [_queue_state(db, m.id) for m in (claimed, waiting, control)] == [
        "delivering", "queued", "queued",
    ]

    with capture_logs() as logs:
        response = _client(db, client).delete("/api/profile/me")

    assert response.status_code == 200, response.text
    assert [_queue_state(db, m.id) for m in (claimed, waiting, control)] == [
        "forfeited", "forfeited", "queued",
    ]
    # 15 left on the account plus her two waiting messages.
    [deleted] = [entry for entry in logs if entry["event"] == "account_self_deleted"]
    assert (
        deleted["forfeited_balance"],
        deleted["forfeited_queued"],
        deleted["forfeited_queued_messages"],
    ) == (15 + 2 * PRICE, 2 * PRICE, 2)
    # Her debits stand, and the worker holding the lease stops at its next checkpoint.
    debits = db.query(Transaction).filter(
        Transaction.user_id == client.id, Transaction.transaction_type == TransactionType.DEBIT
    ).all()
    assert [t.status for t in debits] == [TransactionStatus.COMPLETED] * 2
    assert offline_replies.renew(claimed.id, token) is False
    assert offline_replies.save_reply(claimed.id, token, ["a reply"]) is False

    # Inside the 24 hours, the reader online: the sweep claims the other client's message only.
    claims = offline_replies.sweep()
    assert [(c, m) for c, m, _ in claims] == [(theirs.id, control.id)]

    # Past the 24 hours with no reply: the sweep refunds the other client's message only.
    db.expire_all()
    for message in (claimed, waiting, control):
        db.get(Message, message.id).created_at = (
            _naive_utc_now() - offline_replies.OFFLINE_REPLY_TIMEOUT - timedelta(minutes=1)
        )
    db.commit()
    offline_replies.sweep()
    assert offline_replies.refund_queued(waiting.id, expired=True) is None
    reversals = db.query(Transaction).filter(
        Transaction.transaction_type == TransactionType.REVERSAL
    ).all()
    assert [(t.user_id, t.idempotency_key) for t in reversals] == [
        (other.id, f"msg_refund:{control.id}")
    ]
    assert [_queue_state(db, m.id) for m in (claimed, waiting)] == ["forfeited", "forfeited"]
    assert float(db.get(User, client.id).balance) == 0
    assert float(db.get(User, other.id).balance) == 20


# ── earned Stardust: written off the way the 30-day expiry does it ──────────
def test_delete_writes_off_her_earned_stardust_as_the_expiry_does(db, make_user, monkeypatch):
    monkeypatch.setattr(profile_router.settings, "BILLING_MODE", "per_message")
    client = make_user(balance=5, credit_balance=3)
    other = make_user()
    lot = credit_earned_stardust(db, client.id, 4, description="Daily card pull", source="test")
    other_lot = credit_earned_stardust(db, other.id, 2, description="Daily card pull", source="test")
    http = _client(db, client)
    assert http.get("/api/transactions/me/balance").json()["stardust_total"] == 12

    assert http.delete("/api/profile/me").status_code == 200

    balance = http.get("/api/transactions/me/balance").json()
    assert (balance["stardust_total"], balance["earned_balance"], balance["balance"]) == (0, 0, 0)
    [expire] = db.query(Transaction).filter(
        Transaction.transaction_type == TransactionType.EXPIRE
    ).all()
    assert (expire.user_id, float(expire.amount), expire.status, expire.description) == (
        client.id, 4.0, TransactionStatus.COMPLETED, "Earned Stardust forfeited (account deleted)",
    )
    assert json.loads(expire.transaction_metadata)["lot_id"] == lot.id
    db.refresh(lot)
    db.refresh(other_lot)
    assert (float(lot.remaining), lot.is_expired) == (0, True)
    assert (float(other_lot.remaining), other_lot.is_expired) == (2, False)


# ── gender: back to NOT_STATED; client_code kept ─────────────────────────────
def test_delete_sets_gender_to_not_stated_and_keeps_the_client_code(db, make_user, monkeypatch):
    monkeypatch.setattr(profile_router.settings, "BILLING_MODE", "per_message")
    client = make_user()
    client.gender = Gender.WOMAN
    db.commit()
    client_code = client.client_code
    assert client_code

    assert _client(db, client).delete("/api/profile/me").status_code == 200

    db.refresh(client)
    assert client.gender == Gender.NOT_STATED
    assert client.client_code == client_code
