"""Per-message billing: the charge, the balance gate and the refund.

Everything here is dark unless BILLING_MODE is "per_message". The last test pins
the per-minute default so the live path is provably unchanged.
"""

import asyncio
import json

import pytest
from sqlalchemy.exc import IntegrityError

from app.enums.chat_status import ChatStatus
from app.enums.role import Role
from app.enums.transaction_status import TransactionStatus
from app.enums.transaction_type import TransactionType
from app.models import Chat, Message, StardustLot, Transaction
from app.services import stardust_rewards as sr
from app.services.chat.handlers import message_handler as mh
from app.services.chat.handlers.message_handler import MessageHandler
from app.services.transactions import create_debit_transaction, refund_message


class _Settings:
    def __init__(self, mode):
        self.BILLING_MODE = mode


class _FakeWebSocket:
    """Captures exactly what the handler sends the client."""

    def __init__(self):
        self.sent = []

    async def send_json(self, payload):
        self.sent.append(payload)


class _FakeManager:
    def users_in_chat(self, chat_id):
        return set()

    async def send_to_chat(self, message=None, chat_id=None):
        return None


class _FakeNotifications:
    def is_user_connected(self, user_id):
        return False


class _NoLiveSessions:
    """The session manager is a process global that only main.py initialises, so
    tests stand in this empty one: it reports the truth here, that no chat has a
    live per-minute session."""

    active_sessions = {}


def _mode(monkeypatch, mode):
    monkeypatch.setattr(mh, "get_app_settings", lambda: _Settings(mode))


def _stub_delivery(monkeypatch):
    """Silence broadcast/presence/burst so a successful send can run end to end."""
    import app.notification_manager as nm
    import app.routers.chats as chats_router
    import app.services.session_manager as sm
    from app.services.ai import reading_burst

    monkeypatch.setattr(chats_router, "manager", _FakeManager())
    monkeypatch.setattr(nm, "notification_manager", _FakeNotifications())
    monkeypatch.setattr(sm, "get_session_manager", lambda: _NoLiveSessions())

    async def _noop(*args, **kwargs):
        return None

    monkeypatch.setattr(reading_burst, "note_client_message", _noop)


def _people(db, make_user, *, balance=0.0, credit=0.0, price=2.0):
    client = make_user(balance=balance, credit_balance=credit)
    psychic = make_user(role=Role.PSYCHIC)
    psychic.price_per_message = price
    db.commit()
    return client, psychic


def _chat(db, client, psychic, status=ChatStatus.ACTIVE):
    chat = Chat(user_id=client.id, psychic_id=psychic.id, status=status)
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat


def _send(db, chat, sender, content="what do you see"):
    ws = _FakeWebSocket()
    handler = MessageHandler(websocket=ws, db=db, chat_id=chat.id, user_id=sender.id)
    asyncio.run(handler._handle_serialized({"content": content}))
    return ws


def _debits(db):
    return (
        db.query(Transaction)
        .filter(Transaction.transaction_type == TransactionType.DEBIT)
        .all()
    )


# -- 1. The happy path: one message, one debit, balance down by the price -----
def test_a_paid_message_is_persisted_with_exactly_one_matching_debit(
    db, make_user, monkeypatch
):
    _mode(monkeypatch, "per_message")
    _stub_delivery(monkeypatch)
    client, psychic = _people(db, make_user, balance=10.0, price=2.0)
    chat = _chat(db, client, psychic)

    _send(db, chat, client)

    message = db.query(Message).one()
    debit = db.query(Transaction).one()
    assert debit.transaction_type == TransactionType.DEBIT
    assert debit.description == f"Message #{message.id}"
    assert debit.related_message_id == message.id
    assert debit.idempotency_key == f"msg_fee:{message.id}"
    assert float(debit.amount) == 2.0
    db.refresh(client)
    assert float(client.balance) == 8.0  # exactly price_per_message


# -- 2. The database refuses a second charge for the same message ------------
def test_a_second_debit_for_the_same_message_is_refused_by_the_database(
    db, make_user, monkeypatch
):
    _mode(monkeypatch, "per_message")
    _stub_delivery(monkeypatch)
    client, psychic = _people(db, make_user, balance=10.0, price=2.0)
    chat = _chat(db, client, psychic)
    _send(db, chat, client)
    message = db.query(Message).one()

    with pytest.raises(IntegrityError):
        create_debit_transaction(
            db=db,
            user_id=client.id,
            amount=2.0,
            description=f"Message #{message.id}",
            related_message_id=message.id,
            idempotency_key=f"msg_fee:{message.id}",
        )

    assert len(_debits(db)) == 1


# -- 3. Balance below price: refused, nothing persisted, nothing charged -----
def test_balance_below_price_is_refused_and_stores_nothing(db, make_user, monkeypatch):
    _mode(monkeypatch, "per_message")
    client, psychic = _people(db, make_user, balance=0.5, price=2.0)
    chat = _chat(db, client, psychic)

    ws = _send(db, chat, client)

    assert ws.sent == [
        {
            "event": "message_rejected",
            "data": {
                "reason": "INSUFFICIENT_BALANCE",
                "price_per_message": 2.0,
                "balance": 0.5,
            },
        }
    ]
    assert db.query(Message).count() == 0
    assert db.query(Transaction).count() == 0


# -- 4. No per-message price set: the reader is unavailable ------------------
def test_a_reader_with_no_per_message_price_is_unavailable(db, make_user, monkeypatch):
    _mode(monkeypatch, "per_message")
    client, psychic = _people(db, make_user, balance=10.0, price=None)
    chat = _chat(db, client, psychic)

    ws = _send(db, chat, client)

    assert ws.sent == [
        {
            "event": "message_rejected",
            "data": {
                "reason": "READER_UNAVAILABLE",
                "message": "This reader is not available right now.",
            },
        }
    ]
    assert db.query(Message).count() == 0
    assert db.query(Transaction).count() == 0


