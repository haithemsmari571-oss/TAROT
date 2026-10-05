"""The owner's phone, for per-message conversations: one inbox across every
reader, a thread, the mode switch, suggestions, and replies sent as the reader.

Two modes, per conversation, switchable at any time:
- Automatic (ResponseMode.SABRI, every new chat's default): the automatic
  reader answers each paid message (reading_single).
- Hybrid (ResponseMode.HYBRID): each paid message gets a suggested reply,
  written exactly as an automatic reply is but never sent; the owner edits and
  sends it, writes his own, or drops it. A legacy HUMAN chat is Hybrid here.

A suggestion is the chat's one PENDING ai_drafts row (no migration):
  chat_id            the conversation
  client_message_id  the newest of her unanswered messages it answers
  mode               HYBRID
  draft_text         the reply's bubbles, a blank line between them
  sabri_flags        None, sabri_passed False (the one-call reader has no checker)
  attempts           the call attempt that wrote it (1 or 2)
  status             PENDING; SENT once sent as the reader; DISCARDED when
                     dropped, replaced by a fresher one, or the chat goes Automatic

The owner never holds a reader token: send_as_reader stores and delivers his
reply as the reader on the server. A client sees nothing of this module but a
reply he sends and the reader's typing dots.
"""

from typing import Optional

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import aliased

from app.config import get_app_settings
from app.database.client import SessionLocal
from app.enums.ai_draft_status import AiDraftStatus
from app.enums.author_type import AuthorType
from app.enums.response_mode import ResponseMode
from app.enums.transaction_status import TransactionStatus
from app.enums.transaction_type import TransactionType
from app.logging_config import get_logger
from app.models import Chat, Message, Transaction, User
from app.models.ai_draft import AiDraft
from app.services import offline_replies
from app.services.ai import reading_single
from app.services.client_inbox import picture_url, preview_text, receipt_state
from app.services.reply_emails import reader_name

logger = get_logger(__name__)

AUTOMATIC = "automatic"
HYBRID = "hybrid"
MODES = {AUTOMATIC: ResponseMode.SABRI, HYBRID: ResponseMode.HYBRID}

# notify_owner kinds.
CLIENT_MESSAGE = "client_message"
SUGGESTION_READY = "suggestion_ready"


class NotPersonAnswered(Exception):
    """A reply was sent from the phone into an Automatic conversation."""


def mode_name(mode):
    """Automatic for SABRI; Hybrid for HYBRID and for a legacy HUMAN chat."""
    return AUTOMATIC if mode == ResponseMode.SABRI else HYBRID


def notify_owner(chat_id, kind):
    """The one hook that tells the owner a conversation wants him: CLIENT_MESSAGE
    when a paid message of hers lands in an Automatic chat, SUGGESTION_READY when
    a Hybrid chat's suggestion is stored. His phones get the notification
    (web_push.notify_owner, at most one per chat every two minutes); never
    raises."""
    from app.services.web_push import notify_owner as push_to_owner

    logger.info("owner_notify", chat_id=chat_id, kind=kind)
    push_to_owner(chat_id, kind)


def _lock_chat(db, chat_id):
    return (
        db.query(Chat).filter(Chat.id == chat_id)
        .with_for_update().populate_existing().first()
    )


def _pending_suggestions(db, chat_id):
    return db.query(AiDraft).filter(
        AiDraft.chat_id == chat_id,
        AiDraft.mode == ResponseMode.HYBRID,
        AiDraft.status == AiDraftStatus.PENDING,
    )


def _settle_suggestions(db, chat_id, used_id=None):
    """No commit here. Every pending suggestion of the chat ends: SENT for
    ``used_id``, DISCARDED for the rest. Returns ``used_id`` when it was pending."""
    used = None
    for draft in _pending_suggestions(db, chat_id).all():
        if draft.id == used_id:
            draft.status = AiDraftStatus.SENT
            used = draft.id
        else:
            draft.status = AiDraftStatus.DISCARDED
    return used


def _current_suggestion(db, chat):
    """The chat's pending suggestion while it still answers something: nothing
    has been written on the reader's side since the newest message it answers."""
    draft = _pending_suggestions(db, chat.id).order_by(AiDraft.id.desc()).first()
    if draft is None or draft.client_message_id is None:
        return None
    answers = db.get(Message, draft.client_message_id)
    if answers is None or offline_replies.reader_reply_after(db, chat, answers) is not None:
        return None
    return draft


def current_suggestion_id(db, chat) -> Optional[int]:
    draft = _current_suggestion(db, chat)
    return draft.id if draft is not None else None


def _suggestion_out(draft):
    if draft is None:
        return None
    return {
        "id": draft.id,
        "text": draft.draft_text,
        "through_message_id": draft.client_message_id,
        "created_at": draft.created_at,
    }


