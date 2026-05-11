"""Example usage of structlog in the TAROT backend.

This file demonstrates how to use the configured logger throughout the application.
"""

from app.logging_config import get_logger

# Get a logger for this module
logger = get_logger(__name__)


def example_basic_logging():
    """Basic logging examples."""
    # Simple log messages
    logger.debug("debug_message", detail="This only shows in dev mode")
    logger.info("info_message", detail="General information")
    logger.warning("warning_message", detail="Something to watch out for")
    logger.error("error_message", detail="An error occurred")
    logger.critical("critical_message", detail="Critical system error")


def example_structured_logging():
    """Structured logging with context."""
    # Log with structured data
    logger.info(
        "user_logged_in",
        user_id=123,
        username="john_doe",
        ip_address="192.168.1.1",
    )

    logger.info(
        "payment_processed",
        user_id=123,
        amount=100.50,
        currency="USD",
        transaction_id="txn_123456",
        payment_method="stripe",
    )

    logger.warning(
        "low_balance_warning",
        chat_id=456,
        user_id=123,
        remaining_seconds=30,
        current_balance=5,
    )


def example_exception_logging():
    """Exception logging examples."""
    try:
        result = 1 / 0
    except ZeroDivisionError as e:
        logger.error(
            "division_by_zero",
            error=str(e),
            exc_info=True,  # This will include the full traceback
        )

    try:
        raise ValueError("Invalid configuration")
    except ValueError:
        logger.exception(
            "configuration_error",
            config_key="STRIPE_API_KEY",
            # exception() automatically includes exc_info=True
        )


def example_context_binding():
    """Using bound loggers for maintaining context."""
    # Bind context that will be included in all subsequent logs
    request_logger = logger.bind(
        request_id="req_abc123",
        user_id=789,
    )

    request_logger.info("request_started", method="POST", path="/api/chat")
    request_logger.info("database_query", table="chats", operation="INSERT")
    request_logger.info("request_completed", status_code=200, duration_ms=150)

    # All three logs above will include request_id and user_id


def example_background_task_logging():
    """Logging in background tasks."""
    # Use structured logging for billing tasks
    logger.info(
        "billing_task_started",
        task_type="periodic_billing",
    )

    try:
        # Simulate billing
        logger.debug(
            "processing_interval",
            interval_id=123,
            chat_id=456,
            rate_per_minute=10,
        )

        logger.info(
            "interval_billed",
            interval_id=123,
            amount=10,
            user_balance_remaining=90,
        )
    except Exception as e:
        logger.error(
            "billing_task_failed",
            interval_id=123,
            error=str(e),
            exc_info=True,
        )


# Migration guide from print() to structlog
#
# OLD (print-based):
# print(f"Billed interval {interval_id}: {transaction.amount} points")
#
# NEW (structlog):
# logger.info(
#     "interval_billed",
#     interval_id=interval_id,
#     amount=transaction.amount,
#     currency="points",
# )
#
# OLD (print-based):
# print(f"Insufficient balance for interval {interval_id}: {e}")
#
# NEW (structlog):
# logger.warning(
#     "insufficient_balance",
#     interval_id=interval_id,
#     error=str(e),
# )
#
# OLD (print-based):
# print(f"Critical error in periodic billing task: {e}")
#
# NEW (structlog):
# logger.critical(
#     "periodic_billing_error",
#     error=str(e),
#     exc_info=True,
# )
