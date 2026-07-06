"""Nightly content engine (spec Section 4).

Generates next-day content for all 12 zodiac signs and stores it in
``daily_content`` — the Constellation reads ONLY from the DB. Code owns the card
choice, output parsing, the single retry, the yesterday-fallback and the cost
guard; the prompt (the words) lives in the AI Prompt Registry.
"""

import hashlib
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.logging_config import get_logger
from app.models import ContentGenerationRun, DailyContent
from app.services.ai import client as ai_client
from app.services.ai import registry
from app.services.ai.defaults import DAILY_CONTENT_KEY, MAJOR_ARCANA

logger = get_logger(__name__)

ZODIAC_SIGNS = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
]
REQUIRED_FIELDS = ("interpretation", "manifestation", "ritual", "quote_line")


def _pick_card(sign: str, on_date: date) -> tuple[int, str]:
    """Deterministic per (sign, date) so a re-run picks the same card."""
    seed = f"{on_date.isoformat()}|{sign}".encode()
    key = int(hashlib.sha256(seed).hexdigest(), 16) % len(MAJOR_ARCANA)
    return key, MAJOR_ARCANA[key]


def _generate_one(prompt_text: str, model: str) -> tuple[dict, int]:
    """Call the model, parse the five fields, retry ONCE on malformed output.
    Returns (fields, tokens_used). Raises on second failure."""
    last_err: Optional[Exception] = None
    tokens = 0
    for attempt in range(2):
        result = ai_client.run_prompt(prompt_text, model)
        tokens += result["input_tokens"] + result["output_tokens"]
        try:
            data = ai_client.parse_json_object(result["text"])
            fields = {k: str(data[k]).strip() for k in REQUIRED_FIELDS}
            if all(fields[k] for k in REQUIRED_FIELDS):
                return fields, tokens
            raise ValueError("missing/empty fields")
        except Exception as e:  # malformed → retry once
            last_err = e
            logger.warning("content_generate_malformed", attempt=attempt, error=str(e))
    raise ValueError(f"malformed output after retry: {last_err}")


def _upsert(db: Session, on_date: date, sign: str, card_key: int, card_name: str, fields: dict, source: str):
    row = (
        db.query(DailyContent)
        .filter(DailyContent.content_date == on_date, DailyContent.zodiac_sign == sign)
        .first()
    )
    if row is None:
        row = DailyContent(content_date=on_date, zodiac_sign=sign)
        db.add(row)
    row.card_key = card_key
    row.card_name = card_name
    row.interpretation = fields["interpretation"]
    row.manifestation = fields["manifestation"]
    row.ritual = fields["ritual"]
    row.quote_line = fields["quote_line"]
    row.source = source
    db.commit()


def _fallback_from_yesterday(db: Session, on_date: date, sign: str) -> bool:
    """Keep yesterday's content for a failed sign so the client never sees a
    blank section. Returns True if a copy was made."""
    prev = (
        db.query(DailyContent)
        .filter(
            DailyContent.content_date == on_date - timedelta(days=1),
            DailyContent.zodiac_sign == sign,
        )
        .first()
    )
    if not prev:
        return False  # read-time placeholder pool will cover this sign
    _upsert(
        db, on_date, sign, prev.card_key, prev.card_name,
        {
            "interpretation": prev.interpretation,
            "manifestation": prev.manifestation,
            "ritual": prev.ritual,
            "quote_line": prev.quote_line,
        },
        source="fallback_yesterday",
    )
    return True


def generate_for_date(
    db: Session, on_date: date, trigger: str = "scheduled"
) -> ContentGenerationRun:
    """Generate content for all 12 signs for ``on_date``. Never raises for a
    single sign — records per-sign success/failure and keeps yesterday's content
    on failure. Honours a token budget so a runaway loop can't burn money."""
    settings = get_app_settings()
    model = registry.get_prompt(db, DAILY_CONTENT_KEY).model
    budget = settings.CONTENT_RUN_TOKEN_BUDGET

    run = ContentGenerationRun(
        content_date=on_date,
        trigger=trigger,
        started_at=datetime.now(timezone.utc),
        status="RUNNING",
        signs_ok=[],
        signs_failed=[],
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    ok: list[str] = []
    failed: list[dict] = []
    total_tokens = 0

    for sign in ZODIAC_SIGNS:
        if total_tokens >= budget:
            failed.append({"sign": sign, "error": "token budget reached — skipped"})
            _fallback_from_yesterday(db, on_date, sign)
            continue
        card_key, card_name = _pick_card(sign, on_date)
        try:
            prompt = registry.render(
                db, DAILY_CONTENT_KEY,
                zodiac_sign=sign, date=on_date.isoformat(), card_name=card_name,
            )
            fields, tokens = _generate_one(prompt, model)
            total_tokens += tokens
            _upsert(db, on_date, sign, card_key, card_name, fields, "generated")
            ok.append(sign)
        except Exception as e:
            logger.error("content_generate_sign_failed", sign=sign, error=str(e))
            _fallback_from_yesterday(db, on_date, sign)
            failed.append({"sign": sign, "error": str(e)[:300]})

    # Estimate cost from total tokens (rough split for the display).
    run.finished_at = datetime.now(timezone.utc)
    run.signs_ok = ok
    run.signs_failed = failed
    run.output_tokens = total_tokens
    run.cost_usd = ai_client.estimate_cost(0, total_tokens)
    run.status = "SUCCESS" if not failed else ("PARTIAL" if ok else "FAILED")
    db.commit()

    registry.record_run(db, DAILY_CONTENT_KEY, f"{run.status} ({len(ok)}/12) at {run.finished_at.isoformat()}", run.finished_at)
    logger.info(
        "content_generation_done",
        content_date=on_date.isoformat(),
        status=run.status,
        ok=len(ok),
        failed=len(failed),
        tokens=total_tokens,
    )
    return run


def latest_run(db: Session) -> Optional[ContentGenerationRun]:
    return db.query(ContentGenerationRun).order_by(ContentGenerationRun.id.desc()).first()


def next_scheduled_run(now: Optional[datetime] = None) -> datetime:
    """The next time the nightly job will run (UTC)."""
    now = now or datetime.now(timezone.utc)
    hour = get_app_settings().CONTENT_JOB_HOUR_UTC
    run_today = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    return run_today if now < run_today else run_today + timedelta(days=1)