def store_suggestion(chat_id, through_id, bubbles, attempts, *, replace_newer=True) -> Optional[int]:
    """Store the chat's one pending suggestion, replacing the one before it, and
    tell the owner (SUGGESTION_READY). Kept only while the chat is not Automatic
    and ``through_id``, the newest message it answers, is still unanswered.
    ``replace_newer=False`` (an automatic reply held back by a mode switch)
    keeps a stored one that answers as far or further. Returns its id, or None."""
    with SessionLocal() as db:
        chat = _lock_chat(db, chat_id)
        if chat is None or chat.response_mode == ResponseMode.SABRI:
            return None
        if through_id not in {m.id for m in offline_replies.unanswered(db, chat)}:
            return None
        current = _pending_suggestions(db, chat_id).all()
        if not replace_newer and any((d.client_message_id or 0) >= through_id for d in current):
            return None
        for draft in current:
            draft.status = AiDraftStatus.DISCARDED
        draft = AiDraft(
            chat_id=chat_id,
            client_message_id=through_id,
            mode=ResponseMode.HYBRID,
            draft_text=reading_single.BUBBLE_JOIN.join(bubbles),
            sabri_flags=None,
            sabri_passed=False,
            attempts=attempts,
            status=AiDraftStatus.PENDING,
        )
        db.add(draft)
        db.commit()
        suggestion_id = draft.id
    notify_owner(chat_id, SUGGESTION_READY)
    return suggestion_id


def suggestion_is_current(chat_id) -> bool:
    """True when nothing of hers waits, or the stored suggestion already answers
    her newest unanswered message."""
    with SessionLocal() as db:
        chat = db.get(Chat, chat_id)
        if chat is None:
            return True
        waiting = offline_replies.unanswered(db, chat)
        if not waiting:
            return True
        draft = _current_suggestion(db, chat)
        return draft is not None and draft.client_message_id >= waiting[-1].id


def discard_suggestion(db, chat_id) -> Optional[int]:
    """Drop the chat's pending suggestion; nothing is sent. Returns its id."""
    draft = _pending_suggestions(db, chat_id).order_by(AiDraft.id.desc()).first()
    _settle_suggestions(db, chat_id)
    db.commit()
    return draft.id if draft is not None else None


async def send_as_reader(db, chat_id, content, *, suggestion_id=None):
    """Send ``content`` to her as the chat's reader. The one server-side way the
    owner replies, so no reader token ever leaves the server.

    As the reader's socket does: stored with the reader as sender and a person as
    author (HUMAN_PSYCHIC), its receipt from her presence, broadcast to her room,
    pushed when she has no socket (broadcast_persisted_ai_message), emailed later
    by the reply sweep like any reader reply (reply_emails), and recorded in the
    reading memory (reading_single.record_reader_reply). In the same commit it
    closes as answered every paid message of hers it follows
    (offline_replies.close_answered), so no refund fires, and settles the pending
    suggestion: SENT when it is ``suggestion_id``, else DISCARDED.

    Raises NotPersonAnswered on an Automatic chat. Returns (message, the message
    ids closed as answered, the suggestion id marked SENT or None)."""
    from app.services.ai.reading_burst import message_flow_lock
    from app.services.ai.reading_executor import broadcast_typing
    from app.services.chats import broadcast_persisted_ai_message, prepare_ai_message

    async with message_flow_lock(chat_id):
        chat = _lock_chat(db, chat_id)
        if chat.response_mode == ResponseMode.SABRI:
            db.rollback()
            raise NotPersonAnswered()
        message = prepare_ai_message(db, chat, content, author_type=AuthorType.HUMAN_PSYCHIC)
        closed = offline_replies.close_answered(db, chat)
        used = _settle_suggestions(db, chat_id, used_id=suggestion_id)
        db.commit()
        db.refresh(message)
        await broadcast_persisted_ai_message(db, chat, message)
    await broadcast_typing(chat_id, False, chat.psychic_id)
    try:
        reading_single.record_reader_reply(db, chat, message)
    except Exception:  # noqa: BLE001 - memory must never break a send
        logger.exception("owner_reply_memory_record_failed", chat_id=chat_id)
    logger.info(
        "owner_reply_sent", chat_id=chat_id, message_id=message.id,
        closed_as_answered=closed, suggestion_id=used,
    )
    return message, closed, used


