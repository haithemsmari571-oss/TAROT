from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.dependencies.authorization import require_permission
from app.enums.permissions import Permission
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

    total_sessions = (
        db.query(func.count(Transaction.id))
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

    return {
        "totalEarnings": total_completed,
        "pendingEarnings": total_pending,
        "totalSessions": total_sessions,
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
