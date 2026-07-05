from datetime import datetime, timedelta
from typing import List, Tuple

from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.enums.chat_session_status import ChatSessionStatus
from app.enums.chat_status import ChatStatus
from app.exceptions.transactions import (
    InsufficientBalanceError,
    SessionIntervalAlreadyBilledError,
)
from app.logging_config import get_logger
from app.models import Chat, ChatSession, SessionInterval, Transaction, User
from app.services.transactions import create_debit_transaction

logger = get_logger(__name__)


def calculate_interval_cost(interval: SessionInterval, price_per_second: float) -> int:
    """
    Calculate the cost for a session interval in points.

    Args:
        interval: SessionInterval object
        price_per_second: Psychic's price per second

    Returns:
        Cost in points (rounded to nearest integer)
    """
    # If interval hasn't ended yet, use current time
    end_time = interval.ended_at if interval.ended_at else datetime.now()
    start_time = interval.started_at

    # Calculate duration in seconds
    duration_seconds = (end_time - start_time).total_seconds()

    # Calculate cost (round to nearest integer)
    cost = int(duration_seconds * price_per_second)

    return max(cost, 0)  # Ensure non-negative


def bill_session_interval(
    db: Session, interval_id: int, psychic_price_per_second: float
) -> Transaction:
    """
    Bill a single session interval if not already billed.

    Args:
        db: Database session
        interval_id: SessionInterval ID to bill
        psychic_price_per_second: Psychic's price per second

    Returns:
        Created Transaction object

    Raises:
        SessionIntervalAlreadyBilledError: If interval already billed
        InsufficientBalanceError: If user doesn't have enough balance
    """
    # Get interval with lock
    interval = (
        db.query(SessionInterval)
        .filter(SessionInterval.id == interval_id)
        .with_for_update()
        .first()
    )

    if not interval:
        from app.exceptions.chats import SessionIntervalNotFound

        raise SessionIntervalNotFound()

    # Check if already billed
    if interval.is_billed:
        raise SessionIntervalAlreadyBilledError(interval_id)

    # Get chat and user information
    session = interval.session
    chat = session.chat
    user_id = chat.user_id
    psychic_username = chat.psychic.username

    # ── Never-joined guard ───────────────────────────────────────────────────
    # If the client never joined (viewed) the reading, the session sat in the
    # non-billing AWAITING_JOIN state and no reading time was consumed — do not
    # charge for a reading the client never opened. `mark_client_joined` stamps
    # `client_joined_at` for every real reading (web via /join since Phase 1, and
    # the mobile app), so a null value means the client never viewed it.
    #
    # Legacy-data sanity check: only skip when there was genuinely no reading —
    # i.e. the client authored no (non-system) messages. This prevents forgiving
    # a real conversation on any historical row that happens to lack
    # client_joined_at (e.g. a pre-join-mechanism session where a reading did
    # occur); such rows still bill normally.
    if chat.client_joined_at is None:
        from app.models.message import Message

        # Boundary = when THIS session started (its earliest interval). Only
        # messages sent during the session count as evidence a reading occurred.
        # Crucially this excludes the client's initial chat *request* message —
        # which every reading creates before the session starts — as well as any
        # messages from prior sessions on this (reused) chat row. Without this
        # window the request message alone made the count non-zero for every
        # reading, so the skip branch below was unreachable and never-joined
        # sessions were billed anyway.
        session_start = (
            db.query(func.min(SessionInterval.started_at))
            .filter(SessionInterval.session_id == session.id)
            .scalar()
        )

        client_message_count = (
            db.query(Message)
            .filter(
                Message.chat_id == chat.id,
                Message.sender_id == chat.user_id,
                Message.is_system == False,  # noqa: E712
                Message.created_at >= session_start,
            )
            .count()
        )
        if client_message_count == 0:
            logger.warning(
                "billing_skipped_client_never_joined",
                interval_id=interval.id,
                chat_id=chat.id,
                session_id=session.id,
                started_at=(
                    interval.started_at.isoformat() if interval.started_at else None
                ),
                ended_at=(
                    interval.ended_at.isoformat() if interval.ended_at else None
                ),
                note="client_joined_at is None and no client messages -> never viewed; not billing",
            )
            interval.is_billed = True
            db.commit()
            return None
        else:
            logger.warning(
                "billing_client_joined_at_null_but_reading_occurred",
                interval_id=interval.id,
                chat_id=chat.id,
                client_message_count=client_message_count,
                note="client_joined_at is None but client messages exist -> real reading; billing normally",
            )

    # Calculate cost
    cost = calculate_interval_cost(interval, psychic_price_per_second)

    # If cost is 0 (very short interval), still mark as billed but don't create transaction
    if cost == 0:
        interval.is_billed = True
        db.commit()
        return None

    # Calculate duration for description
    end_time = interval.ended_at if interval.ended_at else datetime.now()
    duration_seconds = int((end_time - interval.started_at).total_seconds())

    # Create standardized description
    description = f"Chat billing - Session #{session.id} - Interval #{interval.id} ({duration_seconds}s)"

    # Create metadata
    metadata = {
        "duration_seconds": duration_seconds,
        "psychic_id": chat.psychic_id,
        "psychic_username": psychic_username,
        "price_per_second": psychic_price_per_second,
    }

    # Create debit transaction
    transaction = create_debit_transaction(
        db=db,
        user_id=user_id,
        amount=cost,
        description=description,
        related_chat_id=chat.id,
        related_session_interval_id=interval.id,
        metadata=metadata,
    )

    # Mark interval as billed
    interval.is_billed = True
    db.commit()

    return transaction


