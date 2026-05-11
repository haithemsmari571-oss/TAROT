import enum


class TransactionType(enum.Enum):
    CREDIT = "CREDIT"  # Adding points (Stripe purchase, refund)
    DEBIT = "DEBIT"  # Removing points (chat billing)
    REFUND = "REFUND"  # Refund to user
    REVERSAL = "REVERSAL"  # Reversing a transaction
