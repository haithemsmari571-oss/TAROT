import logging
import re
import structlog
from sqlalchemy.exc import StatementError
from app.config import get_app_settings

# An email address anywhere in a text: an exception's message, a path.
EMAIL_IN_TEXT = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+")
# The one path part that is a secret: the account-verification link carries its
# one-time token as the end of GET /api/auth/verify-account/{token} (routers/auth.py).
SECRET_PATH_SEGMENT = "/verify-account/"
REDACTED = "<redacted>"


def mask_email(email: str | None) -> str:
    """An email address as a log line may show it: the first letter and the
    domain, "n***@example.com". Log lines never carry a full address."""
    local, at, domain = (email or "").partition("@")
    if not at:
        return "***"
    return f"{local[:1]}***@{domain}"


def mask_emails(text: str) -> str:
    """The text with every email address in it masked as mask_email does."""
    return EMAIL_IN_TEXT.sub(lambda match: mask_email(match.group(0)), text)


def error_fields(error: BaseException) -> dict:
    """How a log line describes an error: its class and the first line of its
    message, every email address in it masked. A database error gives only its
    driver's first line: SQLAlchemy's own text adds the statement and its
    parameters, and Postgres's DETAIL line the failing row, and either can hold
    a password hash or an email address."""
    source = error.orig if isinstance(error, StatementError) and error.orig is not None else error
    lines = str(source).strip().splitlines()
    return {"error_type": error.__class__.__name__, "error": mask_emails(lines[0] if lines else "")}


def log_safe_path(path: str) -> str:
    """A request path as a log line may show it: the verification token is
    replaced, the rest is kept."""
    head, segment, _secret = path.partition(SECRET_PATH_SEGMENT)
    return f"{head}{segment}{REDACTED}" if segment else path


class AccessLogPathFilter(logging.Filter):
    """uvicorn's access line takes (client, method, path with query, version,
    status) as its arguments; the path goes out through log_safe_path."""

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) >= 3 and isinstance(args[2], str):
            record.args = (*args[:2], log_safe_path(args[2]), *args[3:])
        return True


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

    access_log = logging.getLogger("uvicorn.access")
    if not any(isinstance(f, AccessLogPathFilter) for f in access_log.filters):
        access_log.addFilter(AccessLogPathFilter())


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
