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
# The quiet line a refund leaves in her thread (a system row), in the owner's
# words for when the reader's name is not known, so every screen that shows
# system rows reads it as it is. The app finds the row by these exact words and
# adds the name: "Refund · no reply from Sophie" (perMessage.ts REFUND_NOTE).
REFUND_NOTE = "Refund · no reply"


def _now():
    return datetime.now(timezone.utc)


def refund_after_hours():
    """The refund window in whole hours, the figure the app promises."""
    return int(OFFLINE_REPLY_TIMEOUT.total_seconds() // 3600)


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


def has_entry(db, message_id):
    debit = _debit(db, message_id)
    return debit is not None and QUEUE_KEY in _metadata(debit)


def is_queued(db, message_id):
    """Waiting for an away reader; a live send's entry is not."""
    debit = _debit(db, message_id)
    queue = _metadata(debit).get(QUEUE_KEY) if debit is not None else None
    return queue is not None and not queue.get("live", False)


def stage_if_offline(db, chat, message, *, stage_live=True):
    """No commit or charge here. Returns True when the reader is away and the
    message waits for her.

    Called inside the charge's transaction, it gives every charged message on
    an automatic chat its entry, so the sweep answers or refunds it whatever
    happens to the reply. A live send's entry carries a lease the live reply
    takes over at once (claim_live); until then the sweep leaves it alone."""
    if chat.response_mode != ResponseMode.SABRI:
        return False
    debit = _debit(db, message.id)
    if debit is None or debit.status != TransactionStatus.COMPLETED:
        return False
    queue = _metadata(debit).get(QUEUE_KEY)
    if queue is not None:
        return not queue.get("live", False)
    reader = db.query(User).filter(User.id == chat.psychic_id).populate_existing().one()
    online = reader_availability(reader.online_from, reader.online_to).is_online
    if online:
        if stage_live:
            _write(debit, {"state": "queued", "reply_ids": [], "live": True,
                           "lease_until": (_now() + LEASE_DURATION).isoformat()})
        return False
    _write(debit, {"state": "queued", "reply_ids": []})
    message.status = MessageStatus.DELIVERED
    return True


def claim_live(message_id):
    """The live reply takes its message's entry, with a token and lease as a
    wake claim has. None when the entry is not a live one still waiting: the
    sweep took it first, or it is answered or refunded."""
    with SessionLocal() as db:
        debit = _debit(db, message_id, lock=True)
        if debit is None or debit.status != TransactionStatus.COMPLETED:
            return None
        queue = _metadata(debit).get(QUEUE_KEY)
        if not queue or not queue.get("live") or queue["state"] != "queued" or queue.get("token"):
            return None
        token = uuid4().hex
        queue.update(state="delivering", token=token, lease_until=(_now() + LEASE_DURATION).isoformat())
        _write(debit, queue)
        db.commit()
        return token


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
    from app.services.per_message_receipts import advance_client_receipt

    with SessionLocal() as db:
        debit, queue = _owned(db, message_id, token)
        if debit is None:
            return False
        advance_client_receipt(db, message_id, event)
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
    from app.services.chats import save_system_message
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
        # The quiet line in her thread, which announce_refund later finds by note_id.
        note = save_system_message(db, message.chat_id, REFUND_NOTE, commit=False)
        queue.update(state="refunded", refunded_at=_now().isoformat(), lease_until=None,
                     reason="expired" if expired else "generation_failed", note_id=note.id)
        _write(debit, queue)
        # refund_message commits the reversal, this terminal queue state and the
        # line together; if it refunds nothing, none of them is kept.
        reversal = refund_message(db, message_id)
        return reversal.id if reversal is not None else None


def _refund_frames(message_id):
    """(chat_id, client_id, line, balance) for a message refund_queued refunded,
    else None. The line is the system frame broadcast_system_message sends; the
    balance is the balance_updated frame a top-up sends (routers/payments.py),
    for this conversation."""
    from app.services.per_message_billing import price_per_message
    from app.services.stardust_rewards import get_spendable_stardust

    with SessionLocal() as db:
        debit = _debit(db, message_id)
        note_id = _metadata(debit).get(QUEUE_KEY, {}).get("note_id") if debit is not None else None
        note = db.get(Message, note_id) if note_id is not None else None
        if note is None:
            return None
        chat = db.get(Chat, note.chat_id)
        client = db.get(User, chat.user_id)
        line = {
            "type": "system",
            "id": note.id,
            "content": note.content,
            "is_system": True,
            "chat_id": chat.id,
            "sender_id": None,
            "created_at": note.created_at.isoformat(),
        }
        balance = {
            "event": "balance_updated",
            "data": {
                "balance": round(float(get_spendable_stardust(db, client)), 2),
                "price_per_message": price_per_message(chat),
            },
        }
        return chat.id, client.id, line, balance


async def announce_refund(message_id):
    """Tell her room a message was refunded: the quiet line, then her balance to
    her sockets only. False when there is nothing to tell."""
    from app.manager import manager

    frames = _refund_frames(message_id)
    if frames is None:
        return False
    chat_id, client_id, line, balance = frames
    await manager.send_to_chat(message=line, chat_id=str(chat_id))
    await manager.send_to_user_in_chat(balance, str(chat_id), client_id)
    return True


def forfeit_pending(db, user_id):
    """No commit here; account deletion forfeits her waiting messages in its own commit.

    "forfeited" is outside PENDING_STATES, so _pending (the sweep and claim_next)
    never selects the entry again, and refund_queued, renew, save_reply and
    persist_bubble all refuse it. The debit stands. Returns (total, count).
    """
    debits = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.transaction_type == TransactionType.DEBIT,
            Transaction.status == TransactionStatus.COMPLETED,
            Transaction.transaction_metadata.contains(QUEUE_KEY),
        )
        .with_for_update()
        .all()
    )
    amounts = []
    for debit in debits:
        queue = _metadata(debit).get(QUEUE_KEY, {})
        if queue.get("state") in PENDING_STATES:
            queue.update(state="forfeited", forfeited_at=_now().isoformat(), lease_until=None)
            _write(debit, queue)
            amounts.append(float(debit.amount))
    return round(sum(amounts), 2), len(amounts)


def sweep(refunded=None):
    """One pass: expire unanswered messages, then claim one head per online reader.

    refunded, when given, collects the ids of the messages this pass refunded,
    so the caller can tell their rooms (announce_refund)."""
    with SessionLocal() as db:
        expired_ids = [message.id for debit, message, chat in _pending(db).all()
                       if message.created_at <= _now() - OFFLINE_REPLY_TIMEOUT
                       and not _metadata(debit)[QUEUE_KEY]["reply_ids"]]
    for message_id in expired_ids:
        if refund_queued(message_id, expired=True) is not None and refunded is not None:
            refunded.append(message_id)
    with SessionLocal() as db:
        reader_ids = list(dict.fromkeys(chat.psychic_id for _, _, chat in _pending(db).all()))
    claims = []
    for reader_id in reader_ids:
        claim = claim_next(reader_id)
        if claim is not None:
            claims.append(claim)
    return claims
