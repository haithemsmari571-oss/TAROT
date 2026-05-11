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
    amount: int
    balance_before: int
    balance_after: int
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
    balance: int
    last_updated: datetime


class RefundRequest(BaseModel):
    """Request schema for issuing a refund."""

    transaction_id: int
    amount: int
    reason: str


class RefundResponse(BaseModel):
    """Response schema for refund operation."""

    success: bool
    transaction_id: int
    refunded_amount: int
    message: str
