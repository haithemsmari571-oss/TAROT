from fastapi import FastAPI
from contextlib import asynccontextmanager
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.exceptions.domain import DomainError
from app.logging_config import configure_logging, get_logger
from app.middleware import RequestContextMiddleware
from app.routers import (
    auth_router,
    psychic_router,
    categories_router,
    medias_router,
    chat_router,
    payment_router,
    transaction_router,
    refund_router,
    user_router,
    profile_router,
    zodiac_router,
    admin_zodiac_router,
    review_router,
    settings_router,
    notification_router,
    buy_option_router,
    admin_buy_option_router,
    admin_transaction_router,
    admin_psychic_router,
)
import app.models

# Configure logging
configure_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.tasks.billing_task import start_billing_thread
    from app.services.session_manager import initialize_session_manager
    from app.database.client import SessionLocal

    # Start billing thread
    start_billing_thread()

    # Initialize and start session manager (no DB session needed - uses session-per-operation)
    session_manager = initialize_session_manager()
    await session_manager.start()
    logger.info("session_manager_started")

    logger.info("application_started", message="All background tasks initialized")

    yield

    logger.info("application_shutting_down")

    # Cleanup: Stop session manager
    try:
        await session_manager.stop()
        logger.info("session_manager_stopped")
    except Exception as e:
        logger.error("error_stopping_session_manager", error=str(e))


app = FastAPI(lifespan=lifespan)

# Add CORS middleware - allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add request context middleware
app.add_middleware(RequestContextMiddleware)


app.include_router(
    auth_router,
    prefix="/auth",
    tags=["Auth"],
)

app.include_router(
    psychic_router,
    prefix="/psychic",
    tags=["Psychic"],
)

app.include_router(
    categories_router,
    prefix="/category",
    tags=["Category"],
)

app.include_router(
    chat_router,
    prefix="/chat",
    tags=["Chat"],
)

app.include_router(
    medias_router,
    prefix="/media",
    tags=["Media"],
)

app.include_router(
    payment_router,
    prefix="/payment",
    tags=["Payment"],
)

app.include_router(
    transaction_router,
    prefix="/transactions",
    tags=["Transactions"],
)

app.include_router(
    refund_router,
    prefix="/admin/refunds",
    tags=["Admin - Refunds"],
)

app.include_router(
    user_router,
    prefix="/admin",
    tags=["Admin - Users"],
)

app.include_router(
    profile_router,
    prefix="/profile",
    tags=["User Profile"],
)

app.include_router(
    zodiac_router,
    prefix="/zodiac",
    tags=["Zodiac & Life Path"],
)

app.include_router(
    admin_zodiac_router,
    prefix="/admin/zodiac",
    tags=["Admin - Zodiac & Life Path"],
)

app.include_router(
    review_router,
    prefix="/reviews",
    tags=["Reviews"],
)

app.include_router(
    settings_router,
    prefix="/admin",
    tags=["Admin - Settings"],
)

app.include_router(
    notification_router,
    prefix="/notifications",
    tags=["Notifications"],
)

app.include_router(
    buy_option_router,
    prefix="/buy-options",
    tags=["Buy Options"],
)

app.include_router(
    admin_buy_option_router,
    prefix="/admin",
    tags=["Admin - Buy Options"],
)

app.include_router(
    admin_transaction_router,
    prefix="/admin",
    tags=["Admin - Transactions"],
)

app.include_router(
    admin_psychic_router,
    prefix="/admin",
    tags=["Admin - Psychics"],
)


@app.exception_handler(DomainError)
async def domain_exception_handler(conn, exc: DomainError):
    logger.warning(
        "domain_error_handled",
        status_code=exc.status_code,
        message=exc.message,
        error_type=exc.__class__.__name__,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={"message": exc.message},
    )


def main():
    logger.info("hello_from_tarot_backend")


if __name__ == "__main__":
    main()
