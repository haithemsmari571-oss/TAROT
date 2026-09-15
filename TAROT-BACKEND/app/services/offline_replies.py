"""Durable per-message offline replies, carried by the existing debit receipt.

Queue metadata is committed with the original charge. A fenced lease prevents
two workers publishing the same reply; each bubble and its checkpoint commit
together so a restarted worker resumes after the last stored bubble.
"""

import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import JSON, cast

from app.database.client import SessionLocal
from app.enums.message_status import MessageStatus
from app.enums.response_mode import ResponseMode
from app.enums.transaction_status import TransactionStatus
from app.enums.transaction_type import TransactionType
from app.models import Chat, Message, Transaction, User
from app.services.reader_hours import reader_availability

OFFLINE_REPLY_TIMEOUT = timedelta(hours=24)
LEASE_DURATION = timedelta(minutes=5)
QUEUE_KEY = "offline_reply"
PENDING_STATES = ("queued", "delivering")


def _now():
    return datetime.now(timezone.utc)


def _metadata(debit):
    return json.loads(debit.transaction_metadata or "{}")


def _write(debit, queue):
    metadata = _metadata(debit)
    metadata[QUEUE_KEY] = queue
    debit.transaction_metadata = json.dumps(metadata)


def _pending(db):
    return (
        db.query(Transaction, Message, Chat)
        .join(Message, Message.id == Transaction.related_message_id)
        .join(Chat, Chat.id == Message.chat_id)
        .filter(
            Transaction.transaction_type == TransactionType.DEBIT,
            Transaction.status == TransactionStatus.COMPLETED,
            cast(Transaction.transaction_metadata, JSON)[QUEUE_KEY]["state"].as_string().in_(PENDING_STATES),
        )
        .order_by(Message.created_at, Message.id)
    )


def _debit(db, message_id, *, lock=False):
    query = db.query(Transaction).filter(
        Transaction.idempotency_key == f"msg_fee:{message_id}"
    ).populate_existing()
    return (query.with_for_update() if lock else query).first()


def is_queued(db, message_id):
    debit = _debit(db, message_id)
    return debit is not None and QUEUE_KEY in _metadata(debit)


def stage_if_offline(db, chat, message):
    """No commit or charge here; online sends keep their immediate reply path."""
    if chat.response_mode != ResponseMode.SABRI:
        return False
    debit = _debit(db, message.id)
    if debit is None or debit.status != TransactionStatus.COMPLETED:
        return False
    if QUEUE_KEY in _metadata(debit):
        return True
    reader = db.query(User).filter(User.id == chat.psychic_id).populate_existing().one()
    online = reader_availability(reader.online_from, reader.online_to).is_online
    if online:
        return False
    _write(debit, {"state": "queued", "reply_ids": []})
    message.status = MessageStatus.DELIVERED
    return True


def _owned(db, message_id, token):
    debit = _debit(db, message_id, lock=True)
    if debit is None or debit.status != TransactionStatus.COMPLETED:
        return None, None
    queue = _metadata(debit).get(QUEUE_KEY, {})
    if queue.get("state") != "delivering" or queue.get("token") != token:
        return None, None
    return debit, queue


def claim_next(reader_id):
    """Claim only the reader's oldest outstanding message, across all chats."""
    with SessionLocal() as db:
        # Serialize claims for one reader, including across backend processes.
        reader = db.query(User).filter(User.id == reader_id).with_for_update().one()
        if not reader_availability(reader.online_from, reader.online_to).is_online:
            return None
        row = _pending(db).filter(Chat.psychic_id == reader_id).first()
        if row is None:
            return None
        debit, message, chat = row
        debit = _debit(db, message.id, lock=True)
        queue = _metadata(debit)[QUEUE_KEY]
        if debit.status != TransactionStatus.COMPLETED or queue["state"] not in PENDING_STATES:
            return None
        now = _now()
        if not queue["reply_ids"] and message.created_at <= now - OFFLINE_REPLY_TIMEOUT:
            return None  # Expiry is handled before any wake claims.
        if queue.get("lease_until") and datetime.fromisoformat(queue["lease_until"]) > now:
            return None
        token = uuid4().hex
        queue.update(state="delivering", token=token, lease_until=(now + LEASE_DURATION).isoformat())
        _write(debit, queue)
        db.commit()
        return chat.id, message.id, token


