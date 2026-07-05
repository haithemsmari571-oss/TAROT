from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.dependencies.authorization import require_permission, require_superadmin
from app.enums.permissions import Permission
from app.enums.role import Role
from app.enums.transaction_status import TransactionStatus
from app.enums.transaction_type import TransactionType
from app.logging_config import bind_user_to_context, get_logger
from app.models.user import User
from app.models.transaction import Transaction
from app.models.chat import Chat
from app.schemas.transaction import (
    AdminTransactionHistoryResponse,
    TransactionWithUserOut,
)
from app.services.transactions import get_psychic_earnings

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


@router.get("/psychics/earnings/summary")
def get_my_earnings_summary(
    user: User = Depends(require_permission(Permission.VIEW_EARNINGS)),
    db: Session = Depends(get_db),
):
    bind_user_to_context(user.id)

    total_completed = (
        db.query(func.sum(Transaction.amount))
        .join(Chat, Transaction.related_chat_id == Chat.id)
        .filter(
            Transaction.transaction_type == TransactionType.DEBIT,
            Transaction.status == TransactionStatus.COMPLETED,
            Chat.psychic_id == user.id,
        )
        .scalar()
    ) or 0

    total_pending = (
        db.query(func.sum(Transaction.amount))
        .join(Chat, Transaction.related_chat_id == Chat.id)
        .filter(
            Transaction.transaction_type == TransactionType.DEBIT,
            Transaction.status == TransactionStatus.PENDING,
            Chat.psychic_id == user.id,
        )
        .scalar()
    ) or 0

    # One DEBIT row is charged per billed minute, so counting rows gives minutes
    # read — NOT sessions. Sessions are distinct billed chats.
    total_minutes = (
        db.query(func.count(Transaction.id))
        .join(Chat, Transaction.related_chat_id == Chat.id)
        .filter(
            Transaction.transaction_type == TransactionType.DEBIT,
            Chat.psychic_id == user.id,
        )
        .scalar()
    ) or 0

    total_sessions = (
        db.query(func.count(func.distinct(Transaction.related_chat_id)))
        .join(Chat, Transaction.related_chat_id == Chat.id)
        .filter(
            Transaction.transaction_type == TransactionType.DEBIT,
            Chat.psychic_id == user.id,
        )
        .scalar()
    ) or 0

    unique_clients = (
        db.query(func.count(func.distinct(Transaction.user_id)))
        .join(Chat, Transaction.related_chat_id == Chat.id)
        .filter(
            Transaction.transaction_type == TransactionType.DEBIT,
            Chat.psychic_id == user.id,
        )
        .scalar()
    ) or 0

    # Client-spend / activity report (GBP). Psychics are salaried — these are the
    # CLIENT's spend across this reader's sessions, never the reader's earnings.
    return {
        "totalClientSpend": total_completed,
        "pendingClientSpend": total_pending,
        "minutesRead": total_minutes,
        "sessions": total_sessions,
        "uniqueClients": unique_clients,
    }


@router.get("/psychics/earnings", response_model=AdminTransactionHistoryResponse)
def get_my_earnings(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Records per page"),
    status: Optional[TransactionStatus] = Query(
        None, description="Filter by transaction status"
    ),
    search: Optional[str] = Query(
        None, description="Search by username, email, or description"
    ),
    user: User = Depends(require_permission(Permission.VIEW_EARNINGS)),
    db: Session = Depends(get_db),
):
    bind_user_to_context(user.id)

    transactions, total = get_psychic_earnings(
        db=db,
        psychic_id=user.id,
        status=status,
        search=search,
        page=page,
        limit=limit,
    )

    total_pages = (total + limit - 1) // limit

    return AdminTransactionHistoryResponse(
        transactions=[TransactionWithUserOut(**t) for t in transactions],
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )
