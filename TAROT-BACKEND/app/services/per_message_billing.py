"""Per-message billing: one charge, one source.

Every client message under BILLING_MODE=per_message is stored and charged
through :func:`charge_client_message`, whether it arrives over the room's
websocket (the message handler) or as the hall question that opens a reading
(/request). The message row and its debit are one transaction, so neither can
exist without the other.

Refusals are one exception, :class:`PerMessageRefusal`, carrying the reason and
exactly the data block the room's ``message_rejected`` frame shows, so a caller
maps it to the wire byte for byte and never re-derives the shape.

This module does not read BILLING_MODE. The caller decides the mode; this is
what a per-message charge is.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.enums.chat_status import ChatStatus
from app.logging_config import get_logger

logger = get_logger(__name__)

SESSION_NOT_ACTIVE = "SESSION_NOT_ACTIVE"
READER_UNAVAILABLE = "READER_UNAVAILABLE"
INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE"


class PerMessageRefusal(Exception):
    """A client message that must not be stored or charged.

    ``reason`` is one of SESSION_NOT_ACTIVE, READER_UNAVAILABLE or
    INSUFFICIENT_BALANCE. ``payload`` is the complete ``data`` block of the
    room's message_rejected frame for that reason, reason included.
    """

    def __init__(self, reason: str, payload: dict):
        super().__init__(reason)
        self.reason = reason
        self.payload = payload


def require_active_session(chat) -> None:
    """A message is only chargeable inside an ACTIVE reading."""
    if chat.status != ChatStatus.ACTIVE:
        raise PerMessageRefusal(
            SESSION_NOT_ACTIVE,
            {
                "reason": SESSION_NOT_ACTIVE,
                "message": "The reader has not joined yet.",
            },
        )


def price_of_reader(psychic) -> Optional[float]:
    """A reader's per-message price rounded to 2dp, or None when unset or not
    positive. Rounding comes first so a sub-penny price (0.004 -> 0.0) is
    treated as unset by the same rule: zero or below is unusable configuration,
    not a free reader, because the ledger refuses a non-positive debit.

    Takes the reader's User row, so /request can price a reading before any
    chat exists."""
    raw = psychic.price_per_message if psychic is not None else None
    if raw is None:
        return None
    price = round(float(raw), 2)
    return price if price > 0 else None


def price_per_message(chat) -> Optional[float]:
    """The same figure read off a chat's reader."""
    return price_of_reader(chat.psychic if chat is not None else None)


def require_priced_reader(chat, *, log_context: Optional[dict] = None) -> float:
    price = price_per_message(chat)
    if price is None:
        logger.warning(
            "per_message_price_missing",
            chat_id=chat.id,
            psychic_id=chat.psychic_id,
            raw_price=chat.psychic.price_per_message if chat.psychic else None,
            **(log_context or {}),
        )
        raise PerMessageRefusal(
            READER_UNAVAILABLE,
            {
                "reason": READER_UNAVAILABLE,
                "message": "This reader is not available right now.",
            },
        )
    return price


def _insufficient(price: float, balance: float) -> PerMessageRefusal:
    return PerMessageRefusal(
        INSUFFICIENT_BALANCE,
        {
            "reason": INSUFFICIENT_BALANCE,
            "price_per_message": price,
            "balance": balance,
        },
    )


def require_affordable(db: Session, author, price: float, *, chat_id=None) -> float:
    """The balance gate. Returns the spendable balance it checked."""
    from app.services.stardust_rewards import get_spendable_stardust

    balance = round(get_spendable_stardust(db, author), 2)
    if balance < price:
        logger.info(
            "per_message_rejected_insufficient_balance",
            chat_id=chat_id,
            user_id=author.id,
            price_per_message=price,
            balance=balance,
        )
        raise _insufficient(price, balance)
    return balance


async def charge_client_message(
    db: Session,
    chat,
    text: str,
    author,
    commit: bool = True,
    message=None,
):
    """Store ``text`` as ``author``'s message in ``chat`` and charge it, as one
    transaction. Returns ``(message, price)``.

    ``message``: an already-flushed row to charge instead of storing a new one.
    /request uses this, because req_start_chat writes the hall question itself.

    ``commit=False`` leaves the commit to the caller so the charge can share a
    larger unit of work (again /request, whose chat row must vanish with a
    refused charge). A refusal raised from here has already rolled the session
    back, so nothing of the message or the charge survives it.
    """
    from app.exceptions.transactions import InsufficientBalanceError
    from app.services.chats import save_message
    from app.services.stardust_rewards import get_spendable_stardust
    from app.services.transactions import create_debit_transaction

    price = require_priced_reader(chat, log_context={"user_id": author.id})
    require_affordable(db, author, price, chat_id=chat.id)

    try:
        if message is None:
            message = await save_message(db, {"content": text}, author, chat, commit=False)
        db.flush()
        create_debit_transaction(
            db=db,
            user_id=author.id,
            amount=price,
            description=f"Message #{message.id}",
            related_chat_id=chat.id,
            related_message_id=message.id,
            idempotency_key=f"msg_fee:{message.id}",
            metadata={"price_per_message": price, "psychic_id": chat.psychic_id},
            commit=False,
        )
        if commit:
            db.commit()
    except InsufficientBalanceError:
        # Lost a race between the gate and the charge. Rolling back removes the
        # message row too, so she is never left with a sent message she did not
        # pay for.
        db.rollback()
        balance = round(get_spendable_stardust(db, author), 2)
        logger.info(
            "per_message_insufficient_balance_at_charge",
            chat_id=chat.id,
            user_id=author.id,
            price_per_message=price,
            balance=balance,
        )
        raise _insufficient(price, balance)
    except Exception:
        db.rollback()
        raise

    logger.info(
        "per_message_fee_charged",
        chat_id=chat.id,
        user_id=author.id,
        message_id=message.id,
        fee=price,
    )
    return message, price


def refund_unanswered_request(db: Session, chat_id: int):
    """Give back the hall question's charge when a request ends before any reader
    reply. The reply test is a non-system message from the reader NEWER than the
    hall question, so a chat reused for a second reading (whose earlier replies
    are still on it) refunds its new, unanswered question too. Returns the
    reversal row, or None when there is a reply, no question, or nothing left to
    refund (already reversed). Never raises for a missing chat."""
    from app.models import Chat, Message
    from app.services.transactions import refund_message

    chat = db.get(Chat, chat_id)
    if chat is None:
        return None
    hall_question = (
        db.query(Message)
        .filter(
            Message.chat_id == chat_id,
            Message.sender_id == chat.user_id,
            Message.is_system.is_(False),
        )
        .order_by(Message.id.desc())
        .first()
    )
    if hall_question is None:
        return None
    replied = (
        db.query(Message.id)
        .filter(
            Message.chat_id == chat_id,
            Message.sender_id == chat.psychic_id,
            Message.is_system.is_(False),
            Message.id > hall_question.id,
        )
        .first()
    )
    if replied is not None:
        logger.info(
            "per_message_request_not_refunded",
            chat_id=chat_id,
            message_id=hall_question.id,
            reason="reader_replied",
        )
        return None
    reversal = refund_message(db, hall_question.id)
    if reversal is None:
        return None
    logger.info(
        "per_message_request_refunded",
        chat_id=chat_id,
        message_id=hall_question.id,
        reversal_id=reversal.id,
        amount=round(float(reversal.amount), 2),
    )
    return reversal
