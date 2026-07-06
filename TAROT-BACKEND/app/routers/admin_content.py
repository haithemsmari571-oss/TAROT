"""Admin — nightly content job panel + gamification Settings (Section 7, screen
4). All behind MANAGE_SETTINGS (superadmin)."""

import threading
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.client import SessionLocal, get_db
from app.dependencies.authorization import require_permission
from app.enums.permissions import Permission
from app.logging_config import get_logger
from app.models import Settings
from app.services.ai import client as ai_client
from app.services.ai import content_engine

router = APIRouter(dependencies=[Depends(require_permission(Permission.MANAGE_SETTINGS))])
logger = get_logger(__name__)


# ── Gamification settings (server-validated, live — no redeploy) ─────────────
GAMIFICATION_DEFAULTS = {
    "rotation_window_hours": "5",
    "tasks_per_window": "4",
    "earned_redemption_cap_pct": "0.5",
    "earned_expiry_days": "30",
}


class GamificationSettings(BaseModel):
    rotation_window_hours: float = Field(gt=0, le=24)
    tasks_per_window: int = Field(ge=1, le=12)
    earned_redemption_cap_pct: float = Field(gt=0, le=1)
    earned_expiry_days: int = Field(ge=1, le=365)


def _get(db: Session, key: str, default: str) -> str:
    row = db.query(Settings).filter(Settings.key == key).first()
    return row.value if row else default


def _set(db: Session, key: str, value: str) -> None:
    row = db.query(Settings).filter(Settings.key == key).first()
    if row:
        row.value = value
    else:
        db.add(Settings(key=key, value=value))


@router.get("/settings/gamification")
def get_gamification_settings(db: Session = Depends(get_db)):
    return JSONResponse(
        content={
            "rotation_window_hours": float(_get(db, "rotation_window_hours", "5")),
            "tasks_per_window": int(float(_get(db, "tasks_per_window", "4"))),
            "earned_redemption_cap_pct": float(_get(db, "earned_redemption_cap_pct", "0.5")),
            "earned_expiry_days": int(float(_get(db, "earned_expiry_days", "30"))),
        }
    )


@router.put("/settings/gamification")
def update_gamification_settings(payload: GamificationSettings, db: Session = Depends(get_db)):
    _set(db, "rotation_window_hours", str(payload.rotation_window_hours))
    _set(db, "tasks_per_window", str(payload.tasks_per_window))
    _set(db, "earned_redemption_cap_pct", str(payload.earned_redemption_cap_pct))
    _set(db, "earned_expiry_days", str(payload.earned_expiry_days))
    db.commit()
    logger.info("gamification_settings_updated", **payload.model_dump())
    return get_gamification_settings(db)


# ── Nightly content job panel ────────────────────────────────────────────────
def _run_summary(run) -> dict:
    if run is None:
        return None
    return {
        "id": run.id,
        "content_date": run.content_date.isoformat(),
        "trigger": run.trigger,
        "status": run.status,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "signs_ok": run.signs_ok or [],
        "signs_failed": run.signs_failed or [],
        "output_tokens": run.output_tokens,
        "cost_usd": float(run.cost_usd or 0),
    }


@router.get("/content/status")
def content_status(db: Session = Depends(get_db)):
    latest = content_engine.latest_run(db)
    return JSONResponse(
        content=jsonable_encoder(
            {
                "configured": ai_client.is_configured(),
                "next_scheduled_run": content_engine.next_scheduled_run().isoformat(),
                "latest_run": _run_summary(latest),
            }
        )
    )


def _run_generation(on_date):
    """Run a manual generation in its own session/thread so the request returns
    immediately and the owner watches the panel update."""
    try:
        with SessionLocal() as db:
            content_engine.generate_for_date(db, on_date, trigger="manual")
    except Exception as e:
        logger.error("manual_generation_failed", error=str(e), exc_info=True)


@router.post("/content/generate-now")
def generate_now(db: Session = Depends(get_db)):
    """Generate tomorrow's content immediately (for previewing after a prompt
    edit). Runs in the background; poll /content/status for the result."""
    if not ai_client.is_configured():
        raise HTTPException(status_code=400, detail=str(ai_client.AiNotConfigured()))
    tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).date()
    threading.Thread(target=_run_generation, args=(tomorrow,), daemon=True).start()
    return JSONResponse(content={"started": True, "content_date": tomorrow.isoformat()})
