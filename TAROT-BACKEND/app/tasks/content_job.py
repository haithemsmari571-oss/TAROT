"""Nightly content scheduler — an in-process background thread (no external cron
exists in this stack). Every few minutes it checks whether the upcoming day's
content has been generated yet; once past the scheduled hour it generates it.
Idempotent (won't double-run a day) and safe when no API key is set."""

import threading
import time
from datetime import datetime, timedelta, timezone

from app.config import get_app_settings
from app.database.client import SessionLocal
from app.logging_config import get_logger
from app.models import ContentGenerationRun
from app.services.ai import client as ai_client
from app.services.ai.content_engine import generate_for_date

logger = get_logger(__name__)

CHECK_INTERVAL_SECONDS = 300  # re-check every 5 minutes


def _already_generated(db, content_date) -> bool:
    return (
        db.query(ContentGenerationRun)
        .filter(
            ContentGenerationRun.content_date == content_date,
            ContentGenerationRun.status.in_(["SUCCESS", "PARTIAL"]),
        )
        .first()
        is not None
    )


def _loop():
    while True:
        try:
            now = datetime.now(timezone.utc)
            hour = get_app_settings().CONTENT_JOB_HOUR_UTC
            tomorrow = (now + timedelta(days=1)).date()
            if now.hour >= hour:
                with SessionLocal() as db:
                    if not _already_generated(db, tomorrow):
                        if ai_client.is_configured():
                            logger.info("content_job_starting", for_date=tomorrow.isoformat())
                            generate_for_date(db, tomorrow, trigger="scheduled")
                        else:
                            logger.info("content_job_skipped_no_api_key")
        except Exception as e:  # never let the scheduler thread die
            logger.error("content_job_loop_error", error=str(e), exc_info=True)
        time.sleep(CHECK_INTERVAL_SECONDS)


def start_content_scheduler_thread():
    threading.Thread(target=_loop, daemon=True, name="content-scheduler").start()
    logger.info("content_scheduler_started")
