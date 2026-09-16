"""Persist the same monotonic client-message ticks emitted by presence."""

from sqlalchemy import select, update

from app.enums.message_status import MessageStatus
from app.models import Chat, Message


def advance_client_receipt(db, message_id, event):
    """Stage a receipt; caller commits before sending the socket event.

    SENT -> DELIVERED -> READ (API 'seen'). A delayed delivered receipt never
    downgrades READ. Reader/system messages are not client-message receipts.
    """
    if event not in ("message_delivered", "message_seen"):
        return
    status = MessageStatus.READ if event == "message_seen" else MessageStatus.DELIVERED
    previous = [MessageStatus.SENDING, MessageStatus.SENT]
    if status == MessageStatus.READ:
        previous.append(MessageStatus.DELIVERED)
    db.execute(
        update(Message)
        .where(
            Message.id == message_id,
            Message.is_system.is_(False),
            Message.sender_id == select(Chat.user_id).where(Chat.id == Message.chat_id).scalar_subquery(),
            Message.status.in_(previous),
        )
        .values(status=status)
        .execution_options(synchronize_session=False)
    )
