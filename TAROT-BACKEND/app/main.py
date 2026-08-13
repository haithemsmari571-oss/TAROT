import os

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
    articles_router,
    admin_articles_router,
    public_seo_router,
    review_router,
    settings_router,
    notification_router,
    admin_transaction_router,
    admin_psychic_router,
    dashboard_router,
    landing_router,
    public_settings_router,
    client_dossier_router,
    admin_tasks_router,
    constellation_router,
    admin_ai_prompts_router,
    admin_content_router,
    reading_ai_router,
    second_brain_readonly_router,
    second_brain_situation_router,
    admin_onboarding_router,
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

    # Housekeeping: delete evidence files whose claims resolved >60 days ago
    # (Section 6.1). Runs on startup; the nightly job will also call it later.
    try:
        from app.services.tasks import cleanup_resolved_evidence

        with SessionLocal() as _db:
            cleanup_resolved_evidence(_db)
    except Exception as e:
        logger.warning("evidence_cleanup_startup_failed", error=str(e))

    # AI Prompt Registry: ensure every shipped prompt exists in the DB.
    try:
        from app.services.ai import registry as ai_registry

        with SessionLocal() as _db:
            ai_registry.seed_prompts(_db)
    except Exception as e:
        logger.warning("ai_prompt_seed_failed", error=str(e))

    # Nightly content engine scheduler (no external cron in this stack).
    try:
        from app.tasks.content_job import start_content_scheduler_thread

        start_content_scheduler_thread()
    except Exception as e:
        logger.warning("content_scheduler_start_failed", error=str(e))

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

# CORS: pinned to the known first-party origins (Stage 2 hardening — was "*").
# The Second Brain CRM's Vulcan bridge is trusted explicitly; native mobile
# apps send no Origin header, so CORS does not affect them. Extra origins can
# be added per-environment via EXTRA_CORS_ORIGINS (comma-separated).
_extra_origins = [
    origin.strip()
    for origin in os.environ.get("EXTRA_CORS_ORIGINS", "").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://askvalentina.co.uk",
        "https://www.askvalentina.co.uk",
        "http://localhost:5173",  # web dev server
        "http://127.0.0.1:5173",
        "http://127.0.0.1:4317",  # Second Brain CRM — Vulcan bridge
        *_extra_origins,
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add request context middleware
app.add_middleware(RequestContextMiddleware)


app.include_router(
    auth_router,
    prefix="/api/auth",
    tags=["Auth"],
)

app.include_router(
    psychic_router,
    prefix="/api/psychic",
    tags=["Psychic"],
)

app.include_router(
    categories_router,
    prefix="/api/category",
    tags=["Category"],
)

app.include_router(
    chat_router,
    prefix="/api/chat",
    tags=["Chat"],
)

app.include_router(
    medias_router,
    prefix="/api/media",
    tags=["Media"],
)

app.include_router(
    payment_router,
    prefix="/api/payment",
    tags=["Payment"],
)

app.include_router(
    transaction_router,
    prefix="/api/transactions",
    tags=["Transactions"],
)

app.include_router(
    refund_router,
    prefix="/api/admin/refunds",
    tags=["Admin - Refunds"],
)

app.include_router(
    user_router,
    prefix="/api/admin",
    tags=["Admin - Users"],
)

app.include_router(
    profile_router,
    prefix="/api/profile",
    tags=["User Profile"],
)

app.include_router(
    zodiac_router,
    prefix="/api/zodiac",
    tags=["Zodiac & Life Path"],
)
app.include_router(articles_router, prefix="/api/articles", tags=["Articles"])
app.include_router(admin_articles_router, prefix="/api/admin/articles", tags=["Admin Articles"])
app.include_router(public_seo_router, tags=["Public SEO"])

app.include_router(
    admin_zodiac_router,
    prefix="/api/admin/zodiac",
    tags=["Admin - Zodiac & Life Path"],
)

app.include_router(
    review_router,
    prefix="/api/reviews",
    tags=["Reviews"],
)

app.include_router(
    settings_router,
    prefix="/api/admin",
    tags=["Admin - Settings"],
)

app.include_router(
    notification_router,
    prefix="/api/notifications",
    tags=["Notifications"],
)

app.include_router(
    admin_transaction_router,
    prefix="/api/admin",
    tags=["Admin - Transactions"],
)

app.include_router(
    admin_psychic_router,
    prefix="/api/admin",
    tags=["Admin - Psychics"],
)

app.include_router(
    dashboard_router,
    prefix="/api/admin",
    tags=["Admin - Dashboard"],
)

app.include_router(
    landing_router,
    prefix="/api",
    tags=["Landing Content"],
)

app.include_router(
    public_settings_router,
    prefix="/api",
    tags=["Public Settings"],
)

app.include_router(
    client_dossier_router,
    prefix="/api",
    tags=["Client Dossier"],
)

app.include_router(
    admin_tasks_router,
    prefix="/api/admin",
    tags=["Admin - Rituals (Tasks & Claims)"],
)

app.include_router(
    constellation_router,
    prefix="/api",
    tags=["Constellation (Client)"],
)

app.include_router(
    admin_ai_prompts_router,
    prefix="/api/admin",
    tags=["Admin - AI Prompts"],
)

app.include_router(
    admin_content_router,
    prefix="/api/admin",
    tags=["Admin - Content Engine & Settings"],
)

app.include_router(
    reading_ai_router,
    prefix="/api/chat",
    tags=["AI Reading Pipeline"],
)

app.include_router(
    second_brain_readonly_router,
    prefix="/api/integrations/second-brain/valentina/v1",
    tags=["Second Brain - Valentina (Read Only)"],
)

app.include_router(
    second_brain_situation_router,
    prefix="/api/integrations/second-brain/valentina/v2",
    tags=["Second Brain - Situation Records (Read Only)"],
)

app.include_router(
    admin_onboarding_router,
    prefix="/api/admin",
    tags=["Admin - Psychic Onboarding"],
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
