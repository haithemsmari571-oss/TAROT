from app.exceptions.domain import DomainError


class ReviewNotFoundError(DomainError):
    def __init__(self, review_id: int | None = None):
        if review_id:
            message = f"Review with ID {review_id} not found"
        else:
            message = "Review not found"
        super().__init__(message, status_code=404)


class UnauthorizedReviewAccessError(DomainError):
    def __init__(self):
        message = "You are not authorized to modify this review"
        super().__init__(message, status_code=403)


class InvalidPsychicError(DomainError):
    def __init__(self):
        message = "Invalid psychic ID or psychic not found"
        super().__init__(message, status_code=404)


class CannotReviewSelfError(DomainError):
    def __init__(self):
        message = "You cannot review yourself"
        super().__init__(message, status_code=400)


class DuplicateReviewError(DomainError):
    def __init__(self):
        message = "You have already reviewed this psychic"
        super().__init__(message, status_code=400)
