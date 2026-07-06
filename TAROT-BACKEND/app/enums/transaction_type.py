import enum


class TransactionType(enum.Enum):
    CREDIT = "CREDIT"  # Adding points (Stripe purchase, refund)
    DEBIT = "DEBIT"  # Removing points (chat billing)
    REFUND = "REFUND"  # Refund to user
    REVERSAL = "REVERSAL"  # Reversing a transaction
    BONUS = "BONUS"  # Free points awarded at signup
    GIFT = "GIFT"  # Admin gift to user
    EARN = "EARN"  # Earned Stardust from a completed task/claim (gamification)
    EXPIRE = "EXPIRE"  # Earned Stardust forfeited 30 days after it was credited
