from app.exceptions.domain import DomainError
from app.schemas.user import UNDER_MINIMUM_AGE


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


class SignupIdTakenError(DomainError):
    """Sign-up drew an id that was already taken on both of its tries: the id
    sequence is behind the table (migration cf5bb573a7bf moves it on). Nothing
    was saved, so trying again is safe."""

    status_code = 409
    message = "We couldn't create your account just now. Please try again."


class UnderMinimumAgeError(DomainError):
    """Sign-up refuses a date of birth under MINIMUM_AGE, as {message}, which is
    what the sign-up page reads."""

    status_code = 400
    message = UNDER_MINIMUM_AGE
