"""Start an automatic per-message conversation in one database transaction."""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.enums.author_type import AuthorType
from app.enums.chat_session_status import ChatSessionStatus
from app.enums.chat_status import ChatStatus
from app.enums.message_status import MessageStatus
from app.enums.response_mode import ResponseMode
from app.enums.role import Role
from app.models.chat import Chat
from app.models.chat_session import ChatSession
from app.models.message import Message
from app.models.user import User
from app.schemas.chat import ChatStart
from app.services.per_message_billing import (
    PerMessageRefusal,
    READER_UNAVAILABLE,
    charge_client_message,
)
from app.services.stardust_rewards import get_spendable_stardust


AUTOMATIC_READER_OPENER = "Hello, I'm here with you."


async def start_automatic_conversation(db: Session, user: User, request: ChatStart) -> dict:
    """Commit the opener, question, debit and joined session together, then queue.

    Lock the client before looking up the pair so simultaneous requests cannot
    create duplicate chats, openers or active sessions. Existing conversations
    keep their history and an already-active session is reused.
    """
    from app.services.ai import reading_single
    from app.services.session_manager import get_session_manager

    session_manager = get_session_manager()
    try:
        client = (
            db.query(User)
            .filter(User.id == user.id)
            .populate_existing()
            .with_for_update()
            .one()
        )
        reader = db.query(User).filter(
            User.id == request.psychic_id, User.role == Role.PSYCHIC
        ).first()
        if reader is None:
            raise HTTPException(status_code=404, detail="Reader not found")

        chat = (
            db.query(Chat)
            .filter(Chat.user_id == client.id, Chat.psychic_id == reader.id)
            .populate_existing()
            .first()
        )
        if chat is not None and chat.response_mode != ResponseMode.SABRI:
            raise PerMessageRefusal(READER_UNAVAILABLE, {"reason": READER_UNAVAILABLE})

        if client.role not in (Role.ADMIN, Role.SUPERADMIN):
            other_active = db.query(Chat.id).filter(
                Chat.user_id == client.id,
                Chat.psychic_id != reader.id,
                Chat.status.in_([ChatStatus.ACTIVE, ChatStatus.PAUSED]),
            ).first()
            if other_active is not None:
                raise HTTPException(
                    status_code=400,
                    detail="You already have an active or paused chat with another reader.",
                )

        new_chat = chat is None
        if new_chat:
            chat = Chat(
                user_id=client.id,
                psychic_id=reader.id,
                status=ChatStatus.ACTIVE,
                response_mode=ResponseMode.SABRI,
            )
            db.add(chat)
            db.flush()

        reading_session = (
            db.query(ChatSession)
            .filter(
                ChatSession.chat_id == chat.id,
                ChatSession.status.in_([
                    ChatSessionStatus.ACTIVE, ChatSessionStatus.REQUESTED,
                ]),
            )
            .order_by(ChatSession.id.desc())
            .first()
        )
        if reading_session is None:
            reading_session = ChatSession(chat_id=chat.id, status=ChatSessionStatus.ACTIVE)
            db.add(reading_session)
        else:
            reading_session.status = ChatSessionStatus.ACTIVE

        if chat.status != ChatStatus.ACTIVE or chat.client_joined_at is None:
            chat.client_joined_at = datetime.now()
        chat.status = ChatStatus.ACTIVE
        chat.paused_at = None
        db.flush()

        opener = None
        if new_chat:
            opener = Message(
                chat_id=chat.id,
                chat_session_id=reading_session.id,
                sender_id=reader.id,
                content=AUTOMATIC_READER_OPENER,
                is_system=False,
                author_type=AuthorType.SYSTEM,
                status=MessageStatus.SENT,
            )
            db.add(opener)
            # Assign the opener's ID before inserting the client's question.
            db.flush()

        question = Message(
            chat_id=chat.id,
            chat_session_id=reading_session.id,
            sender_id=client.id,
            content=request.message,
            is_system=False,
            status=MessageStatus.SENT,
        )
        db.add(question)
        db.flush()
        _, price = await charge_client_message(
            db, chat, request.message, client, commit=False, message=question
        )
        balance = round(get_spendable_stardust(db, client), 2)
        result = {
            "chat_id": chat.id,
            "chat_session_id": reading_session.id,
            "status": ChatStatus.ACTIVE.value,
            "billing_mode": "per_message",
            "client_joined_at": chat.client_joined_at.isoformat(),
            "opener_message_id": opener.id if opener is not None else None,
            "message_id": question.id,
            "price_per_message": price,
            "client_balance": balance,
        }
        db.commit()
        committed_at = datetime.now(timezone.utc)
    except BaseException:
        # Also unwind cancellation: no partially-created conversation or debit.
        db.rollback()
        raise

    # These side effects can only see committed rows. In particular, no pending
    # accept registration, separate session-start commit, or /join is needed.
    session_manager.track_joined_per_message_session(chat, reading_session, balance)
    await reading_single.enqueue_reply(
        result["chat_id"], result["message_id"], committed_at=committed_at
    )
    return result
