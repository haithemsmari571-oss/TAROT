import json
from datetime import datetime, timedelta

from fastapi import WebSocket
from sqlalchemy.orm import Session

from app.enums.chat_termination_reason import ChatTerminationReason
from app.logging_config import get_logger
from app.models import User

logger = get_logger(__name__)


def get_remaining_session_time(
    db: Session, user_id: int, psychic_price_per_second: float
) -> int:
    """
    Calculate seconds remaining based on current balance.

    Args:
        db: Database session
        user_id: User ID
        psychic_price_per_second: Psychic's price per second

    Returns:
        Remaining seconds (0 if insufficient)
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user or psychic_price_per_second <= 0:
        return 0

    remaining_seconds = int(user.balance / psychic_price_per_second)
    return max(remaining_seconds, 0)


def should_send_warning(remaining_seconds: int, threshold_seconds: int = 300) -> bool:
    """
    Check if low balance warning should be sent.

    Args:
        remaining_seconds: Seconds remaining
        threshold_seconds: Warning threshold (default: 5 minutes)

    Returns:
        True if warning should be sent
    """
    return 0 < remaining_seconds <= threshold_seconds


async def send_balance_warning(
    websocket: WebSocket, remaining_seconds: int, remaining_points: int
):
    """
    Send low balance warning via WebSocket.

    Args:
        websocket: WebSocket connection
        remaining_seconds: Seconds remaining
        remaining_points: Points remaining
    """
    message = {
        "event": "low_balance_warning",
        "remaining_seconds": remaining_seconds,
        "remaining_points": remaining_points,
        "message": f"Low balance warning: You have approximately {remaining_seconds} seconds ({remaining_points} points) remaining.",
    }

    try:
        await websocket.send_text(json.dumps(message))
        logger.info(
            "balance_warning_sent",
            remaining_seconds=remaining_seconds,
            remaining_points=remaining_points,
            threshold_seconds=120,
        )
    except Exception as e:
        logger.error(
            "balance_warning_send_failed",
            remaining_seconds=remaining_seconds,
            remaining_points=remaining_points,
            error=str(e),
            error_type=e.__class__.__name__,
            exc_info=True,
        )


async def send_session_ending_soon(websocket: WebSocket, remaining_seconds: int):
    """
    Send session ending soon warning via WebSocket.

    Args:
        websocket: WebSocket connection
        remaining_seconds: Seconds remaining before session ends
    """
    message = {
        "event": "session_ending_soon",
        "remaining_seconds": remaining_seconds,
        "message": f"Session will end in {remaining_seconds} seconds due to insufficient balance.",
    }

    try:
        await websocket.send_text(json.dumps(message))
        logger.info(
            "session_ending_soon_sent",
            remaining_seconds=remaining_seconds,
        )
    except Exception as e:
        logger.error(
            "session_ending_soon_send_failed",
            remaining_seconds=remaining_seconds,
            error=str(e),
            error_type=e.__class__.__name__,
            exc_info=True,
        )


async def send_session_ended_no_balance(websocket: WebSocket):
    """
    Send session ended notification due to no balance.

    Args:
        websocket: WebSocket connection
    """
    message = {
        "event": "session_ended_no_balance",
        "message": "Session has ended due to insufficient balance.",
    }

    try:
        await websocket.send_text(json.dumps(message))
        logger.info("session_ended_no_balance_sent")
    except Exception as e:
        logger.error(
            "session_ended_no_balance_send_failed",
            error=str(e),
            error_type=e.__class__.__name__,
            exc_info=True,
        )


async def send_balance_update(
    websocket: WebSocket, new_balance: int, deducted_amount: int
):
    """
    Notify user of balance change after billing.

    Args:
        websocket: WebSocket connection
        new_balance: New balance after deduction
        deducted_amount: Amount deducted
    """
    message = {
        "event": "balance_updated",
        "new_balance": new_balance,
        "amount_deducted": deducted_amount,
        "message": f"{deducted_amount} points deducted. New balance: {new_balance} points.",
    }

    try:
        await websocket.send_text(json.dumps(message))
        logger.info(
            "balance_update_sent",
            new_balance=new_balance,
            amount_deducted=deducted_amount,
            currency="points",
        )
    except Exception as e:
        logger.error(
            "balance_update_send_failed",
            new_balance=new_balance,
            amount_deducted=deducted_amount,
            error=str(e),
            error_type=e.__class__.__name__,
            exc_info=True,
        )


async def send_insufficient_funds_notification(
    websocket: WebSocket, current_balance: int = 0
):
    """
    Send notification before force disconnecting due to insufficient funds.

    Args:
        websocket: WebSocket connection
        current_balance: Current balance (usually 0)
    """
    message = {
        "event": "insufficient_funds",
        "message": "Your balance is insufficient to continue this session. The chat will now end.",
        "current_balance": current_balance,
        "session_ended": True,
    }

    try:
        await websocket.send_text(json.dumps(message))
        logger.warning(
            "insufficient_funds_notification_sent",
            current_balance=current_balance,
        )
    except Exception as e:
        logger.error(
            "insufficient_funds_notification_failed",
            current_balance=current_balance,
            error=str(e),
            error_type=e.__class__.__name__,
            exc_info=True,
        )


async def pause_chat_insufficient_funds(
    websocket: WebSocket, db: Session, chat_id: int
):
    """
    Pause chat session due to insufficient funds and notify user to top up.

    Args:
        websocket: WebSocket connection
        db: Database session
        chat_id: Chat ID to pause
    """
    from app.services.chats import update_chat_status
    from app.manager import manager
    from app.notification_manager import notification_manager
    from app.enums.chat_status import ChatStatus
    from app.enums.notification_type import NotificationType
    from app.models import Chat, ChatSession, SessionInterval
    from datetime import datetime
    from sqlalchemy import desc

    # Send notification before pausing
    await send_insufficient_funds_notification(websocket)

    # Get chat details
    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if not chat:
        logger.error("chat_not_found_for_pause", chat_id=chat_id)
        return

    # Get session time data
    session = (
        db.query(ChatSession)
        .filter(ChatSession.chat_id == chat_id)
        .order_by(desc(ChatSession.id))
        .first()
    )

    elapsed_seconds = 0
    estimated_cost = 0.0

    if session:
        # Calculate elapsed time
        current_interval = (
            db.query(SessionInterval)
            .filter(SessionInterval.session_id == session.id)
            .filter(SessionInterval.ended_at == None)
            .order_by(desc(SessionInterval.id))
            .first()
        )

        completed_intervals = (
            db.query(SessionInterval)
            .filter(SessionInterval.session_id == session.id)
            .filter(SessionInterval.ended_at != None)
            .all()
        )

        for interval in completed_intervals:
            duration = (interval.ended_at - interval.started_at).total_seconds()
            elapsed_seconds += duration

        if current_interval:
            current_duration = (
                datetime.now() - current_interval.started_at
            ).total_seconds()
            elapsed_seconds += current_duration

        estimated_cost = elapsed_seconds * chat.psychic.price_per_second

    # Update chat status to PAUSED and set paused_at timestamp
    try:
        chat.paused_at = datetime.now()
        update_chat_status(db, chat_id, ChatStatus.PAUSED)
        logger.warning(
            "chat_paused_insufficient_funds",
            chat_id=chat_id,
            elapsed_seconds=elapsed_seconds,
            estimated_cost=estimated_cost,
            paused_at=chat.paused_at.isoformat(),
        )

        # Send system message to chat about pause
        system_message = {
            "type": "system",
            "content": "The session has been paused due to insufficient balance. Please top up to continue.",
            "timestamp": datetime.now().isoformat(),
        }
        await manager.send_to_chat(message=system_message, chat_id=str(chat_id))

        # Send CHAT_PAUSED_INSUFFICIENT_FUNDS notification to client via notification WebSocket
        pause_notification_data = {
            "type": "notification",
            "notification_type": NotificationType.CHAT_PAUSED_INSUFFICIENT_FUNDS,
            "title": "Chat Paused - Balance Depleted",
            "message": "Your balance is insufficient. Please top up to continue the session.",
            "data": {
                "chat_id": chat_id,
                "reason": "INSUFFICIENT_BALANCE",
                "elapsed_seconds": int(elapsed_seconds),
                "estimated_cost": round(estimated_cost, 2),
                "client_balance": float(chat.user.balance),
            },
            "timestamp": datetime.now().isoformat(),
        }
        await notification_manager.send_to_user(pause_notification_data, chat.user_id)

        # Also send to psychic
        psychic_notification_data = {
            "type": "notification",
            "notification_type": NotificationType.CHAT_PAUSED_INSUFFICIENT_FUNDS,
            "title": "Chat Paused - Client Balance Depleted",
            "message": f"Client's balance is insufficient. Session paused.",
            "data": {
                "chat_id": chat_id,
                "reason": "CLIENT_INSUFFICIENT_BALANCE",
                "elapsed_seconds": int(elapsed_seconds),
                "estimated_cost": round(estimated_cost, 2),
                "client_balance": float(chat.user.balance),
            },
            "timestamp": datetime.now().isoformat(),
        }
        await notification_manager.send_to_user(
            psychic_notification_data, chat.psychic_id
        )

    except Exception as e:
        logger.error(
            "chat_pause_failed_insufficient_funds",
            chat_id=chat_id,
            error=str(e),
            error_type=e.__class__.__name__,
            exc_info=True,
        )


async def force_disconnect_insufficient_funds(
    websocket: WebSocket, db: Session, chat_id: int
):
    """
    Force disconnect and end session due to insufficient funds.
    DEPRECATED: Use pause_chat_insufficient_funds instead.

    Args:
        websocket: WebSocket connection
        db: Database session
        chat_id: Chat ID to end
    """
    # For backward compatibility, call pause instead
    await pause_chat_insufficient_funds(websocket, db, chat_id)


async def auto_end_expired_paused_chats(db: Session, timeout_minutes: int = 30):
    """
    Automatically end chats that have been paused for longer than the timeout.
    This should be called periodically by a background task.

    Args:
        db: Database session
        timeout_minutes: Minutes after which a paused chat should be auto-ended (default: 30)
    """
    from app.models import Chat
    from app.enums.chat_status import ChatStatus
    from app.enums.chat_termination_reason import ChatTerminationReason
    from app.services.chats import end_chat_session
    from app.notification_manager import notification_manager
    from app.enums.notification_type import NotificationType

    # Find all chats that are PAUSED and have been paused for more than timeout_minutes
    timeout_threshold = datetime.now() - timedelta(minutes=timeout_minutes)

    expired_chats = (
        db.query(Chat)
        .filter(Chat.status == ChatStatus.PAUSED)
        .filter(Chat.paused_at != None)
        .filter(Chat.paused_at <= timeout_threshold)
        .all()
    )

    for chat in expired_chats:
        try:
            # End the chat session
            end_chat_session(db, chat.id, ChatTerminationReason.TIMEOUT)

            logger.warning(
                "chat_auto_ended_paused_timeout",
                chat_id=chat.id,
                paused_at=chat.paused_at.isoformat() if chat.paused_at else None,
                timeout_minutes=timeout_minutes,
            )

            # Send notification to client
            client_notification = {
                "type": "notification",
                "notification_type": NotificationType.CHAT_ENDED,
                "title": "Chat Session Ended",
                "message": f"Your paused chat session has been automatically ended after {timeout_minutes} minutes of inactivity.",
                "data": {
                    "chat_id": chat.id,
                    "reason": "PAUSED_TIMEOUT",
                    "timeout_minutes": timeout_minutes,
                },
                "timestamp": datetime.now().isoformat(),
            }
            await notification_manager.send_to_user(client_notification, chat.user_id)

            # Send notification to psychic
            psychic_notification = {
                "type": "notification",
                "notification_type": NotificationType.CHAT_ENDED,
                "title": "Chat Session Ended",
                "message": f"The paused chat session has been automatically ended after {timeout_minutes} minutes.",
                "data": {
                    "chat_id": chat.id,
                    "reason": "CLIENT_PAUSED_TIMEOUT",
                    "timeout_minutes": timeout_minutes,
                },
                "timestamp": datetime.now().isoformat(),
            }
            await notification_manager.send_to_user(
                psychic_notification, chat.psychic_id
            )

        except Exception as e:
            logger.error(
                "auto_end_paused_chat_failed",
                chat_id=chat.id,
                error=str(e),
                error_type=e.__class__.__name__,
                exc_info=True,
            )
            continue

    if expired_chats:
        logger.info(
            "auto_ended_expired_paused_chats",
            count=len(expired_chats),
            timeout_minutes=timeout_minutes,
        )

    return len(expired_chats)
