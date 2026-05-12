from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.dependencies.authorization import require_permission
from app.dependencies.get_current_user import get_current_user
from app.enums.permissions import Permission
from app.enums.transaction_status import TransactionStatus
from app.enums.transaction_type import TransactionType
from app.logging_config import bind_user_to_context, get_logger
from app.models.user import User
from app.schemas.transaction import (
    AdminTransactionHistoryResponse,
    BalanceResponse,
    TransactionHistoryResponse,
    TransactionOut,
    TransactionWithUserOut,
)
from app.services.transactions import (
    get_all_transactions,
    get_transaction_history,
)

router = APIRouter(
    dependencies=[Depends(require_permission(Permission.MANAGE_TRANSACTIONS))]
)
logger = get_logger(__name__)


@router.get(
    "/transactions/users/{user_id}/transactions",
    response_model=TransactionHistoryResponse,
)
def get_user_transactions_admin(
    user_id: int,
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Records per page"),
    transaction_type: Optional[TransactionType] = Query(
        None, description="Filter by transaction type"
    ),
    admin: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bind_user_to_context(admin.id)

    logger.info(
        "admin_transaction_history_requested",
        admin_user_id=admin.id,
        admin_username=admin.username,
        target_user_id=user_id,
        page=page,
        limit=limit,
        transaction_type=transaction_type.value if transaction_type else None,
    )

    transactions, total = get_transaction_history(
        db=db,
        user_id=user_id,
        transaction_type=transaction_type,
        page=page,
        limit=limit,
    )

    total_pages = (total + limit - 1) // limit

    return TransactionHistoryResponse(
        transactions=[TransactionOut.model_validate(t) for t in transactions],
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )


@router.get("/transactions/users/{user_id}/balance", response_model=BalanceResponse)
def get_user_balance_admin(
    user_id: int,
    admin: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bind_user_to_context(admin.id)

    from app.exceptions.users import UserNotFoundError
    from app.services.users import get_user

    user = get_user(db, user_id)
    if not user:
        raise UserNotFoundError()

    return BalanceResponse(
        user_id=user.id, balance=user.balance, last_updated=user.updated_at
    )


@router.get("/transactions/all", response_model=AdminTransactionHistoryResponse)
def get_all_transactions_admin(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Records per page"),
    transaction_type: Optional[TransactionType] = Query(
        None, description="Filter by transaction type"
    ),
    status: Optional[TransactionStatus] = Query(
        None, description="Filter by transaction status"
    ),
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    search: Optional[str] = Query(
        None, description="Search by username, email, or description"
    ),
    admin: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    bind_user_to_context(admin.id)

    transactions, total = get_all_transactions(
        db=db,
        transaction_type=transaction_type,
        status=status,
        user_id=user_id,
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
