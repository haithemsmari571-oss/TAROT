from app.exceptions.domain import DomainError


class UserNotFoundError(DomainError):
    status_code = 404
    message = "User not found"


class UserAlreadyExistsError(DomainError):
    status_code = 400
    message = "User already exists"


class UserAlreadyVerified(DomainError):
    status_code = 400
    message = "User account already verified"


class UserInsufficientBalance(DomainError):
    status_code = 400
    message = "Insufficient balance to perform this action"


class InvalidRoleChangeError(DomainError):
    status_code = 400
    message = "Invalid role change requested"


class CannotModifySelfError(DomainError):
    status_code = 400
    message = "Cannot modify your own account in this way"
