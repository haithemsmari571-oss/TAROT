from fastapi import WebSocket
from sqlalchemy import desc, or_
from datetime import datetime
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.enums.chat_session_status import ChatSessionStatus
from app.enums.chat_session_triggers import ChatSessionTrigger
from app.enums.chat_status import ChatStatus
from app.enums.chat_termination_reason import ChatTerminationReason
from app.exceptions.chats import (
    ChatNotFound,
    ChatSessionNotFound,
    SessionIntervalNotFound,
)
from app.exceptions.users import UserInsufficientBalance, UserNotFoundError
from app.models import Chat, Message, ChatSession, SessionInterval
from app.models.user import User
from app.schemas.chat import ChatOut, ChatStart
from app.services.psychics import get_psychic
from app.services.users import get_user


def _validate_start_chat(db: Session, user_id: int, psychic_id: int):
    user = get_user(db, user_id)
    if not user:
        raise UserNotFoundError()

    psychic = get_psychic(db, psychic_id)
    if not psychic:
        raise UserNotFoundError("Psychic with that id doesn't exist")

    # Check if user has enough balance (at least 2 minutes)
    from app.services.billing import check_user_can_start_session

    if not check_user_can_start_session(db, user_id, psychic_id):
        raise UserInsufficientBalance()

    return


def req_start_chat(db: Session, user_id: int, chat_data: ChatStart) -> int:
    """Request a chat and return the chat_id"""
    _validate_start_chat(db, user_id, chat_data.psychic_id)

    # Check if a chat already exists between this user and psychic
    existing_chat = (
        db.query(Chat)
        .filter(Chat.user_id == user_id, Chat.psychic_id == chat_data.psychic_id)
        .first()
    )

    if existing_chat:
        # If chat exists, update its status to REQUESTED and add the new message
        existing_chat.status = ChatStatus.REQUESTED

        msg_req = Message(
            sender_id=user_id, chat_id=existing_chat.id, content=chat_data.message
        )
        db.add(msg_req)
        db.commit()
        return existing_chat.id

    # If no existing chat, create a new one
    try:
        chat = Chat(
            user_id=user_id,
            psychic_id=chat_data.psychic_id,
            status=ChatStatus.REQUESTED,
        )
        db.add(chat)
        db.flush()

        msg_req = Message(sender_id=user_id, chat_id=chat.id, content=chat_data.message)
        db.add(msg_req)

        db.commit()
        return chat.id
    except IntegrityError:
        # Rollback and retry with existing chat (race condition handling)
        db.rollback()
        existing_chat = (
            db.query(Chat)
            .filter(Chat.user_id == user_id, Chat.psychic_id == chat_data.psychic_id)
            .first()
        )
        if existing_chat:
            existing_chat.status = ChatStatus.REQUESTED
            msg_req = Message(
                sender_id=user_id, chat_id=existing_chat.id, content=chat_data.message
            )
            db.add(msg_req)
            db.commit()
            return existing_chat.id

        # If still no chat found, raise error
        raise ValueError("Failed to create or find chat")


def get_chats(db: Session, user_id: int):
    """
    Get chats based on user role:
    - PSYCHIC: Only their chats (where they are the psychic)
    - ADMIN/SUPERADMIN: All chats in the system
    - USER: Their chats (where they are the client)
    """
    from app.config import get_app_settings

    user = get_user(db, user_id)
    if not user:
        raise UserNotFoundError()

    from app.enums.role import Role

    settings = get_app_settings()

    # Admin and Superadmin see all chats
    if user.role in [Role.ADMIN, Role.SUPERADMIN]:
        results = db.query(Chat).all()
    # Psychic sees only chats where they are the psychic
    elif user.role == Role.PSYCHIC:
        results = db.query(Chat).filter(Chat.psychic_id == user_id).all()
    # Regular users see their own chats
    else:
        results = (
            db.query(Chat)
            .filter(or_(Chat.user_id == user_id, Chat.psychic_id == user_id))
            .all()
        )

    chat_list = []
    for chat in results:
        # For admin/superadmin, show both users' info
        if user.role in [Role.ADMIN, Role.SUPERADMIN]:
            # Show the psychic's name for admins
            other_user = chat.psychic
            user_name = f"{chat.user.username} -> {chat.psychic.username}"
        else:
            other_user = chat.psychic if chat.user_id == user_id else chat.user
            user_name = other_user.username

        last_msg = (
            db.query(Message)
            .filter(Message.chat_id == chat.id)
            .order_by(Message.created_at.desc())
            .first()
        )

        # Transform profile picture path to full URL
        profile_pic_url = ""
        if other_user.profile_picture_path:
            if other_user.profile_picture_path.startswith(("http://", "https://")):
                profile_pic_url = other_user.profile_picture_path
            else:
                # Profile picture path is stored as "media/uploads/filename.jpg"
                # We just need to prepend the base URL
                profile_pic_url = (
                    f"{settings.APP_BASE_URL}/{other_user.profile_picture_path}"
                )

        chat_list.append(
            ChatOut(
                id=chat.id,
                status=chat.status,
                user_name=user_name,
                user_profile_pic_url=profile_pic_url,
                last_message=last_msg.content if last_msg else "No messages yet",
                psychic_id=chat.psychic_id,
            )
        )
    return chat_list


