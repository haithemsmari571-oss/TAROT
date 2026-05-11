import enum


class TransactionStatus(enum.Enum):
    PENDING = "PENDING"  # Not yet processed
    COMPLETED = "COMPLETED"  # Successfully processed
    FAILED = "FAILED"  # Transaction failed
    REVERSED = "REVERSED"  # Transaction was reversed
