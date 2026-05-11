"""Request context for tracking request metadata across the application."""

import uuid
from contextvars import ContextVar
from typing import Optional

from pydantic import BaseModel


class RequestContext(BaseModel):
    """Model for storing request-level metadata."""

    request_id: str
    client_ip: Optional[str] = None
    user_agent: Optional[str] = None
    user_id: Optional[str] = None
    endpoint: Optional[str] = None
    method: Optional[str] = None

    class Config:
        frozen = True


# Context variable to store request context
_request_context: ContextVar[Optional[RequestContext]] = ContextVar(
    "request_context", default=None
)


def set_request_context(context: RequestContext) -> None:
    """Set the current request context."""
    _request_context.set(context)


def get_request_context() -> Optional[RequestContext]:
    """Get the current request context."""
    return _request_context.get()


def clear_request_context() -> None:
    """Clear the current request context."""
    _request_context.set(None)


def generate_request_id() -> str:
    """Generate a unique request ID."""
    return str(uuid.uuid4())


def get_request_context_dict() -> dict:
    """Get request context as a dictionary for logging."""
    context = get_request_context()
    if context:
        return context.model_dump(exclude_none=True)
    return {}
