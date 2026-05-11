from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.client import get_db
from app.dependencies.authorization import require_admin
from app.logging_config import bind_user_to_context, get_logger
from app.models.user import User
from app.schemas.transaction import RefundRequest, RefundResponse
from app.services.transactions import create_refund_transaction

router = APIRouter()
logger = get_logger(__name__)


@router.post("/", response_model=RefundResponse)
def issue_refund(
    refund_request: RefundRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """
    Admin endpoint: Issue a refund for a transaction.

    Requires ADMIN or SUPERADMIN role.

    Args:
        refund_request: Refund details (transaction_id, amount, reason)
        admin: Admin user issuing the refund
        db: Database session

    Returns:
        RefundResponse with success status and details

    Raises:
        HTTPException 400: If refund fails validation
        HTTPException 404: If transaction not found
        HTTPException 403: If not admin
    """
    # Bind admin user to context
    bind_user_to_context(admin.id)

    logger.info(
        "refund_requested",
        admin_user_id=admin.id,
        admin_username=admin.username,
        admin_email=admin.email,
        original_transaction_id=refund_request.transaction_id,
        refund_amount=refund_request.amount,
        refund_reason=refund_request.reason,
    )

    try:
        transaction = create_refund_transaction(
            db=db,
            original_transaction_id=refund_request.transaction_id,
            amount=refund_request.amount,
            admin_user_id=admin.id,
            reason=refund_request.reason,
        )

        logger.info(
            "refund_issued_successfully",
            refund_transaction_id=transaction.id,
            original_transaction_id=refund_request.transaction_id,
            refunded_user_id=transaction.user_id,
            refund_amount=transaction.amount,
            admin_user_id=admin.id,
            admin_username=admin.username,
            balance_before=transaction.balance_before,
            balance_after=transaction.balance_after,
        )

        return RefundResponse(
            success=True,
            transaction_id=transaction.id,
            refunded_amount=transaction.amount,
            message=f"Successfully refunded {transaction.amount} points. New transaction ID: {transaction.id}",
        )

    except Exception as e:
        logger.error(
            "refund_failed",
            admin_user_id=admin.id,
            original_transaction_id=refund_request.transaction_id,
            refund_amount=refund_request.amount,
            error=str(e),
            error_type=e.__class__.__name__,
            exc_info=True,
        )
        raise HTTPException(status_code=400, detail=str(e))
