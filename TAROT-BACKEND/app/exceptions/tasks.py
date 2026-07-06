from app.exceptions.domain import DomainError


class TaskNotFoundError(DomainError):
    def __init__(self):
        super().__init__(message="Task not found", status_code=404)


class ClaimNotFoundError(DomainError):
    def __init__(self):
        super().__init__(message="Claim not found", status_code=404)


class TaskNotClaimableError(DomainError):
    """Raised when a user isn't currently eligible to be paid for a task —
    inactive/out-of-schedule task, frequency cap reached, or the silent
    once-per-24h guard."""

    def __init__(self, reason: str = "This task can't be claimed right now"):
        super().__init__(message=reason, status_code=409)


class ClaimAlreadyResolvedError(DomainError):
    def __init__(self):
        super().__init__(
            message="This claim has already been approved or rejected",
            status_code=409,
        )


class InvalidTaskConfigError(DomainError):
    """Raised when a task definition is internally inconsistent — e.g. an
    automatic task with no trigger event for the code to detect."""

    def __init__(self, message: str = "Invalid task configuration"):
        super().__init__(message=message, status_code=400)