# -- 5. Outside an ACTIVE reading: refused, and never charged either way -----
def test_a_message_outside_an_active_reading_is_refused_not_charged(
    db, make_user, monkeypatch
):
    """Per-message mode replaces the out-of-session fee entirely: there is no
    path here that quietly bills OUT_OF_SESSION_MESSAGE_FEE instead."""
    _mode(monkeypatch, "per_message")
    client, psychic = _people(db, make_user, balance=10.0, price=2.0)
    chat = _chat(db, client, psychic, status=ChatStatus.REQUESTED)

    ws = _send(db, chat, client)

    assert ws.sent == [
        {
            "event": "message_rejected",
            "data": {
                "reason": "SESSION_NOT_ACTIVE",
                "message": "The reader has not joined yet.",
            },
        }
    ]
    assert db.query(Message).count() == 0
    assert db.query(Transaction).count() == 0
    db.refresh(client)
    assert float(client.balance) == 10.0  # not even the 1.0 out-of-session fee


# -- 6. Atomicity: a failed charge leaves no message behind ------------------
def test_a_failed_charge_rolls_the_message_back_with_it(db, make_user, monkeypatch):
    _mode(monkeypatch, "per_message")
    _stub_delivery(monkeypatch)
    client, psychic = _people(db, make_user, balance=10.0, price=2.0)
    chat = _chat(db, client, psychic)

    import app.services.transactions as tx

    def _explode(**kwargs):
        raise RuntimeError("charge exploded after the message was flushed")

    monkeypatch.setattr(tx, "create_debit_transaction", _explode)

    with pytest.raises(RuntimeError):
        _send(db, chat, client)

    assert db.query(Message).count() == 0
    assert db.query(Transaction).count() == 0


# -- 7. Refund puts every portion back where it came from --------------------
def test_refund_replays_the_receipt_onto_lot_credit_and_paid(db, make_user):
    client = make_user(balance=1.0, credit_balance=0.5)
    sr.credit_earned_stardust(
        db,
        client.id,
        1.5,
        "Reward",
        source="task:test",
        idempotency_key="task:test:1",
        now=sr._utcnow(),
    )
    lot = db.query(StardustLot).one()
    debit = create_debit_transaction(
        db=db,
        user_id=client.id,
        amount=3.0,
        description="Message #77",
        related_message_id=77,
        idempotency_key="msg_fee:77",
    )
    receipt = json.loads(debit.transaction_metadata)
    assert receipt["earned_spent"] == 1.5
    assert receipt["credit_spent"] == 0.5
    assert receipt["paid_spent"] == 1.0
    db.refresh(lot)
    assert float(lot.remaining) == 0.0

    reversal = refund_message(db, 77)

    db.refresh(lot)
    db.refresh(client)
    db.refresh(debit)
    assert float(lot.remaining) == 1.5  # back on the lot it left
    assert float(client.credit_balance) == 0.5
    assert float(client.balance) == 1.0
    assert debit.status == TransactionStatus.REVERSED
    assert reversal.transaction_type == TransactionType.REVERSAL
    assert reversal.idempotency_key == "msg_refund:77"
    assert reversal.description == "Refund for message #77"
    assert float(reversal.amount) == 3.0

    # Second call: nothing left to reverse, nothing moves.
    assert refund_message(db, 77) is None
    db.refresh(lot)
    db.refresh(client)
    assert float(lot.remaining) == 1.5
    assert float(client.credit_balance) == 0.5
    assert float(client.balance) == 1.0
    assert (
        db.query(Transaction)
        .filter(Transaction.transaction_type == TransactionType.REVERSAL)
        .count()
        == 1
    )


# -- 8. A dead lot cannot take it back, so it lands on free credit -----------
def test_a_dead_lot_sends_its_portion_to_credit_instead(db, make_user):
    client = make_user(balance=0.0, credit_balance=0.0)
    sr.credit_earned_stardust(
        db,
        client.id,
        1.5,
        "Reward",
        source="task:test",
        idempotency_key="task:test:2",
        now=sr._utcnow(),
    )
    lot = db.query(StardustLot).one()
    create_debit_transaction(
        db=db,
        user_id=client.id,
        amount=1.5,
        description="Message #88",
        related_message_id=88,
        idempotency_key="msg_fee:88",
    )
    # The lot dies while the debit stands.
    lot.is_expired = True
    db.commit()

    refund_message(db, 88)

    db.refresh(lot)
    db.refresh(client)
    assert float(lot.remaining) == 0.0  # the dead lot is left alone
    assert float(client.credit_balance) == 1.5  # free credit, never paid balance
    assert float(client.balance) == 0.0


# -- 9. Nothing to refund ----------------------------------------------------
def test_refunding_a_message_with_no_debit_returns_none(db, make_user):
    assert refund_message(db, 424242) is None


# -- 10. The per-minute default is untouched ---------------------------------
def test_per_minute_mode_creates_no_per_message_debit(db, make_user, monkeypatch):
    """Default BILLING_MODE. The message saves, and the out-of-session fee logic
    behaves exactly as before: this chat was never accepted, so it is free."""
    _stub_delivery(monkeypatch)
    from app.config import get_app_settings

    assert get_app_settings().BILLING_MODE == "per_minute"
    client, psychic = _people(db, make_user, balance=10.0, price=2.0)
    chat = _chat(db, client, psychic)

    ws = _send(db, chat, client)

    assert db.query(Message).count() == 1
    assert db.query(Transaction).count() == 0
    db.refresh(client)
    assert float(client.balance) == 10.0
    assert not [f for f in ws.sent if f.get("event") == "message_rejected"]