def renew(message_id, token):
    with SessionLocal() as db:
        debit, queue = _owned(db, message_id, token)
        if debit is None:
            return False
        queue["lease_until"] = (_now() + LEASE_DURATION).isoformat()
        _write(debit, queue)
        db.commit()
        return True


def release(message_id, token):
    with SessionLocal() as db:
        debit, queue = _owned(db, message_id, token)
        if debit is not None:
            queue.update(state="queued", lease_until=None, token=None)
            _write(debit, queue)
            db.commit()


def receipt(message_id, token, event):
    with SessionLocal() as db:
        debit, queue = _owned(db, message_id, token)
        if debit is None:
            return False
        message = db.get(Message, message_id)
        if event == "message_seen":
            message.status = MessageStatus.READ
        elif event == "message_delivered" and message.status != MessageStatus.READ:
            message.status = MessageStatus.DELIVERED
        queue.setdefault(event + "_at", _now().isoformat())
        _write(debit, queue)
        db.commit()
        return True


def saved_reply(message_id, token):
    with SessionLocal() as db:
        debit, queue = _owned(db, message_id, token)
        return queue if debit is not None else None


def save_reply(message_id, token, bubbles):
    with SessionLocal() as db:
        debit, queue = _owned(db, message_id, token)
        if debit is None:
            return False
        queue["bubbles"] = bubbles
        _write(debit, queue)
        db.commit()
        return True


def persist_bubble(db, chat, text, message_id, token, position):
    """Fence refunds/reclaims and checkpoint the message in the SAME commit."""
    from app.services.chats import prepare_ai_message

    debit, queue = _owned(db, message_id, token)
    if debit is None or position != len(queue["reply_ids"]):
        return None
    message = prepare_ai_message(db, chat, text)
    db.flush()
    queue["reply_ids"].append(message.id)
    if len(queue["reply_ids"]) == len(queue["bubbles"]):
        queue.update(state="delivered", completed_at=_now().isoformat(), lease_until=None)
    _write(debit, queue)
    return message


def refund_queued(message_id, *, token=None, expired=False):
    """Use the existing bucket-preserving, idempotent message reversal."""
    from app.services.transactions import refund_message

    with SessionLocal() as db:
        debit = _debit(db, message_id, lock=True)
        if debit is None or debit.status != TransactionStatus.COMPLETED:
            return None
        queue = _metadata(debit).get(QUEUE_KEY)
        if not queue or queue["state"] not in PENDING_STATES or queue["reply_ids"]:
            return None
        if token is not None and queue.get("token") != token:
            return None
        message = db.get(Message, message_id)
        if expired and message.created_at > _now() - OFFLINE_REPLY_TIMEOUT:
            return None
        queue.update(state="refunded", refunded_at=_now().isoformat(), lease_until=None,
                     reason="expired" if expired else "generation_failed")
        _write(debit, queue)
        # refund_message commits both the reversal and this terminal queue state.
        reversal = refund_message(db, message_id)
        return reversal.id if reversal is not None else None


def sweep():
    """One pass: expire unanswered messages, then claim one head per online reader."""
    with SessionLocal() as db:
        expired_ids = [message.id for debit, message, chat in _pending(db).all()
                       if message.created_at <= _now() - OFFLINE_REPLY_TIMEOUT
                       and not _metadata(debit)[QUEUE_KEY]["reply_ids"]]
    for message_id in expired_ids:
        refund_queued(message_id, expired=True)
    with SessionLocal() as db:
        reader_ids = list(dict.fromkeys(chat.psychic_id for _, _, chat in _pending(db).all()))
    claims = []
    for reader_id in reader_ids:
        claim = claim_next(reader_id)
        if claim is not None:
            claims.append(claim)
    return claims
