import threading
import time

from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.database.client import SessionLocal
from app.enums.chat_termination_reason import ChatTerminationReason
from app.exceptions.transactions import InsufficientBalanceError
from app.logging_config import get_logger
from app.services.billing import bill_session_interval, get_unbilled_active_sessions

settings = get_app_settings()
logger = get_logger(__name__)


def bill_interval_with_retry(
    db: Session, interval_id: int, psychic_price_per_second: float
) -> bool:
    """
    Bill a session interval with retry logic based on config settings.

    Args:
        db: Database session
        interval_id: SessionInterval ID
        psychic_price_per_second: Psychic's price per second

    Returns:
        True if billing succeeded, False if failed after all retries
    """
    max_retries = settings.BILLING_TASK_MAX_RETRIES
    retry_delay = settings.BILLING_TASK_RETRY_DELAY_SECONDS

    for attempt in range(max_retries):
        try:
            transaction = bill_session_interval(
                db, interval_id, psychic_price_per_second
            )
            if transaction:
                logger.info(
                    "interval_billed",
                    interval_id=interval_id,
                    amount=transaction.amount,
                    currency="points",
                )
            else:
                logger.debug(
                    "zero_cost_interval_billed",
                    interval_id=interval_id,
                    reason="very short duration",
                )
            return True

        except InsufficientBalanceError as e:
            # Don't retry on insufficient balance - this is expected behavior
            logger.warning(
                "insufficient_balance_for_interval",
                interval_id=interval_id,
                error=str(e),
            )
            raise  # Re-raise to trigger session termination

        except Exception as e:
            if attempt < max_retries - 1:
                logger.warning(
                    "billing_attempt_failed_retrying",
                    interval_id=interval_id,
                    attempt=attempt + 1,
                    max_retries=max_retries,
                    retry_delay_seconds=retry_delay,
                    error=str(e),
                )
                time.sleep(retry_delay)
            else:
                logger.error(
                    "billing_failed_all_retries",
                    interval_id=interval_id,
                    max_retries=max_retries,
                    error=str(e),
                    exc_info=True,
                )
                db.rollback()
                return False

    return False


def periodic_billing_task():
    """
    Background thread that runs every 60 seconds.
    Bills ended session intervals that haven't been billed yet.

    This task (SIMPLIFIED - Session termination now handled by SessionManager):
    1. Finds all unbilled intervals that have ended (ended_at != NULL)
    2. Bills each interval with retry logic
    3. Handles errors gracefully to prevent task crashes

    Note: Session termination due to insufficient balance is now handled by
    SessionManager in real-time, not by this billing task.
    """
    logger.info("periodic_billing_task_started")

    while True:
        try:
            time.sleep(60)  # Wait 60 seconds between runs

            db: Session = SessionLocal()
            try:
                # Get all unbilled intervals that have ended (older than 60s to avoid race conditions)
                from datetime import datetime, timedelta
                from app.models.session_intervals import SessionInterval

                unbilled_intervals = (
                    db.query(SessionInterval)
                    .filter(
                        SessionInterval.is_billed == False,
                        SessionInterval.ended_at != None,
                        SessionInterval.ended_at
                        < datetime.now() - timedelta(seconds=60),
                    )
                    .all()
                )

                if unbilled_intervals:
                    logger.info(
                        "unbilled_intervals_found",
                        count=len(unbilled_intervals),
                    )

                for interval in unbilled_intervals:
                    try:
                        # Get the chat to access psychic rate
                        from app.models.chat import Chat

                        chat = (
                            db.query(Chat)
                            .filter(Chat.id == interval.session.chat_id)
                            .first()
                        )

                        if not chat:
                            logger.error(
                                "chat_not_found_for_interval", interval_id=interval.id
                            )
                            continue

                        # Bill the interval with retry logic
                        success = bill_interval_with_retry(
                            db, interval.id, chat.psychic.price_per_second
                        )

                        if not success:
                            logger.error(
                                "interval_billing_skipped",
                                interval_id=interval.id,
                                reason="failed after all retries",
                            )

                    except InsufficientBalanceError as e:
                        # This shouldn't happen since SessionManager already ended the session
                        # But if it does, just mark as billed to avoid retry loops
                        logger.warning(
                            "insufficient_balance_during_billing",
                            interval_id=interval.id,
                            chat_id=chat.id if chat else None,
                            error=str(e),
                            action="marking as billed to skip",
                        )
                        interval.is_billed = True
                        db.commit()

                    except Exception as e:
                        logger.error(
                            "error_processing_interval",
                            interval_id=interval.id,
                            error=str(e),
                            exc_info=True,
                        )
                        db.rollback()
                        continue

            finally:
                db.close()

        except Exception as e:
            logger.critical(
                "periodic_billing_task_error",
                error=str(e),
                exc_info=True,
            )
            # Continue running despite errors


def start_billing_thread():
    """
    Start the periodic billing background thread.
    Called on application startup.
    """
    thread = threading.Thread(
        target=periodic_billing_task, daemon=True, name="BillingTask"
    )
    thread.start()
    logger.info("billing_thread_started", thread_name="BillingTask", daemon=True)
    return thread