def bill_all_unbilled_intervals(db: Session, chat_id: int) -> List[Transaction]:
    """
    Bill all unbilled intervals for a specific chat session.
    Called when a chat session ends to ensure all time is billed.

    Args:
        db: Database session
        chat_id: Chat ID

    Returns:
        List of created Transaction objects
    """
    transactions = []

    # Get chat with psychic info
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat or not chat.psychic:
        return transactions

    psychic_price_per_second = chat.psychic.price_per_second

    # Get all sessions for this chat
    sessions = db.query(ChatSession).filter(ChatSession.chat_id == chat_id).all()

    for session in sessions:
        # Get all unbilled intervals for this session
        unbilled_intervals = (
            db.query(SessionInterval)
            .filter(
                and_(
                    SessionInterval.session_id == session.id,
                    SessionInterval.is_billed == False,
                )
            )
            .all()
        )

        for interval in unbilled_intervals:
            try:
                transaction = bill_session_interval(
                    db, interval.id, psychic_price_per_second
                )
                if transaction:  # transaction can be None if cost is 0
                    transactions.append(transaction)
            except InsufficientBalanceError as e:
                # User ran out of balance - stop billing
                logger.warning(
                    "billing_stopped_insufficient_balance",
                    interval_id=interval.id,
                    chat_id=chat_id,
                    user_id=chat.user_id,
                    required_balance=e.required if hasattr(e, "required") else None,
                    available_balance=e.available if hasattr(e, "available") else None,
                )
                raise
            except SessionIntervalAlreadyBilledError:
                # Already billed, skip
                logger.debug(
                    "billing_interval_already_billed_skipped",
                    interval_id=interval.id,
                    chat_id=chat_id,
                )
                continue
            except Exception as e:
                logger.error(
                    "billing_interval_error",
                    interval_id=interval.id,
                    chat_id=chat_id,
                    error=str(e),
                    error_type=e.__class__.__name__,
                    exc_info=True,
                )
                db.rollback()
                raise

    return transactions


def minimum_balance_to_start(price_per_second: float) -> float:
    """The exact balance needed to start a reading = one full minute at the
    reader's rate (per-minute prepaid model), to 2 dp. £2.40/min → £2.40."""
    from app.config import get_app_settings

    min_seconds = get_app_settings().SESSION_MINIMUM_BALANCE_SECONDS
    return round((price_per_second or 0) * min_seconds, 2)


def check_user_can_start_session(db: Session, user_id: int, psychic_id: int) -> bool:
    """
    Check if the user can afford to start a reading — at least one full minute at
    the reader's rate (the first minute is charged upfront on join).

    Returns True if they have enough, False otherwise.
    """
    user = db.query(User).filter(User.id == user_id).first()
    psychic = db.query(User).filter(User.id == psychic_id).first()

    if not user or not psychic or not psychic.price_per_second:
        return False

    # Exact per-minute rate (no int floor) so the gate matches what the session
    # actually charges on join.
    required_balance = minimum_balance_to_start(psychic.price_per_second)

    return float(user.total_balance) >= required_balance


def get_unbilled_active_sessions(
    db: Session,
) -> List[Tuple[SessionInterval, Chat]]:
    """
    Get all active sessions with unbilled intervals older than 60 seconds.
    Used by background billing task.

    Returns:
        List of tuples: (SessionInterval, Chat)
    """
    # Calculate timestamp for 60 seconds ago
    sixty_seconds_ago = datetime.now() - timedelta(seconds=60)

    # Query for unbilled intervals in active sessions that started > 60 seconds ago
    results = (
        db.query(SessionInterval, Chat)
        .join(ChatSession, SessionInterval.session_id == ChatSession.id)
        .join(Chat, ChatSession.chat_id == Chat.id)
        .filter(
            and_(
                SessionInterval.is_billed == False,
                SessionInterval.started_at <= sixty_seconds_ago,
                ChatSession.status == ChatSessionStatus.ACTIVE,
                Chat.status == ChatStatus.ACTIVE,
            )
        )
        .all()
    )

    return results


def get_remaining_session_time(
    db: Session, user_id: int, psychic_price_per_second: float
) -> int:
    """
    Calculate how many seconds of session time a user can afford.

    Args:
        db: Database session
        user_id: User ID
        psychic_price_per_second: Psychic's price per second

    Returns:
        Remaining seconds user can chat (0 if insufficient balance)
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user or psychic_price_per_second <= 0:
        return 0

    # Calculate seconds remaining
    remaining_seconds = int(user.total_balance / psychic_price_per_second)

    return max(remaining_seconds, 0)
