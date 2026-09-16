"""Client-owned inbox: two set-based queries, no lazy per-chat loads."""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import and_, case, event, func, or_, select, update

from app.config import get_app_settings
from app.enums.author_type import AuthorType
from app.enums.message_status import MessageStatus
from app.logging_config import get_logger
from app.models import Chat, Message, User
from app.services.reader_hours import reader_availability

PREVIEW_LENGTH = 160
logger = get_logger(__name__)


def mark_chat_opened(db, chat_id, client_id):
    """Ownership checked in the UPDATE; never called by reply generation.

    Use the database wall clock after acquiring the row lock so simultaneous
    opens cannot move the marker backwards. Opening is independent of billing.
    """
    opened_at = db.execute(
        update(Chat)
        .where(Chat.id == chat_id, Chat.user_id == client_id)
        .values(client_last_opened_at=func.clock_timestamp())
        .returning(Chat.client_last_opened_at)
        .execution_options(synchronize_session=False)
    ).scalar_one_or_none()
    if opened_at is None:
        db.rollback()
        raise HTTPException(status_code=404, detail="Chat not found")
    db.commit()
    return {"chat_id": chat_id, "client_last_opened_at": opened_at}


def _inbox_query(client_id, offset, limit):
    owned = select(
        Chat.id, Chat.psychic_id, Chat.status, Chat.created_at, Chat.client_last_opened_at
    ).where(Chat.user_id == client_id).cte("owned_chats")
    messages = select(
        Message.id, Message.chat_id, Message.sender_id, Message.status,
        Message.created_at, Message.author_type,
        case(
            (func.length(Message.content) > PREVIEW_LENGTH,
             func.substr(Message.content, 1, PREVIEW_LENGTH - 1) + "…"),
            else_=Message.content,
        ).label("preview"),
    ).join(owned, owned.c.id == Message.chat_id).where(
        Message.is_system.is_(False)
    ).cte("inbox_messages")
    latest = select(
        messages,
        func.row_number().over(
            partition_by=messages.c.chat_id,
            order_by=(messages.c.created_at.desc(), messages.c.id.desc()),
        ).label("position"),
    ).cte("latest_messages")
    own_latest = select(
        messages.c.id, messages.c.chat_id, messages.c.status,
        func.row_number().over(
            partition_by=messages.c.chat_id,
            order_by=(messages.c.created_at.desc(), messages.c.id.desc()),
        ).label("position"),
    ).where(messages.c.sender_id == client_id).cte("latest_client_messages")
    unread = select(
        messages.c.chat_id, func.count().label("unread_count")
    ).join(owned, owned.c.id == messages.c.chat_id).where(
        messages.c.sender_id == owned.c.psychic_id,
        messages.c.author_type != AuthorType.SYSTEM,
        or_(owned.c.client_last_opened_at.is_(None),
            messages.c.created_at > owned.c.client_last_opened_at),
    ).group_by(messages.c.chat_id).cte("unread_messages")
    activity = func.coalesce(latest.c.created_at, owned.c.created_at)
    return (
        select(
            owned.c.id.label("chat_id"), owned.c.status.label("chat_status"),
            owned.c.client_last_opened_at,
            User.id.label("reader_id"), User.username, User.profile_picture_path,
            User.online_from, User.online_to, User.price_per_message,
            latest.c.id.label("last_message_id"), latest.c.sender_id,
            latest.c.preview, latest.c.created_at.label("message_created_at"),
            activity.label("last_activity_at"),
            func.coalesce(unread.c.unread_count, 0).label("unread_count"),
            own_latest.c.id.label("client_last_message_id"),
            own_latest.c.status.label("client_last_message_status"),
        )
        .select_from(owned)
        .join(User, User.id == owned.c.psychic_id)
        .outerjoin(latest, and_(latest.c.chat_id == owned.c.id, latest.c.position == 1))
        .outerjoin(own_latest, and_(own_latest.c.chat_id == owned.c.id, own_latest.c.position == 1))
        .outerjoin(unread, unread.c.chat_id == owned.c.id)
        .order_by(activity.desc(), owned.c.id.desc())
        .offset(offset).limit(limit)
    )


def list_client_chats(db, client_id, *, offset, limit):
    connection = db.connection()
    query_count = 0

    def count_query(*_args):
        nonlocal query_count
        query_count += 1

    # Count actual statements on this request's connection, including accidental
    # future lazy loads. Do not log message text, credentials or SQL parameters.
    event.listen(connection, "after_cursor_execute", count_query)
    try:
        total = db.scalar(select(func.count()).select_from(Chat).where(Chat.user_id == client_id))
        rows = db.execute(_inbox_query(client_id, offset, limit)).mappings().all()
        now = datetime.now(timezone.utc)
        base_url = get_app_settings().APP_BASE_URL.rstrip("/")
        items = []
        for row in rows:
            availability = reader_availability(row.online_from, row.online_to, now=now)
            picture = row.profile_picture_path
            if picture and not picture.startswith(("https://", "http://")):
                picture = base_url + "/" + picture.lstrip("/")
            last_message = None
            if row.last_message_id is not None:
                last_message = {
                    "id": row.last_message_id, "text": row.preview,
                    "sender_id": row.sender_id,
                    "sent_by": "client" if row.sender_id == client_id else
                               "reader" if row.sender_id == row.reader_id else "system",
                    "created_at": row.message_created_at,
                }
            state = None
            if row.client_last_message_id is not None:
                state = {
                    MessageStatus.READ: "seen", MessageStatus.DELIVERED: "delivered",
                }.get(row.client_last_message_status, "sent")
            items.append({
                "chat_id": row.chat_id, "chat_status": row.chat_status.value,
                "reader": {
                    "id": row.reader_id, "display_name": row.username,
                    "profile_picture_url": picture, "is_online": availability.is_online,
                    "next_online_at": availability.next_online_at,
                    "price_per_message": row.price_per_message,
                },
                "last_message": last_message, "last_activity_at": row.last_activity_at,
                "unread_count": row.unread_count,
                "client_last_message_id": row.client_last_message_id,
                "client_last_message_state": state,
                "client_last_opened_at": row.client_last_opened_at,
            })
        return {"items": items, "total": total, "offset": offset, "limit": limit,
                "has_more": offset + len(items) < total}
    finally:
        event.remove(connection, "after_cursor_execute", count_query)
        logger.info("client_inbox_queries", client_id=client_id, query_count=query_count,
                    offset=offset, limit=limit)