def update_chat_status(db: Session, chat_id: int, status: ChatStatus):
    """Psychic endpoint, used for accepting or ending a chat session"""
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise ChatNotFound()

    # Update the chat status
    chat.status = status

    # TODO: handle other statuses?
    if status == ChatStatus.ACTIVE:
        start_new_chat_session(db=db, chat_id=chat_id)
    elif status == ChatStatus.ENDED:
        # Check if there's an active session to end
        session = (
            db.query(ChatSession)
            .filter(ChatSession.chat_id == chat_id)
            .order_by(desc(ChatSession.id))
            .first()
        )

        if session:
            # There's an active session, end it properly
            end_chat_session(
                db=db,
                chat_id=chat_id,
                termination_reason=ChatTerminationReason.MANUAL_EXIT,
            )
        else:
            # No active session (e.g., declining a REQUESTED chat), just update status
            db.commit()
    else:
        # For other statuses, just commit the status change
        db.commit()

    return True


def start_new_chat_session(db: Session, chat_id: int) -> ChatSession:
    """Creates the main session and the first billable interval."""
    chat_session = ChatSession(chat_id=chat_id, status=ChatStatus.ACTIVE)
    db.add(chat_session)
    db.flush()

    add_session_interval(
        db, session=chat_session, trigger=ChatSessionTrigger.INITIAL_START
    )

    db.commit()
    db.refresh(chat_session)
    return chat_session


def add_session_interval(
    db: Session, session: ChatSession, trigger: ChatSessionTrigger
) -> SessionInterval:
    """Adds a new time span to an existing session (used for starts and reconnects)."""
    interval = SessionInterval(
        session=session,
        started_at=datetime.now(),
        trigger_event=trigger,
    )
    db.add(interval)
    return interval


def end_session_interval(
    db: Session, session_id: int, termination_reason: ChatTerminationReason
):
    """End the current active interval for a session (used when pausing)."""
    # Find the current active interval (one without ended_at)
    current_interval = (
        db.query(SessionInterval)
        .filter(SessionInterval.session_id == session_id)
        .filter(SessionInterval.ended_at == None)
        .order_by(desc(SessionInterval.id))
        .first()
    )

    if current_interval:
        current_interval.ended_at = datetime.now()
        current_interval.termination_reason = termination_reason
        db.commit()


# FIXME: should the status be disconnected when termination reason is socket or something?
def end_chat_session(
    db: Session, chat_id: int, termination_reason: ChatTerminationReason
):
    # 1. End chat
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        raise ChatNotFound()

    chat.status = ChatStatus.ENDED

    # 2. End session
    session = (
        db.query(ChatSession)
        .filter(ChatSession.chat_id == chat_id)
        .order_by(desc(ChatSession.id))
        .first()
    )
    if not session:
        raise ChatSessionNotFound()
    session.status = ChatSessionStatus.COMPLETED

    # 3. End session interval
    last_session_interval = (
        db.query(SessionInterval)
        .filter(SessionInterval.session_id == session.id)
        .order_by(desc(SessionInterval.id))
        .first()
    )
    if not last_session_interval:
        raise SessionIntervalNotFound()

    last_session_interval.ended_at = datetime.now()
    last_session_interval.termination_reason = termination_reason

    # 4. Bill all unbilled intervals for this chat
    from app.services.billing import bill_all_unbilled_intervals

    try:
        transactions = bill_all_unbilled_intervals(db, chat_id)
        print(
            f"Billed {len(transactions)} intervals for chat {chat_id} (total: {sum(t.amount for t in transactions)} points)"
        )
    except Exception as e:
        print(f"Error billing intervals for chat {chat_id}: {e}")
        # Continue with ending the session even if billing fails
        # The periodic billing task will catch unbilled intervals later

    db.commit()


async def save_message(db: Session, data: dict, user: User, chat: Chat) -> Message:
    message = Message(chat_id=chat.id, sender_id=user.id, content=data["content"])
    db.add(message)
    db.commit()
    return message


def save_system_message(db: Session, chat_id: int, content: str) -> Message:
    """Save a system message to the database (no sender, is_system=True)."""
    message = Message(chat_id=chat_id, content=content, is_system=True)
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


async def broadcast_system_message(db: Session, chat_id: int, content: str) -> Message:
    """Save a system message to DB and broadcast it via WebSocket to the chat room."""
    from datetime import datetime
    from app.manager import manager

    message = save_system_message(db, chat_id, content)

    payload = {
        "type": "system",
        "id": message.id,
        "content": message.content,
        "is_system": True,
        "chat_id": chat_id,
        "sender_id": None,
        "created_at": message.created_at.isoformat()
        if message.created_at
        else datetime.now().isoformat(),
    }

    await manager.send_to_chat(message=payload, chat_id=str(chat_id))
    return message
