from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.transaction_type import TransactionType
from app.logging_config import bind_user_to_context, get_logger
from app.models.user import User
from app.schemas.transaction import (
    BalanceResponse,
    TransactionHistoryResponse,
    TransactionOut,
)
from app.services.transactions import (
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
