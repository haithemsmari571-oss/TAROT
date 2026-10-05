"""Start or revive per-message conversations inside the message transaction."""

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
    price_of_reader,
)
from app.services.stardust_rewards import get_spendable_stardust


AUTOMATIC_READER_OPENER = "Hello, I'm here with you."


def _prepare_joined_session(db: Session, chat: Chat) -> ChatSession:
    """Stage a clockless session while the caller holds the client's row lock."""
    reading_session = (
        db.query(ChatSession)
        .filter(
            ChatSession.chat_id == chat.id,
            ChatSession.status.in_([
                ChatSessionStatus.ACTIVE, ChatSessionStatus.REQUESTED,
            ]),
        )
        .order_by(ChatSession.id.desc())
        .populate_existing()
        .first()
    )
    starting_session = (
        reading_session is None or reading_session.status != ChatSessionStatus.ACTIVE
    )
    if reading_session is None:
        reading_session = ChatSession(chat_id=chat.id, status=ChatSessionStatus.ACTIVE)
        db.add(reading_session)
    else:
        reading_session.status = ChatSessionStatus.ACTIVE

    if starting_session or chat.status != ChatStatus.ACTIVE or chat.client_joined_at is None:
        chat.client_joined_at = datetime.now()
    chat.status = ChatStatus.ACTIVE
    chat.paused_at = None
    db.flush()
    return reading_session


def _lock_client(db: Session, user: User) -> User:
    """The client's row, locked for the rest of the caller's transaction."""
    return (
        db.query(User)
        .filter(User.id == user.id)
        .populate_existing()
        .with_for_update()
        .one()
    )


def _reader_or_404(db: Session, psychic_id: int) -> User:
    reader = db.query(User).filter(
        User.id == psychic_id, User.role == Role.PSYCHIC
    ).first()
    if reader is None:
        raise HTTPException(status_code=404, detail="Reader not found")
    return reader


def _latest_session(db: Session, chat: Chat) -> ChatSession | None:
    """The conversation's newest session, whatever its status, untouched."""
    return (
        db.query(ChatSession)
        .filter(ChatSession.chat_id == chat.id)
        .order_by(ChatSession.id.desc())
        .populate_existing()
        .first()
    )


def _refuse_unavailable() -> PerMessageRefusal:
    return PerMessageRefusal(READER_UNAVAILABLE, {"reason": READER_UNAVAILABLE})


def find_or_open_conversation(
    db: Session, client: User, reader: User
) -> tuple[Chat, ChatSession | None, Message | None]:
    """The pair's conversation, opened when there is none. The one place the
    opener is written.

    The caller holds the client's row lock. An existing conversation comes
    back as it is, whatever its response mode, with no session and no opener:
    nothing on it changes here. A new one is created ACTIVE and automatic, with
    its clockless joined session and the reader's opener, flushed and not
    committed.
    """
    chat = (
        db.query(Chat)
        .filter(Chat.user_id == client.id, Chat.psychic_id == reader.id)
        .populate_existing()
        .first()
    )
    if chat is not None:
        return chat, None, None

    chat = Chat(
        user_id=client.id,
        psychic_id=reader.id,
        status=ChatStatus.ACTIVE,
        response_mode=ResponseMode.SABRI,
    )
    db.add(chat)
    db.flush()
    reading_session = _prepare_joined_session(db, chat)
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
    # Assign the opener's ID before anything that follows it in the thread.
    db.flush()
    return chat, reading_session, opener


def _conversation_fields(
    chat: Chat, reading_session: ChatSession | None, opener: Message | None,
    price: float | None, balance: float,
) -> dict:
    """The conversation as both openers report it."""
    return {
        "chat_id": chat.id,
        "chat_session_id": reading_session.id if reading_session is not None else None,
        "status": chat.status.value,
        "billing_mode": "per_message",
        "client_joined_at": (
            chat.client_joined_at.isoformat() if chat.client_joined_at is not None else None
        ),
        "opener_message_id": opener.id if opener is not None else None,
        "price_per_message": price,
        "client_balance": balance,
    }


async def _store_charged_message(
    db: Session, chat: Chat, reading_session: ChatSession, client: User, content: str
) -> tuple[Message, float]:
    """Stage the message and its debit without committing the caller's session."""
    message = Message(
        chat_id=chat.id,
        chat_session_id=reading_session.id,
        sender_id=client.id,
        content=content,
        is_system=False,
        status=MessageStatus.SENT,
    )
    db.add(message)
    db.flush()
    result = await charge_client_message(
        db, chat, content, client, commit=False, message=message
    )
    from app.services.offline_replies import stage_if_offline

    stage_if_offline(db, chat, message)
    return result


async def send_client_message(
    db: Session, user: User, chat: Chat, content: str
) -> tuple[Message, float, float, datetime]:
    """Commit a socket send, reviving its existing conversation if needed.

    Refresh rows held by the long-lived socket session under the same client
    lock as /request. No opener or accept/join event belongs to a returning send.
    The socket handler queues the reply after broadcasting the committed message.
    """
    from app.services.session_manager import get_session_manager

    session_manager = get_session_manager()
    try:
        client = _lock_client(db, user)
        chat = (
            db.query(Chat)
            .filter(Chat.id == chat.id, Chat.user_id == client.id)
            .populate_existing()
            .one()
        )
        reading_session = _prepare_joined_session(db, chat)
        message, price = await _store_charged_message(
            db, chat, reading_session, client, content
        )
        balance = round(get_spendable_stardust(db, client), 2)
        db.commit()
        committed_at = datetime.now(timezone.utc)
    except BaseException:
        db.rollback()
        raise

    session_manager.track_joined_per_message_session(chat, reading_session, balance)
    return message, price, balance, committed_at


async def start_automatic_conversation(db: Session, user: User, request: ChatStart) -> dict:
    """Commit the opener, question, debit and joined session together, then queue.

    Lock the client before looking up the pair so simultaneous requests cannot
    create duplicate chats, openers or active sessions. Existing conversations
    keep their history and an already-active session is reused. A client may
    hold a conversation with every reader she likes: threads never close, so
    one thread never bars another.
    """
    from app.services.ai import reading_single
    from app.services.session_manager import get_session_manager

    session_manager = get_session_manager()
    try:
        client = _lock_client(db, user)
        reader = _reader_or_404(db, request.psychic_id)
        chat, reading_session, opener = find_or_open_conversation(db, client, reader)
        if chat.response_mode != ResponseMode.SABRI:
            # /request queues an automatic reply, so it never sends into a
            # conversation a person answers. The thread itself still opens
            # (open_conversation) and takes her messages over the socket.
            raise _refuse_unavailable()
        if reading_session is None:
            # A returning conversation: revived for this send, as the socket does.
            reading_session = _prepare_joined_session(db, chat)

        question, price = await _store_charged_message(
            db, chat, reading_session, client, request.message
        )
        balance = round(get_spendable_stardust(db, client), 2)
        result = {
            **_conversation_fields(chat, reading_session, opener, price, balance),
            "message_id": question.id,
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
    from app.services.owner_messaging import CLIENT_MESSAGE, notify_owner

    notify_owner(result["chat_id"], CLIENT_MESSAGE)
    return result


def open_conversation(db: Session, user: User, psychic_id: int) -> dict:
    """Open the per-message conversation with a reader, or find it, with no message.

    One transaction, the client's row locked as start_automatic_conversation
    locks it. A new conversation is created ACTIVE with its clockless joined
    session and the reader's opener, nothing charged, no reply queued, and it
    is then registered with the session manager as /request registers its own.
    An existing conversation, whatever its status or response mode (one a
    person answers included: the profile's Message button opens the thread
    she can already write in from her Chats list), is returned untouched:
    reviving it is the send's business. Nothing here looks at her balance; a
    client with nothing can open a thread and read the opener.
    """
    from app.services.session_manager import get_session_manager

    session_manager = get_session_manager()
    try:
        client = _lock_client(db, user)
        reader = _reader_or_404(db, psychic_id)
        price = price_of_reader(reader)
        if price is None:
            raise _refuse_unavailable()
        chat, reading_session, opener = find_or_open_conversation(db, client, reader)
        created = reading_session is not None
        if not created:
            reading_session = _latest_session(db, chat)
        balance = round(get_spendable_stardust(db, client), 2)
        result = {
            **_conversation_fields(chat, reading_session, opener, price, balance),
            "created": created,
        }
        db.commit()
    except BaseException:
        # Also unwind cancellation: no half-opened conversation.
        db.rollback()
        raise

    if created:
        session_manager.track_joined_per_message_session(chat, reading_session, balance)
    return result
