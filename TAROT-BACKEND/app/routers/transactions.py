from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.dependencies.authorization import require_admin
from app.dependencies.get_current_user import get_current_user
from app.enums.transaction_status import TransactionStatus
from app.enums.transaction_type import TransactionType
from app.logging_config import bind_user_to_context, get_logger
from app.models.user import User
from app.models.transaction import Transaction
from app.models.chat import Chat
from app.schemas.transaction import (
    AdminTransactionHistoryResponse,
    BalanceResponse,
    TransactionHistoryResponse,
    TransactionOut,
    TransactionWithUserOut,
)
from app.services.transactions import (
    get_all_transactions,
    get_psychic_earnings,
    get_transaction_by_id,
    get_transaction_history,
)

router = APIRouter()
logger = get_logger(__name__)


@router.get("/me", response_model=TransactionHistoryResponse)
def get_my_transactions(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Records per page"),
    transaction_type: Optional[TransactionType] = Query(
        None, description="Filter by transaction type"
    ),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get current user's transaction history.

    Returns paginated list of transactions with filters.
    """
    bind_user_to_context(user.id)

    transactions, total = get_transaction_history(
        db=db,
        user_id=user.id,
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


@router.get("/me/balance", response_model=BalanceResponse)
def get_my_balance(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get current user's balance.

    Returns the current balance and last update time.
    """
    bind_user_to_context(user.id)

    # Refresh user to get latest balance
    db.refresh(user)

    return BalanceResponse(
        user_id=user.id, balance=user.balance, last_updated=user.updated_at
    )


@router.get("/me/earnings/summary")
def get_my_earnings_summary(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get earnings summary for the current psychic.

    Only accessible to users with PSYCHIC role.
    Returns aggregated statistics about earnings.
    """
    from app.enums.role import Role
    from sqlalchemy import func
    from app.models import Chat

    bind_user_to_context(user.id)

    # Only psychics can access this endpoint
    if user.role != Role.PSYCHIC:
        raise HTTPException(status_code=403, detail="Only psychics can access earnings")

    # Get total completed earnings
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

    # Get total pending earnings
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

    # Get total sessions count
    total_sessions = (
        db.query(func.count(Transaction.id))
        .join(Chat, Transaction.related_chat_id == Chat.id)
        .filter(
            Transaction.transaction_type == TransactionType.DEBIT,
            Chat.psychic_id == user.id,
        )
        .scalar()
    ) or 0

    # Get unique clients count
    unique_clients = (
        db.query(func.count(func.distinct(Transaction.user_id)))
        .join(Chat, Transaction.related_chat_id == Chat.id)
        .filter(
            Transaction.transaction_type == TransactionType.DEBIT,
            Chat.psychic_id == user.id,
        )
        .scalar()
    ) or 0

    logger.info(
        "psychic_earnings_summary_retrieved",
        psychic_id=user.id,
        total_earnings=total_completed,
        pending_earnings=total_pending,
        total_sessions=total_sessions,
        unique_clients=unique_clients,
    )

    return {
        "totalEarnings": total_completed,
        "pendingEarnings": total_pending,
        "totalSessions": total_sessions,
        "uniqueClients": unique_clients,
    }


@router.get("/me/earnings", response_model=AdminTransactionHistoryResponse)
def get_my_earnings(
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Records per page"),
    status: Optional[TransactionStatus] = Query(
        None, description="Filter by transaction status"
    ),
    search: Optional[str] = Query(
        None, description="Search by username, email, or description"
    ),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get current psychic's earnings from chat sessions.

    Only accessible to users with PSYCHIC role.
    Returns transactions where clients paid for sessions with this psychic.
    """
    from app.enums.role import Role

    bind_user_to_context(user.id)

    # Only psychics can access this endpoint
    if user.role != Role.PSYCHIC:
        raise HTTPException(status_code=403, detail="Only psychics can access earnings")

    logger.info(
        "psychic_earnings_requested",
        psychic_id=user.id,
        psychic_username=user.username,
        page=page,
        limit=limit,
        status=status.value if status else None,
        search=search,
    )

    transactions, total = get_psychic_earnings(
        db=db,
        psychic_id=user.id,
        status=status,
        search=search,
        page=page,
        limit=limit,
    )

    total_pages = (total + limit - 1) // limit

    logger.debug(
        "psychic_earnings_retrieved",
        psychic_id=user.id,
        results_count=len(transactions),
        total_count=total,
        page=page,
        total_pages=total_pages,
    )

    return AdminTransactionHistoryResponse(
        transactions=[TransactionWithUserOut(**t) for t in transactions],
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )


@router.get("/me/{transaction_id}", response_model=TransactionOut)
def get_my_transaction(
    transaction_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get details of a specific transaction.

    Only returns the transaction if it belongs to the current user.
    """
    transaction = get_transaction_by_id(db, transaction_id)

    # Verify transaction belongs to current user
    if transaction.user_id != user.id:
        raise HTTPException(
            status_code=403, detail="You don't have access to this transaction"
        )

    return TransactionOut.model_validate(transaction)


# Admin endpoints


@router.get(
    "/admin/users/{user_id}/transactions", response_model=TransactionHistoryResponse
)
def get_user_transactions_admin(
    user_id: int,
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=100, description="Records per page"),
    transaction_type: Optional[TransactionType] = Query(
        None, description="Filter by transaction type"
    ),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Admin endpoint: Get any user's transaction history.

    Requires ADMIN or SUPERADMIN role.
    """
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

    logger.debug(
        "admin_transaction_history_retrieved",
        admin_user_id=admin.id,
        target_user_id=user_id,
        results_count=len(transactions),
        total_count=total,
        page=page,
        total_pages=total_pages,
    )

    return TransactionHistoryResponse(
        transactions=[TransactionOut.model_validate(t) for t in transactions],
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )


@router.get("/admin/users/{user_id}/balance", response_model=BalanceResponse)
def get_user_balance_admin(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Admin endpoint: Get any user's balance.

    Requires ADMIN or SUPERADMIN role.
    """
    bind_user_to_context(admin.id)

    from app.exceptions.users import UserNotFoundError
    from app.services.users import get_user

    user = get_user(db, user_id)
    if not user:
        logger.warning(
            "admin_balance_query_user_not_found",
            admin_user_id=admin.id,
            target_user_id=user_id,
        )
        raise UserNotFoundError()

    logger.info(
        "admin_balance_queried",
        admin_user_id=admin.id,
        admin_username=admin.username,
        target_user_id=user_id,
        target_username=user.username,
        balance=user.balance,
        currency="points",
    )

    return BalanceResponse(
        user_id=user.id, balance=user.balance, last_updated=user.updated_at
    )


@router.get("/admin/all", response_model=AdminTransactionHistoryResponse)
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
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Admin endpoint: Get all transactions across all users.

    Requires ADMIN or SUPERADMIN role.
    """
    bind_user_to_context(admin.id)

    logger.info(
        "admin_all_transactions_requested",
        admin_user_id=admin.id,
        admin_username=admin.username,
        page=page,
        limit=limit,
        transaction_type=transaction_type.value if transaction_type else None,
        status=status.value if status else None,
        user_id=user_id,
        search=search,
    )

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

    logger.debug(
        "admin_all_transactions_retrieved",
        admin_user_id=admin.id,
        results_count=len(transactions),
        total_count=total,
        page=page,
        total_pages=total_pages,
    )

    return AdminTransactionHistoryResponse(
        transactions=[TransactionWithUserOut(**t) for t in transactions],
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )
