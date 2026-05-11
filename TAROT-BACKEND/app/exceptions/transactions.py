from app.exceptions.domain import DomainError


class InsufficientBalanceError(DomainError):
    def __init__(self, required: int, available: int):
        super().__init__(
            message=f"Insufficient balance. Required: {required} points, Available: {available} points",
            status_code=400,
        )


class TransactionNotFoundError(DomainError):
    def __init__(self):
        super().__init__(message="Transaction not found", status_code=404)


class DuplicateTransactionError(DomainError):
    def __init__(self):
        super().__init__(
            message="Duplicate transaction detected (idempotency key already exists)",
            status_code=409,
        )


class SessionIntervalAlreadyBilledError(DomainError):
    def __init__(self, interval_id: int):
        super().__init__(
            message=f"Session interval {interval_id} has already been billed",
            status_code=400,
        )


class InvalidTransactionAmountError(DomainError):
    def __init__(self, message: str = "Transaction amount must be positive"):
        super().__init__(message=message, status_code=400)