async def set_conversation_mode(db, chat_id, mode, *, by=None) -> dict:
    """Switch one conversation between Automatic and Hybrid (HUMAN is Hybrid
    here), at any time, with the double-reply guards:

    - to Automatic: the pending suggestion is dropped; every paid message the
      reader's side has answered since is closed as answered
      (offline_replies.close_answered); the ones still unanswered become ONE
      automatic reply (offline_replies.hand_to_automatic), taken at once when
      the reader keeps her hours now, else by the sweep when she does;
    - to Hybrid: a suggestion is written at once for the unanswered ones, unless
      the automatic reply already being written answers them all, which
      reading_single then keeps as the suggestion. An automatic reply in flight
      never goes out once the switch is committed (reading_single's own checks).

    Serialized with her sends and the reply's bubbles (message_flow_lock) and
    committed under the chat's row lock. Raises LookupError for no such chat."""
    from app.services.ai.reading_burst import message_flow_lock

    async with message_flow_lock(chat_id):
        chat = _lock_chat(db, chat_id)
        if chat is None:
            raise LookupError(chat_id)
        previous = chat.response_mode
        chat.response_mode = mode
        closed, head = [], None
        if mode == ResponseMode.SABRI:
            _settle_suggestions(db, chat_id)
            closed = offline_replies.close_answered(db, chat)
            head = offline_replies.hand_to_automatic(db, chat)
        db.commit()
        waiting = [m.id for m in offline_replies.unanswered(db, chat)]
    if mode == ResponseMode.SABRI:
        if head is not None:
            token = offline_replies.claim(head)
            if token is not None:
                await reading_single.enqueue_reply(chat_id, head, queue_token=token)
    elif waiting and not set(waiting) <= reading_single.turn_covers(chat_id):
        reading_single.request_suggestion(chat_id, fresh=False)
    logger.info(
        "owner_mode_set", chat_id=chat_id, mode=mode.value, previous=previous.value,
        by=by, closed_as_answered=closed, unanswered=waiting, automatic_head=head,
    )
    return {
        "chat_id": chat_id,
        "mode": mode_name(mode),
        "closed_as_answered": closed,
        "unanswered_message_ids": waiting,
    }


def _refund_at(oldest_at):
    return oldest_at + offline_replies.OFFLINE_REPLY_TIMEOUT if oldest_at is not None else None


def _inbox_query(offset, limit):
    """One set-based statement for a page of every conversation, across every
    reader: its last line, her oldest unanswered paid message and whether a
    current suggestion waits, each computed for all chats at once."""
    client = aliased(User)
    reader = aliased(User)
    messages = select(
        Message.id, Message.chat_id, Message.sender_id, Message.created_at,
        preview_text(Message.content).label("preview"),
    ).where(Message.is_system.is_(False)).cte("owner_inbox_messages")
    latest = select(
        messages,
        func.row_number().over(
            partition_by=messages.c.chat_id,
            order_by=(messages.c.created_at.desc(), messages.c.id.desc()),
        ).label("position"),
    ).cte("owner_inbox_latest")
    # The newest thing the reader's side wrote: a paid message before it is
    # answered (offline_replies.reader_reply_after, as one set).
    reader_last = (
        select(Message.chat_id, func.max(Message.id).label("message_id"))
        .join(Chat, Chat.id == Message.chat_id)
        .where(Message.sender_id == Chat.psychic_id, Message.is_system.is_(False))
        .group_by(Message.chat_id)
        .cte("owner_inbox_reader_last")
    )
    unanswered = (
        select(Message.chat_id, func.min(Message.created_at).label("oldest_at"))
        .select_from(Transaction)
        .join(Message, Message.id == Transaction.related_message_id)
        .outerjoin(reader_last, reader_last.c.chat_id == Message.chat_id)
        .where(
            Transaction.transaction_type == TransactionType.DEBIT,
            Transaction.status == TransactionStatus.COMPLETED,
            offline_replies.pending_state(),
            or_(reader_last.c.message_id.is_(None), reader_last.c.message_id < Message.id),
        )
        .group_by(Message.chat_id)
        .cte("owner_inbox_unanswered")
    )
    suggested = (
        select(AiDraft.chat_id)
        .outerjoin(reader_last, reader_last.c.chat_id == AiDraft.chat_id)
        .where(
            AiDraft.mode == ResponseMode.HYBRID,
            AiDraft.status == AiDraftStatus.PENDING,
            AiDraft.client_message_id.is_not(None),
            or_(reader_last.c.message_id.is_(None),
                reader_last.c.message_id < AiDraft.client_message_id),
        )
        .group_by(AiDraft.chat_id)
        .cte("owner_inbox_suggested")
    )
    activity = func.coalesce(latest.c.created_at, Chat.created_at)
    waiting = and_(latest.c.sender_id.is_not(None), latest.c.sender_id == Chat.user_id)
    has_suggestion = suggested.c.chat_id.is_not(None)
    return (
        select(
            Chat.id.label("chat_id"), Chat.response_mode,
            client.id.label("client_id"), client.username.label("client_username"),
            reader.id.label("reader_id"), reader.username.label("reader_username"),
            reader.profile_picture_path,
            latest.c.id.label("last_message_id"), latest.c.sender_id, latest.c.preview,
            activity.label("last_activity_at"),
            unanswered.c.oldest_at,
            has_suggestion.label("has_suggestion"),
            waiting.label("waiting"),
        )
        .select_from(Chat)
        .join(client, client.id == Chat.user_id)
        .join(reader, reader.id == Chat.psychic_id)
        .outerjoin(latest, and_(latest.c.chat_id == Chat.id, latest.c.position == 1))
        .outerjoin(unanswered, unanswered.c.chat_id == Chat.id)
        .outerjoin(suggested, suggested.c.chat_id == Chat.id)
        .order_by(
            case((has_suggestion, 0), else_=1),
            case((waiting, 0), else_=1),
            case((waiting, unanswered.c.oldest_at), else_=None).asc().nulls_last(),
            activity.desc(),
            Chat.id.desc(),
        )
        .offset(offset)
        .limit(limit)
    )


