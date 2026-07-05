from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.dependencies.authorization import require_superadmin
from app.enums.role import Role
from app.enums.transaction_type import TransactionType
from app.logging_config import get_logger
from app.models.user import User
from app.models.transaction import Transaction
from app.models.chat import Chat

router = APIRouter()
logger = get_logger(__name__)


def _period_start(period: str) -> Optional[datetime]:
    """Start of the requested window, or None for all-time."""
    now = datetime.now()
    if period == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "7d":
        return now - timedelta(days=7)
    if period == "30d":
        return now - timedelta(days=30)
    if period == "month":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return None


@router.get("/psychics/activity")
def get_reader_activity(
    period: str = Query("all", description="all | today | 7d | 30d | month"),
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    """Per-psychic workload/activity for a period (SUPERADMIN).

    For every salaried reader: minutes read (one DEBIT = one billed minute),
    sessions (distinct billed chats), unique clients, and the client spend their
    readings generated (GBP). Client spend only — there is no reader cut. Idle
    readers are included with zeros so the whole roster's workload is visible.
    """
    start = _period_start(period)

    filters = [
        Transaction.transaction_type == TransactionType.DEBIT,
        Transaction.related_chat_id.isnot(None),
    ]
    if start is not None:
        filters.append(Transaction.created_at >= start)

    rows = (
        db.query(
            Chat.psychic_id.label("pid"),
            func.count(Transaction.id).label("minutes"),
            func.count(func.distinct(Transaction.related_chat_id)).label("sessions"),
            func.count(func.distinct(Transaction.user_id)).label("clients"),
            func.coalesce(func.sum(Transaction.amount), 0).label("spend"),
        )
        .join(Chat, Transaction.related_chat_id == Chat.id)
        .filter(*filters)
        .group_by(Chat.psychic_id)
        .all()
    )
    activity = {r.pid: r for r in rows}

    psychics = db.query(User).filter(User.role == Role.PSYCHIC).all()
    out = []
    for p in psychics:
        r = activity.get(p.id)
        out.append(
            {
                "psychic_id": p.id,
                "username": p.username,
                "minutes_read": int(r.minutes) if r else 0,
                "sessions": int(r.sessions) if r else 0,
                "unique_clients": int(r.clients) if r else 0,
                "client_spend": round(float(r.spend), 2) if r else 0.0,
            }
        )
    # Busiest readers first.
    out.sort(key=lambda x: (x["client_spend"], x["minutes_read"]), reverse=True)

    # Platform-wide unique clients can't be summed from per-psychic rows (a client
    # may see several readers), so count distinct once for the period.
    total_clients = (
        db.query(func.count(func.distinct(Transaction.user_id)))
        .join(Chat, Transaction.related_chat_id == Chat.id)
        .filter(*filters)
        .scalar()
    ) or 0

    totals = {
        "psychic_count": len(psychics),
        "active_count": sum(1 for x in out if x["minutes_read"] > 0),
        "minutes_read": sum(x["minutes_read"] for x in out),
        "sessions": sum(x["sessions"] for x in out),
        "unique_clients": int(total_clients),
        "client_spend": round(sum(x["client_spend"] for x in out), 2),
    }

    return {"period": period, "psychics": out, "totals": totals}
