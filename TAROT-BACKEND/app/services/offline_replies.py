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


def pending_state():
    """The SQL test for an entry still waiting (queued or delivering), on a
    debit row. One source for the sweep below and the owner's inbox
    (owner_messaging.py)."""
    return cast(Transaction.transaction_metadata, JSON)[QUEUE_KEY]["state"].as_string().in_(PENDING_STATES)


def _pending(db):
    return (
        db.query(Transaction, Message, Chat)
        .join(Message, Message.id == Transaction.related_message_id)
        .join(Chat, Chat.id == Message.chat_id)
        .filter(
            Transaction.transaction_type == TransactionType.DEBIT,
            Transaction.status == TransactionStatus.COMPLETED,
            pending_state(),
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
    """Waiting for an away reader; a live send's entry is not, and neither is
    one a person answers (manual)."""
    debit = _debit(db, message_id)
    queue = _metadata(debit).get(QUEUE_KEY) if debit is not None else None
    return queue is not None and not queue.get("live", False) and not queue.get("manual", False)


def stage_if_offline(db, chat, message, *, stage_live=True):
    """No commit or charge here. Returns True when the reader is away and the
    message waits for her.

    Called inside the charge's transaction, it gives every charged message its
    entry, so the sweep answers or refunds it whatever happens to the reply. A
    live send's entry carries a lease the live reply takes over at once
    (claim_live); until then the sweep leaves it alone. On a chat a person
    answers (HUMAN or HYBRID, switched from the owner's console) the entry is
    marked manual: the automatic reader never claims it (claim_next), and the
    sweep refunds it at the window unless the reader's side has replied by then
    (refund_queued), the promise the room shows for every paid message."""
    debit = _debit(db, message.id)
    if debit is None or debit.status != TransactionStatus.COMPLETED:
        return False
    queue = _metadata(debit).get(QUEUE_KEY)
    if queue is not None:
        return not queue.get("live", False) and not queue.get("manual", False)
    if chat.response_mode != ResponseMode.SABRI:
        _write(debit, {"state": "queued", "reply_ids": [], "manual": True})
        return False
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


def _leased(queue, now):
    return bool(queue.get("lease_until")) and datetime.fromisoformat(queue["lease_until"]) > now


def _take(db, debit, message, now):
    """Fence one waiting entry for the automatic reader: the token and lease a
    wake claim has, committed. None when it is not claimable now."""
    queue = _metadata(debit).get(QUEUE_KEY)
    if debit.status != TransactionStatus.COMPLETED or not queue or queue["state"] not in PENDING_STATES:
        return None
    if not queue["reply_ids"] and message.created_at <= now - OFFLINE_REPLY_TIMEOUT:
        return None  # Expiry is handled before any wake claims.
    if _leased(queue, now):
        return None
    token = uuid4().hex
    queue.update(state="delivering", token=token, lease_until=(now + LEASE_DURATION).isoformat())
    _write(debit, queue)
    db.commit()
    return token


def _covered(db, queue):
    """True while the entry waits inside another message's one reply
    (hand_to_automatic) and that message is still waiting for it."""
    head_id = queue.get("covered_by")
    if head_id is None:
        return False
    head = _debit(db, head_id)
    head_queue = _metadata(head).get(QUEUE_KEY) if head is not None else None
    return bool(head_queue) and head_queue.get("state") in PENDING_STATES


def claim_next(reader_id):
    """Claim only the reader's oldest outstanding message, across her automatic
    chats. A chat a person answers (HUMAN or HYBRID) is never answered here, even
    for a message queued before it was switched; switched back, it is again. A
    message another one's reply covers (hand_to_automatic) is left to that one."""
    with SessionLocal() as db:
        # Serialize claims for one reader, including across backend processes.
        reader = db.query(User).filter(User.id == reader_id).with_for_update().one()
        if not reader_availability(reader.online_from, reader.online_to).is_online:
            return None
        rows = (
            _pending(db)
            .filter(Chat.psychic_id == reader_id, Chat.response_mode == ResponseMode.SABRI)
            .all()
        )
        row = next((r for r in rows if not _covered(db, _metadata(r[0])[QUEUE_KEY])), None)
        if row is None:
            return None
        debit, message, chat = row
        debit = _debit(db, message.id, lock=True)
        token = _take(db, debit, message, _now())
        return (chat.id, message.id, token) if token is not None else None


def claim(message_id):
    """The automatic reader takes this one message's entry now, as claim_next
    takes a reader's oldest: only on an automatic chat whose reader keeps her
    hours now, only an entry no lease holds. Returns its token, or None, and the
    sweep then takes it when it can."""
    with SessionLocal() as db:
        message = db.get(Message, message_id)
        chat = db.get(Chat, message.chat_id) if message is not None else None
        if chat is None:
            return None
        reader = db.query(User).filter(User.id == chat.psychic_id).with_for_update().one()
        if chat.response_mode != ResponseMode.SABRI or not reader_availability(
            reader.online_from, reader.online_to
        ).is_online:
            return None
        debit = _debit(db, message_id, lock=True)
        return _take(db, debit, message, _now()) if debit is not None else None


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
    if len(queue["reply_ids"]) == 1:
        # One reply answers every message it covers (hand_to_automatic): its
        # first bubble closes them, in this same commit.
        for covered_id in queue.get("covers", []):
            covered = _debit(db, covered_id, lock=True)
            covered_queue = _metadata(covered).get(QUEUE_KEY) if covered is not None else None
            if covered_queue and covered_queue["state"] in PENDING_STATES and not covered_queue["reply_ids"]:
                _close(covered, covered_queue, message.id)
    if len(queue["reply_ids"]) == len(queue["bubbles"]):
        queue.update(state="delivered", completed_at=_now().isoformat(), lease_until=None)
    _write(debit, queue)
    return message


def _close(debit, queue, reply_id):
    """Close a waiting entry as answered by ``reply_id``: no refund will come."""
    queue.update(state="delivered", reply_ids=[reply_id],
                 completed_at=_now().isoformat(), lease_until=None)
    _write(debit, queue)


def _entries(db, chat, *, lock=False):
    """The chat's waiting entries, oldest message first: (debit, message, queue).
    With ``lock`` each is re-read under its row lock, for a caller that writes."""
    entries = []
    for debit, message, _chat in _pending(db).filter(Chat.id == chat.id).all():
        if lock:
            debit = _debit(db, message.id, lock=True)
        queue = _metadata(debit).get(QUEUE_KEY) if debit is not None else None
        if queue and debit.status == TransactionStatus.COMPLETED and queue["state"] in PENDING_STATES:
            entries.append((debit, message, queue))
    return entries


def unanswered(db, chat):
    """Her paid messages in ``chat`` still owed a reply, oldest first: a waiting
    entry with nothing written on the reader's side since (reader_reply_after,
    the rule the window applies to a chat a person answers). What a suggestion
    answers, and what a switch to Automatic hands to the automatic reader.
    Takes no lock."""
    return [message for _debit_row, message, _queue in _entries(db, chat)
            if reader_reply_after(db, chat, message) is None]


def close_answered(db, chat):
    """No commit here. Close every waiting entry in ``chat`` that the reader's
    side has answered since, as refund_queued closes one at the window. An entry
    the automatic reader has begun to deliver (reply_ids) is left to it; one a
    worker holds but has not delivered is fenced by this, so it never sends.
    Returns the message ids closed."""
    closed = []
    for debit, message, queue in _entries(db, chat, lock=True):
        if queue["reply_ids"]:
            continue
        reply_id = reader_reply_after(db, chat, message)
        if reply_id is not None:
            _close(debit, queue, reply_id)
            closed.append(message.id)
    return closed


def hand_to_automatic(db, chat):
    """No commit here. On a switch to Automatic, after close_answered, the
    messages still unanswered become ONE turn of the automatic reader: each entry
    loses the person's mark (manual), a live mark, any reply saved for it alone
    and any earlier cover; the newest is the head and lists the others (covers),
    which claim_next then leaves to it (covered_by). An entry a live reply or a
    worker holds (a lease) is left to it. Returns the head's message id, or None."""
    now = _now()
    turn = []
    for debit, message, queue in _entries(db, chat, lock=True):
        if queue["reply_ids"] or queue.get("token") or _leased(queue, now):
            continue
        if reader_reply_after(db, chat, message) is not None:
            continue
        for key in ("manual", "live", "bubbles", "covers", "covered_by"):
            queue.pop(key, None)
        turn.append((debit, message, queue))
    if not turn:
        return None
    head_debit, head, head_queue = turn[-1]
    for debit, _message, queue in turn[:-1]:
        queue["covered_by"] = head.id
        _write(debit, queue)
    if len(turn) > 1:
        head_queue["covers"] = [message.id for _debit_row, message, _queue in turn[:-1]]
    _write(head_debit, head_queue)
    return head.id


def _uncover(db, queue):
    """The head's reply will not come (refunded): what it covered waits on its
    own again, for the sweep to answer or refund."""
    for covered_id in queue.get("covers", []):
        covered = _debit(db, covered_id, lock=True)
        covered_queue = _metadata(covered).get(QUEUE_KEY) if covered is not None else None
        if covered_queue and covered_queue.pop("covered_by", None) is not None:
            _write(covered, covered_queue)


def reader_reply_after(db, chat, message):
    """The id of the first message the reader's side wrote in the chat after
    ``message``, or None. A person at the reader's socket, an approved draft and
    the automatic reader are all stored as the reader (save_message,
    prepare_ai_message); system rows are not replies."""
    row = (
        db.query(Message.id)
        .filter(
            Message.chat_id == chat.id,
            Message.sender_id == chat.psychic_id,
            Message.is_system.is_(False),
            Message.id > message.id,
        )
        .order_by(Message.id)
        .first()
    )
    return row[0] if row is not None else None


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
        chat = db.get(Chat, message.chat_id)
        if expired and (queue.get("manual") or chat.response_mode != ResponseMode.SABRI):
            # A person answers this chat, so no reply_ids are written. If the
            # reader's side has written since her message, it was answered and
            # the entry closes without a refund.
            reply_id = reader_reply_after(db, chat, message)
            if reply_id is not None:
                _close(debit, queue, reply_id)
                db.commit()
                return None
        # The quiet line in her thread, which announce_refund later finds by note_id.
        note = save_system_message(db, message.chat_id, REFUND_NOTE, commit=False)
        queue.update(state="refunded", refunded_at=_now().isoformat(), lease_until=None,
                     reason="expired" if expired else "generation_failed", note_id=note.id)
        _write(debit, queue)
        _uncover(db, queue)
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
