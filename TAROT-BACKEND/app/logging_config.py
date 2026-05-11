import logging
import structlog
from app.config import get_app_settings


def configure_logging():
    """Configure structlog based on environment."""
    settings = get_app_settings()
    is_dev = settings.ENVIRONMENT == "dev"

    # Set up processors
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.UnicodeDecoder(),
    ]

    if is_dev:
        # Development: colorful console output with pretty formatting
        structlog.configure(
            processors=[
                *shared_processors,
                structlog.processors.ExceptionPrettyPrinter(),
                structlog.dev.ConsoleRenderer(colors=True),
            ],
            wrapper_class=structlog.stdlib.BoundLogger,
            context_class=dict,
            logger_factory=structlog.stdlib.LoggerFactory(),
            cache_logger_on_first_use=True,
        )

        # Set log level to DEBUG for development
        logging.basicConfig(
            format="%(message)s",
            level=logging.DEBUG,
        )
    else:
        # Production: JSON output for structured logging
        structlog.configure(
            processors=[
                *shared_processors,
                structlog.processors.format_exc_info,
                structlog.processors.JSONRenderer(),
            ],
            wrapper_class=structlog.stdlib.BoundLogger,
            context_class=dict,
            logger_factory=structlog.stdlib.LoggerFactory(),
            cache_logger_on_first_use=True,
        )

        # Set log level to INFO for production
        logging.basicConfig(
            format="%(message)s",
            level=logging.INFO,
        )


def get_logger(name: str = "") -> structlog.stdlib.BoundLogger:
    """Get a structured logger instance.

    The logger will automatically include request context (request_id, client_ip,
    user_agent, etc.) if called within a request context set by the middleware.
    """
    return structlog.get_logger(name)


def bind_user_to_context(user_id: str | int) -> None:
    """Bind user ID to the current request context for logging.

    This should be called after authentication to associate logs with a user.

    Args:
        user_id: The ID of the authenticated user
    """
    structlog.contextvars.bind_contextvars(user_id=str(user_id))
