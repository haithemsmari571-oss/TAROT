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
from app.services.stardust_rewards import expire_earned_stardust

logger = get_logger(__name__)

CHECK_INTERVAL_SECONDS = 300  # re-check every 5 minutes

# Guards the once-per-day earned-Stardust expiry sweep (UTC date it last ran).
_last_expiry_sweep_date = None


def _run_daily_expiry_sweep(now) -> None:
    """Forfeit earned Stardust past its 30-day life, at most once per UTC day.

    Independent of the AI content engine (runs even with no API key). Expiry is
    ALSO enforced at read time — expired lots are already excluded from every
    balance and from spending — so this sweep is purely for writing the EXPIRE
    ledger rows and flagging lots; it never changes a client's spendable total.
    The underlying operation is idempotent, so a duplicate run is harmless.
    """
    global _last_expiry_sweep_date
    today = now.date()
    if _last_expiry_sweep_date == today:
        return
    with SessionLocal() as db:
        summary = expire_earned_stardust(db, now=now)
    _last_expiry_sweep_date = today
    logger.info(
        "earned_stardust_expiry_swept",
        date=today.isoformat(),
        lots_expired=summary.get("lots_expired", 0),
        total_forfeited=summary.get("total_forfeited", 0.0),
    )


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

            # Expire earned Stardust past 30 days (once per UTC day). Runs
            # regardless of AI configuration and before content generation.
            _run_daily_expiry_sweep(now)

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
