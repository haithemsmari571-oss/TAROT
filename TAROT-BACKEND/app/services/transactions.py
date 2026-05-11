import json
from typing import List, Optional, Tuple

from sqlalchemy import desc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.enums.transaction_status import TransactionStatus
from app.enums.transaction_type import TransactionType
from app.exceptions.transactions import (
    DuplicateTransactionError,
    InsufficientBalanceError,
    InvalidTransactionAmountError,
    TransactionNotFoundError,
)
from app.logging_config import get_logger
from app.models import Transaction, User

logger = get_logger(__name__)


def get_user_balance_with_lock(db: Session, user_id: int) -> Tuple[User, int]:
    """
    Get user and current balance with row-level lock to prevent race conditions.
    Uses SELECT FOR UPDATE to lock the row until transaction commits.

    Returns:
        Tuple of (User, current_balance)
    """
    user = db.query(User).filter(User.id == user_id).with_for_update().first()
    if not user:
        from app.exceptions.users import UserNotFoundError

        raise UserNotFoundError()

    return user, user.balance


def create_credit_transaction(
    db: Session,
    user_id: int,
    amount: int,
    description: str,
    stripe_payment_intent_id: Optional[str] = None,
    idempotency_key: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> Transaction:
    """
    Create a CREDIT transaction (add points to user balance).
    Used for: Stripe purchases, refunds, admin credits.

    Args:
        db: Database session
        user_id: User receiving the credit
        amount: Points to add (must be positive)
        description: Standardized description (e.g., "Stripe purchase: 1000 points")
        stripe_payment_intent_id: Stripe payment intent ID for reconciliation
        idempotency_key: Unique key to prevent duplicate transactions (e.g., Stripe event ID)
        metadata: Additional JSON metadata

    Returns:
        Created Transaction object

    Raises:
        DuplicateTransactionError: If idempotency_key already exists
        InvalidTransactionAmountError: If amount <= 0
        UserNotFoundError: If user doesn't exist
    """
    if amount <= 0:
        logger.warning(
            "credit_transaction_invalid_amount",
            user_id=user_id,
            amount=amount,
            description=description,
        )
        raise InvalidTransactionAmountError("Credit amount must be positive")

    try:
        # Lock user row and get current balance
        user, balance_before = get_user_balance_with_lock(db, user_id)

        # Calculate new balance
        balance_after = balance_before + amount

        logger.debug(
            "credit_transaction_creating",
            user_id=user_id,
            amount=amount,
            balance_before=balance_before,
            balance_after=balance_after,
            description=description,
            stripe_payment_intent_id=stripe_payment_intent_id,
            idempotency_key=idempotency_key,
        )

        # Create transaction record
        transaction = Transaction(
            user_id=user_id,
            transaction_type=TransactionType.CREDIT,
            amount=amount,
            balance_before=balance_before,
            balance_after=balance_after,
            status=TransactionStatus.COMPLETED,
            description=description,
            stripe_payment_intent_id=stripe_payment_intent_id,
            idempotency_key=idempotency_key,
            transaction_metadata=json.dumps(metadata) if metadata else None,
        )

        db.add(transaction)

        # Update user balance
        user.balance = balance_after

        db.commit()
        db.refresh(transaction)

        logger.info(
            "credit_transaction_created",
            transaction_id=transaction.id,
            user_id=user_id,
            amount=amount,
            balance_before=balance_before,
            balance_after=balance_after,
            balance_change=f"+{amount}",
            description=description,
            stripe_payment_intent_id=stripe_payment_intent_id,
            idempotency_key=idempotency_key,
            currency="points",
        )

        return transaction

    except IntegrityError as e:
        db.rollback()
        if "idempotency_key" in str(e):
            logger.warning(
                "credit_transaction_duplicate_idempotency_key",
                user_id=user_id,
                amount=amount,
                idempotency_key=idempotency_key,
                description=description,
            )
            raise DuplicateTransactionError()
        logger.error(
            "credit_transaction_integrity_error",
            user_id=user_id,
            amount=amount,
            error=str(e),
            exc_info=True,
        )
        raise


def create_debit_transaction(
    db: Session,
    user_id: int,
    amount: int,
    description: str,
    related_chat_id: Optional[int] = None,
    related_session_interval_id: Optional[int] = None,
    metadata: Optional[dict] = None,
) -> Transaction:
    """
    Create a DEBIT transaction (remove points from user balance).
    Used for: Chat session billing.

    Args:
        db: Database session
        user_id: User being charged
        amount: Points to deduct (must be positive)
        description: Standardized description (e.g., "Chat billing - Session #123 (60s)")
        related_chat_id: Chat ID this transaction is related to
        related_session_interval_id: Session interval ID being billed
        metadata: Additional JSON metadata

    Returns:
        Created Transaction object

    Raises:
        InsufficientBalanceError: If user doesn't have enough balance
        InvalidTransactionAmountError: If amount <= 0
        UserNotFoundError: If user doesn't exist
    """
    if amount <= 0:
        logger.warning(
            "debit_transaction_invalid_amount",
            user_id=user_id,
            amount=amount,
            description=description,
        )
        raise InvalidTransactionAmountError("Debit amount must be positive")

    try:
        # Lock user row and get current balance
        user, balance_before = get_user_balance_with_lock(db, user_id)

        # Check sufficient balance
        if balance_before < amount:
            logger.warning(
                "debit_transaction_insufficient_balance",
                user_id=user_id,
                amount_required=amount,
                balance_available=balance_before,
                deficit=amount - balance_before,
                related_chat_id=related_chat_id,
                related_session_interval_id=related_session_interval_id,
                description=description,
            )
            raise InsufficientBalanceError(required=amount, available=balance_before)

        # Calculate new balance
        balance_after = balance_before - amount

        logger.debug(
            "debit_transaction_creating",
            user_id=user_id,
            amount=amount,
            balance_before=balance_before,
            balance_after=balance_after,
            related_chat_id=related_chat_id,
            related_session_interval_id=related_session_interval_id,
            description=description,
        )

        # Create transaction record
        transaction = Transaction(
            user_id=user_id,
            transaction_type=TransactionType.DEBIT,
            amount=amount,
            balance_before=balance_before,
            balance_after=balance_after,
            status=TransactionStatus.COMPLETED,
            description=description,
            related_chat_id=related_chat_id,
            related_session_interval_id=related_session_interval_id,
            transaction_metadata=json.dumps(metadata) if metadata else None,
        )

        db.add(transaction)

        # Update user balance
        user.balance = balance_after

        db.commit()
        db.refresh(transaction)

        logger.info(
            "debit_transaction_created",
            transaction_id=transaction.id,
            user_id=user_id,
            amount=amount,
            balance_before=balance_before,
            balance_after=balance_after,
            balance_change=f"-{amount}",
            related_chat_id=related_chat_id,
            related_session_interval_id=related_session_interval_id,
            description=description,
            currency="points",
        )

        return transaction

    except IntegrityError as e:
        db.rollback()
        logger.error(
            "debit_transaction_integrity_error",
            user_id=user_id,
            amount=amount,
            error=str(e),
            exc_info=True,
        )
        raise


def create_refund_transaction(
    db: Session,
    original_transaction_id: int,
    amount: int,
    admin_user_id: int,
    reason: str,
) -> Transaction:
    """
    Create a REFUND transaction (return points to user).
    Used for: Admin-initiated refunds, dispute resolutions.

    Args:
        db: Database session
        original_transaction_id: ID of the original transaction being refunded
        amount: Points to refund (can be partial, must be positive)
        admin_user_id: Admin user who initiated the refund
        reason: Reason for refund

    Returns:
        Created Transaction object

    Raises:
        TransactionNotFoundError: If original transaction doesn't exist
        InvalidTransactionAmountError: If amount <= 0 or exceeds original
    """
    if amount <= 0:
        logger.warning(
            "refund_transaction_invalid_amount",
            original_transaction_id=original_transaction_id,
            amount=amount,
            admin_user_id=admin_user_id,
            reason=reason,
        )
        raise InvalidTransactionAmountError("Refund amount must be positive")

    # Get original transaction
    original_txn = (
        db.query(Transaction).filter(Transaction.id == original_transaction_id).first()
    )
    if not original_txn:
        logger.warning(
            "refund_transaction_original_not_found",
            original_transaction_id=original_transaction_id,
            admin_user_id=admin_user_id,
        )
        raise TransactionNotFoundError()

    # Validate refund amount doesn't exceed original
    if amount > original_txn.amount:
        logger.warning(
            "refund_transaction_amount_exceeds_original",
            original_transaction_id=original_transaction_id,
            original_amount=original_txn.amount,
            refund_amount=amount,
            excess=amount - original_txn.amount,
            admin_user_id=admin_user_id,
        )
        raise InvalidTransactionAmountError(
            f"Refund amount ({amount}) cannot exceed original transaction amount ({original_txn.amount})"
        )

    refund_type = "full" if amount == original_txn.amount else "partial"

    logger.info(
        "refund_transaction_initiating",
        original_transaction_id=original_transaction_id,
        original_user_id=original_txn.user_id,
        original_amount=original_txn.amount,
        refund_amount=amount,
        refund_type=refund_type,
        admin_user_id=admin_user_id,
        reason=reason,
    )

    # Create credit transaction for refund
    description = f"Refund for transaction #{original_transaction_id}: {reason}"
    metadata = {
        "original_transaction_id": original_transaction_id,
        "admin_user_id": admin_user_id,
        "refund_type": refund_type,
        "refund_reason": reason,
    }

    transaction = create_credit_transaction(
        db=db,
        user_id=original_txn.user_id,
        amount=amount,
        description=description,
        metadata=metadata,
    )

    # Mark original transaction as reversed if full refund
    if amount == original_txn.amount:
        original_txn.status = TransactionStatus.REVERSED
        db.commit()

        logger.info(
            "refund_transaction_completed_full",
            refund_transaction_id=transaction.id,
            original_transaction_id=original_transaction_id,
            user_id=original_txn.user_id,
            refund_amount=amount,
            admin_user_id=admin_user_id,
            original_status_updated="REVERSED",
        )
    else:
        logger.info(
            "refund_transaction_completed_partial",
            refund_transaction_id=transaction.id,
            original_transaction_id=original_transaction_id,
            user_id=original_txn.user_id,
            refund_amount=amount,
            original_amount=original_txn.amount,
            remaining_amount=original_txn.amount - amount,
            admin_user_id=admin_user_id,
        )

    return transaction


def get_transaction_history(
    db: Session,
    user_id: int,
    transaction_type: Optional[TransactionType] = None,
    page: int = 1,
    limit: int = 50,
) -> Tuple[List[Transaction], int]:
    """
    Get paginated transaction history for a user.

    Args:
        db: Database session
        user_id: User ID
        transaction_type: Optional filter by transaction type
        page: Page number (1-indexed)
        limit: Records per page

    Returns:
        Tuple of (transactions_list, total_count)
    """
    query = db.query(Transaction).filter(Transaction.user_id == user_id)

    # Apply transaction type filter if provided
    if transaction_type:
        query = query.filter(Transaction.transaction_type == transaction_type)

    # Get total count
    total = query.count()

    # Apply pagination and ordering
    transactions = (
        query.order_by(desc(Transaction.created_at))
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return transactions, total


def get_all_transactions(
    db: Session,
    transaction_type: Optional[TransactionType] = None,
    status: Optional[TransactionStatus] = None,
    user_id: Optional[int] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
) -> Tuple[List[dict], int]:
    """
    Get paginated transaction history for all users (admin only).
    Returns transactions with user information (username, email).

    Args:
        db: Database session
        transaction_type: Optional filter by transaction type
        status: Optional filter by transaction status
        user_id: Optional filter by user ID
        search: Optional search term for username, email, or description
        page: Page number (1-indexed)
        limit: Records per page

    Returns:
        Tuple of (transactions_list_with_user_info, total_count)
    """
    from sqlalchemy import or_

    query = db.query(Transaction).join(User, Transaction.user_id == User.id)

    # Apply filters if provided
    if transaction_type:
        query = query.filter(Transaction.transaction_type == transaction_type)

    if status:
        query = query.filter(Transaction.status == status)

    if user_id:
        query = query.filter(Transaction.user_id == user_id)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                User.username.ilike(search_term),
                User.email.ilike(search_term),
                Transaction.description.ilike(search_term),
            )
        )

    # Get total count
    total = query.count()

    # Apply pagination and ordering
    transactions = (
        query.order_by(desc(Transaction.created_at))
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    # Convert to dict with user information
    result = []
    for transaction in transactions:
        user = db.query(User).filter(User.id == transaction.user_id).first()
        transaction_dict = {
            "id": transaction.id,
            "user_id": transaction.user_id,
            "transaction_type": transaction.transaction_type,
            "amount": transaction.amount,
            "balance_before": transaction.balance_before,
            "balance_after": transaction.balance_after,
            "status": transaction.status,
            "description": transaction.description,
            "related_chat_id": transaction.related_chat_id,
            "related_session_interval_id": transaction.related_session_interval_id,
            "stripe_payment_intent_id": transaction.stripe_payment_intent_id,
            "created_at": transaction.created_at,
            "username": user.username if user else None,
            "user_email": user.email if user else None,
        }
        result.append(transaction_dict)

    return result, total


def get_psychic_earnings(
    db: Session,
    psychic_id: int,
    status: Optional[TransactionStatus] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 50,
) -> Tuple[List[dict], int]:
    """
    Get paginated earnings for a psychic.
    Returns transactions where the psychic earned money from chat sessions.

    Args:
        db: Database session
        psychic_id: Psychic user ID
        status: Optional filter by transaction status
        search: Optional search term for username, email, or description
        page: Page number (1-indexed)
        limit: Records per page

    Returns:
        Tuple of (transactions_list_with_user_info, total_count)
    """
    from sqlalchemy import or_

    # Query transactions that are DEBIT type and have related_chat_id
    # Then join with Chat to filter by psychic_id
    from app.models import Chat

    query = (
        db.query(Transaction)
        .join(User, Transaction.user_id == User.id)
        .join(Chat, Transaction.related_chat_id == Chat.id)
        .filter(
            Transaction.transaction_type == TransactionType.DEBIT,
            Chat.psychic_id == psychic_id,
        )
    )

    # Apply filters if provided
    if status:
        query = query.filter(Transaction.status == status)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                User.username.ilike(search_term),
                User.email.ilike(search_term),
                Transaction.description.ilike(search_term),
            )
        )

    # Get total count
    total = query.count()

    # Apply pagination and ordering
    transactions = (
        query.order_by(desc(Transaction.created_at))
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    # Convert to dict with user information
    result = []
    for transaction in transactions:
        user = db.query(User).filter(User.id == transaction.user_id).first()
        transaction_dict = {
            "id": transaction.id,
            "user_id": transaction.user_id,
            "transaction_type": transaction.transaction_type,
            "amount": transaction.amount,
            "balance_before": transaction.balance_before,
            "balance_after": transaction.balance_after,
            "status": transaction.status,
            "description": transaction.description,
            "related_chat_id": transaction.related_chat_id,
            "related_session_interval_id": transaction.related_session_interval_id,
            "stripe_payment_intent_id": transaction.stripe_payment_intent_id,
            "created_at": transaction.created_at,
            "username": user.username if user else None,
            "user_email": user.email if user else None,
        }
        result.append(transaction_dict)

    return result, total


def get_transaction_by_id(db: Session, transaction_id: int) -> Transaction:
    """
    Get a single transaction by ID.

    Args:
        db: Database session
        transaction_id: Transaction ID

    Returns:
        Transaction object

    Raises:
        TransactionNotFoundError: If transaction doesn't exist
    """
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise TransactionNotFoundError()

    return transaction
