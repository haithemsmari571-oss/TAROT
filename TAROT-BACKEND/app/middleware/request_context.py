"""Middleware for capturing and tracking request context."""

import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.context import (
    RequestContext,
    clear_request_context,
    generate_request_id,
    set_request_context,
)


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Middleware to capture request metadata and set up request context."""

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        """Process the request and set up context."""
        # Generate unique request ID
        request_id = generate_request_id()

        # Extract client IP (handle proxy headers)
        client_ip = self._get_client_ip(request)

        # Extract user agent
        user_agent = request.headers.get("user-agent")

        # Create request context
        context = RequestContext(
            request_id=request_id,
            client_ip=client_ip,
            user_agent=user_agent,
            endpoint=request.url.path,
            method=request.method,
        )

        # Set context for this request
        set_request_context(context)

        # Bind context to structlog for this request
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            client_ip=client_ip,
            user_agent=user_agent,
            endpoint=request.url.path,
            method=request.method,
        )

        try:
            # Process the request
            response: Response = await call_next(request)

            # Add request ID to response headers for client tracking
            response.headers["X-Request-ID"] = request_id

            return response
        finally:
            # Clean up context after request
            clear_request_context()
            structlog.contextvars.clear_contextvars()

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP from request, handling proxy headers."""
        # Check common proxy headers
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            # X-Forwarded-For can contain multiple IPs, take the first one
            return forwarded_for.split(",")[0].strip()

        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip

        # Fall back to direct client
        if request.client:
            return request.client.host

        return "unknown"
