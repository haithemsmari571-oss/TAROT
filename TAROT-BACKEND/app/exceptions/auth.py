from app.exceptions.domain import DomainError


class BadCredentials(DomainError):
    status_code = 400
    message = "User with that email or password doesn't exist, Verify your credentials."


class InvalidResetLink(DomainError):
    status_code = 400
    message = "Password reset link is either invalid or expired, please try again"


class AccountNotVerified(DomainError):
    # 403, not BadCredentials' 400: the email and password were right, so the
    # sign-in page shows these words instead of "Incorrect email or password".
    status_code = 403
    message = "Account not verified, please verify your account to login"