def owner_inbox(db, *, offset, limit) -> dict:
    """Every per-message conversation: those with a suggestion waiting first,
    then those where she wrote last (soonest refund first), then the rest, each
    group newest activity first. Two statements whatever the number of chats:
    the count and the page."""
    total = db.scalar(select(func.count()).select_from(Chat))
    rows = db.execute(_inbox_query(offset, limit)).mappings().all()
    base_url = get_app_settings().APP_BASE_URL
    items = []
    for row in rows:
        last_sender = None
        if row.last_message_id is not None:
            last_sender = "client" if row.sender_id == row.client_id else "reader"
        items.append({
            "chat_id": row.chat_id,
            "client_id": row.client_id,
            "client_name": row.client_username,
            "reader_id": row.reader_id,
            "reader_name": reader_name(row.reader_username),
            "reader_picture_url": picture_url(row.profile_picture_path, base_url),
            "mode": mode_name(row.response_mode),
            "last_message_text": row.preview,
            "last_sender": last_sender,
            "last_activity_at": row.last_activity_at,
            "waiting": bool(row.waiting),
            "has_suggestion": bool(row.has_suggestion),
            "oldest_unanswered_at": row.oldest_at,
            "refund_at": _refund_at(row.oldest_at),
        })
    return {"items": items, "total": total, "offset": offset, "limit": limit,
            "has_more": offset + len(items) < total}


def chat_thread(db, chat_id, *, before_id=None, limit) -> dict:
    """One conversation for the phone: a page of messages (the newest, or those
    before ``before_id``), her side or the reader's, plus the mode, what still
    waits for a reply and the current suggestion. Reads only: nothing is marked
    read for her. Raises LookupError for no such chat."""
    chat = db.get(Chat, chat_id)
    if chat is None:
        raise LookupError(chat_id)
    query = db.query(Message).filter(Message.chat_id == chat_id)
    if before_id is not None:
        query = query.filter(Message.id < before_id)
    rows = query.order_by(Message.created_at.desc(), Message.id.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = list(reversed(rows[:limit]))
    last = (
        db.query(Message.sender_id)
        .filter(Message.chat_id == chat_id, Message.is_system.is_(False))
        .order_by(Message.created_at.desc(), Message.id.desc())
        .first()
    )
    waiting = offline_replies.unanswered(db, chat)
    client = db.get(User, chat.user_id)
    reader = db.get(User, chat.psychic_id)
    oldest_at = waiting[0].created_at if waiting else None
    return {
        "chat_id": chat.id,
        "mode": mode_name(chat.response_mode),
        "client_id": client.id,
        "client_name": client.username,
        "reader_id": reader.id,
        "reader_name": reader_name(reader.username),
        "reader_picture_url": picture_url(
            reader.profile_picture_path, get_app_settings().APP_BASE_URL
        ),
        "waiting": last is not None and last.sender_id == chat.user_id,
        "unanswered_message_ids": [m.id for m in waiting],
        "oldest_unanswered_at": oldest_at,
        "refund_at": _refund_at(oldest_at),
        "suggestion": _suggestion_out(_current_suggestion(db, chat)),
        "suggestion_generating": reading_single.is_suggesting(chat_id),
        "messages": [
            {
                "id": m.id,
                "side": "system" if m.is_system
                else "client" if m.sender_id == chat.user_id else "reader",
                "text": m.content,
                "created_at": m.created_at,
                "status": None if m.is_system else receipt_state(m.status),
            }
            for m in rows
        ],
        "has_more": has_more,
    }
