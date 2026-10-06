"""GET /api/health (ROUND60): is the backend up, and does its database answer?

The uptime check (.github/workflows/uptime.yml) asks it every 15 minutes, so it
is cheap: one SELECT 1, no sign-in, and nothing about the server in the answer.
"""

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.logging_config import error_fields, get_logger

router = APIRouter()
logger = get_logger(__name__)


@router.get("/health")
def health(db: Session = Depends(get_db)):
    """200 {"status": "ok"} when the database answers, 503 {"status": "unavailable"} when it does not."""
    try:
        db.execute(text("SELECT 1"))
    except Exception as error:  # noqa: BLE001 - whatever the failure, the answer is "down"
        logger.error("health_database_unreachable", **error_fields(error))
        return JSONResponse(content={"status": "unavailable"}, status_code=503)
    return {"status": "ok"}
