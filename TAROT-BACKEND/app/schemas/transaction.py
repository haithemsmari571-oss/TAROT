from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.enums.transaction_status import TransactionStatus
from app.enums.transaction_type import TransactionType


class TransactionOut(BaseModel):
    """Response schema for a single transaction."""

    id: int
    user_id: int
    transaction_type: TransactionType
    # Money is stored to 2 dp (pennies) — per-minute debits can be fractional
    # (e.g. £5.20), so these must be float, not int (int_from_float 500s).
    amount: float
    balance_before: float
    balance_after: float
    status: TransactionStatus
    description: Optional[str] = None
    related_chat_id: Optional[int] = None
    related_session_interval_id: Optional[int] = None
    stripe_payment_intent_id: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TransactionWithUserOut(TransactionOut):
    """Response schema for a transaction with user information (admin only)."""

    username: Optional[str] = None
    user_email: Optional[str] = None


class TransactionHistoryResponse(BaseModel):
    """Response schema for paginated transaction history."""

    transactions: list[TransactionOut]
    total: int
    page: int
    limit: int
    total_pages: int


class AdminTransactionHistoryResponse(BaseModel):
    """Response schema for paginated transaction history with user info (admin only)."""

    transactions: list[TransactionWithUserOut]
    total: int
    page: int
    limit: int
    total_pages: int


class BalanceResponse(BaseModel):
    """Response schema for user balance."""

    user_id: int
    balance: float  # total spendable = credit + paid (pennies)
    credit_balance: float = 0  # free welcome/gift credit remaining
    paid_balance: float = 0  # purchased balance remaining
    earned_balance: float = 0  # earned (gamification) Stardust, unexpired
    # Total Stardust to DISPLAY (spendable + earned). Single source of truth for
    # the "Stardust" pill so it matches the Constellation balance card.
    stardust_total: float = 0
    last_updated: Optional[datetime] = None


class RefundRequest(BaseModel):
    """Request schema for issuing a refund."""

    transaction_id: int
    amount: float
    reason: str


class RefundResponse(BaseModel):
    """Response schema for refund operation."""

    success: bool
    transaction_id: int
    refunded_amount: float
    message: str
