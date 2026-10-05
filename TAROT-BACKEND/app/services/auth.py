import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from pydantic import EmailStr, NameEmail
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.enums.email_template_key import MailTemplateKey
from app.enums.role import Role
from app.enums.transaction_type import TransactionType
from app.exceptions.auth import AccountNotVerified, BadCredentials, InvalidResetLink
from app.exceptions.email import EmailServiceUnavailable
from app.exceptions.users import (
    SignupIdTakenError,
    UnderMinimumAgeError,
    UserAlreadyExistsError,
    UserAlreadyVerified,
    UserNotFoundError,
)
from app.logging_config import bind_user_to_context, error_fields, get_logger, mask_email
from app.models.auth_link_token import (
    RESET_PASSWORD_PURPOSE,
    VERIFY_ACCOUNT_PURPOSE,
    AuthLinkToken,
)
from app.models.transaction import Transaction
from app.models.user import User
from app.schemas.auth import ResetPasswordReq, SignupResponse, UserLogin, UserSignup
from app.schemas.user import UserRead, is_under_minimum_age
from app.services.email import send_email
from app.services.settings import get_setting_value
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

settings = get_app_settings()
logger = get_logger(__name__)

# How long an emailed link works. The verification link keeps its 30 minutes;
# the reset link lasts 60 (ROUND31, B6), and the reset email states its
# minutes from here.
VERIFY_LINK_LIFETIME = timedelta(minutes=30)
RESET_LINK_LIFETIME = timedelta(minutes=60)

# The settings row that holds the welcome credit, whole pounds (1 Stardust is £1).
SIGNUP_BONUS_SETTING = "signup_bonus"

# A sign-up whose new id is already taken is tried this many times in all.
SIGNUP_INSERT_ATTEMPTS = 2
# The users primary key as Postgres names it and as SQLite (the tests'
# database) words it, in the text of an IntegrityError.
USERS_ID_TAKEN = ("users_pkey", "UNIQUE constraint failed: users.id")
# The users email and username unique keys, named and worded the same two ways.
USERS_EMAIL_OR_USERNAME_TAKEN = (
    "users_email_key",
    "users_username_key",
    "UNIQUE constraint failed: users.email",
    "UNIQUE constraint failed: users.username",
)
# Sign-up's answer when the username or email already belongs to an account.
USER_ALREADY_EXISTS = "User with that username or email already exist"
# What a sign-up insert that failed on any other key raises (still a 500).
SIGNUP_INSERT_FAILED = "The new account could not be saved"


def parse_signup_bonus(raw_value: str | None) -> int:
    """The welcome credit a new account is given, from the "signup_bonus"
    setting's text: its whole-number value when that is above 0, else 0, and 0
    when the setting is missing (None). Raises ValueError or TypeError, as
    int() does, when the text is not a whole number, so each caller decides
    what a bad value means. The one parse for sign_up below and for
    GET /settings/public (routers/public_settings.py)."""
    if raw_value is None:
        return 0
    amount = int(raw_value)
    return amount if amount > 0 else 0


def _validate_user(db: Session, user_data: UserSignup):
    user = (
        db.query(User)
        .filter(
            or_(
                User.username == user_data.username,
                User.email.ilike(user_data.email),
            )
        )
        .first()
    )
    if user:
        logger.warning(
            "user_already_exists",
            email=mask_email(user_data.email),
            existing_user_id=user.id,
        )
        raise UserAlreadyExistsError(USER_ALREADY_EXISTS)


def _user_id_taken(error: IntegrityError) -> bool:
    """True when an insert into users failed only because its id was already
    taken: the id sequence was behind a row inserted with its own id."""
    return any(marker in str(error.orig) for marker in USERS_ID_TAKEN)


def _email_or_username_taken(error: IntegrityError) -> bool:
    """True when an insert into users failed on the email or username unique
    key: another sign-up with the same email or username was saved after this
    one passed _validate_user (two sign-ups at the same moment)."""
    return any(marker in str(error.orig) for marker in USERS_EMAIL_OR_USERNAME_TAKEN)


def _insert_user(db: Session, fields: dict, password_hash: str, terms_accepted_at: datetime) -> User:
    """Adds the new account and flushes it for its id. When the id the sequence
    hands out is already taken, nothing has been written yet: the insert is
    rolled back and tried once more with the next number. A second taken id is
    refused as SignupIdTakenError (409), never a bare 500. A taken email or
    username is not tried again: it gets _validate_user's own answer,
    UserAlreadyExistsError (400). Any other failed key raises a RuntimeError
    (500) that does not carry the IntegrityError: its text holds the insert's
    parameters and Postgres's failing row, the password hash among them."""
    for attempt in range(1, SIGNUP_INSERT_ATTEMPTS + 1):
        user = User(**fields, password_hash=password_hash, terms_accepted_at=terms_accepted_at)
        db.add(user)
        try:
            db.flush()
            return user
        except IntegrityError as error:
            db.rollback()
            if _email_or_username_taken(error):
                logger.warning("user_already_exists_at_insert", email=mask_email(fields["email"]))
                # from None: the IntegrityError's text carries the insert's parameters.
                raise UserAlreadyExistsError(USER_ALREADY_EXISTS) from None
            if not _user_id_taken(error):
                logger.error("signup_insert_failed", **error_fields(error))
                break
            logger.warning("signup_user_id_taken", attempt=attempt, email=mask_email(fields["email"]))
    else:
        raise SignupIdTakenError()
    # Raised here, outside the except block, so the IntegrityError is not even its
    # context: Starlette's BaseHTTPMiddleware re-raises an app error "from" its
    # context, which would print the insert's parameters with the 500.
    raise RuntimeError(SIGNUP_INSERT_FAILED)


async def sign_up(db: Session, user_data: UserSignup) -> SignupResponse:
    if is_under_minimum_age(user_data.date_of_birth):
        raise UnderMinimumAgeError()
    _validate_user(db, user_data)

    user_dict = user_data.model_dump()
    user_dict["email"] = user_dict["email"].lower()

    password_hash = hash_password(user_dict["password"])

    user_dict.pop("password")
    # UserSignup only takes a ticked box; the account keeps the moment instead.
    user_dict.pop("accept_terms")

    user = _insert_user(db, user_dict, password_hash, terms_accepted_at=datetime.now(timezone.utc))

    logger.info("user_created", user_id=user.id)

    # Commit user first - don't let email failures block user creation
    db.commit()

    # Auto-verify in non-production environments
    if settings.ENVIRONMENT != "prod":
        user.is_verified = True
        db.commit()

    # Apply signup bonus if configured
    try:
        signup_bonus_str = get_setting_value(db, SIGNUP_BONUS_SETTING)
        if signup_bonus_str is not None:
            bonus_amount = parse_signup_bonus(signup_bonus_str)
            if bonus_amount > 0:
                # Welcome credit goes to the FREE credit_balance (spent before
                # paid balance), not the paid balance.
                user.credit_balance = bonus_amount
                transaction = Transaction(
                    user_id=user.id,
                    transaction_type=TransactionType.BONUS,
                    amount=bonus_amount,
                    balance_before=0,
                    balance_after=bonus_amount,
                    description="Signup bonus (welcome credit)",
                )
                db.add(transaction)
                db.commit()
                logger.info(
                    "signup_bonus_awarded",
                    user_id=user.id,
                    bonus_amount=bonus_amount,
                )
    except (ValueError, TypeError):
        logger.warning(
            "signup_bonus_invalid_value",
            user_id=user.id,
        )

    # Try to send verification email (non-fatal if it fails)
    email_sent = True
    try:
        await send_verify_mail(db, user)
    except Exception as e:
        email_sent = False
        logger.critical(
            "verification_email_send_failed",
            user_id=user.id,
            **error_fields(e),
        )
        # Don't re-raise - user is already created
        # They can use /resend-verify-email endpoint later
        logger.warning(
            "user_created_without_verification_email",
            user_id=user.id,
            message="User can resend verification email later",
        )

    return SignupResponse(user=_user_to_out(user), email_sent=email_sent)


def _minutes(lifetime: timedelta) -> int:
    return int(lifetime.total_seconds() // 60)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _issue_link_token(db: Session, user_id: int, purpose: str, lifetime: timedelta) -> str:
    """A new emailed link's token. Its row, holding the token's sha256 and
    never the token, is committed before the email goes out, so the link
    outlives this process: a restart or a deploy no longer voids it."""
    token = secrets.token_urlsafe(32).lower()
    db.add(
        AuthLinkToken(
            user_id=user_id,
            purpose=purpose,
            token_hash=_token_hash(token),
            expires_at=datetime.now(timezone.utc) + lifetime,
        )
    )
    db.commit()
    return token


def _use_link_token(db: Session, token: str, purpose: str) -> int | None:
    """The user id of an unused, unexpired link of this purpose, which is now
    marked used; None for any other token. One conditional UPDATE, so two uses
    at the same moment cannot both pass. Not committed here: the caller commits
    it with the change the link makes, so a change that fails leaves the link
    unused."""
    now = datetime.now(timezone.utc)
    token_hash = _token_hash(token)
    used = (
        db.query(AuthLinkToken)
        .filter(
            AuthLinkToken.token_hash == token_hash,
            AuthLinkToken.purpose == purpose,
            AuthLinkToken.used_at.is_(None),
            AuthLinkToken.expires_at > now,
        )
        .update(
            {AuthLinkToken.used_at: now, AuthLinkToken.updated_at: now},
            synchronize_session=False,
        )
    )
    if used != 1:
        return None
    return db.query(AuthLinkToken.user_id).filter(AuthLinkToken.token_hash == token_hash).scalar()


def _cancel_open_link_tokens(db: Session, user_id: int, purpose: str) -> int:
    """Marks every still open (unused, unexpired) link of this purpose for the
    account used, so none of them works any more; how many it cancelled. The
    rows stay (ROUND32, decision 4). Not committed here: the caller commits it
    with the change the link makes."""
    now = datetime.now(timezone.utc)
    return (
        db.query(AuthLinkToken)
        .filter(
            AuthLinkToken.user_id == user_id,
            AuthLinkToken.purpose == purpose,
            AuthLinkToken.used_at.is_(None),
            AuthLinkToken.expires_at > now,
        )
        .update(
            {AuthLinkToken.used_at: now, AuthLinkToken.updated_at: now},
            synchronize_session=False,
        )
    )


async def send_verify_mail(db: Session, user: User):
    verify_link = _generate_verify_account_link(db, user.id)

    logger.debug("sending_verification_email", user_id=user.id)

    await send_email(
        recepientEmail=[NameEmail(email=user.email, name=user.username)],
        template_key=MailTemplateKey.VERIFY_ACCOUNT.value,
        vars={"username": user.username, "verify_link": verify_link},
    )

    logger.info("verification_email_sent", user_id=user.id)


def _generate_verify_account_link(db: Session, user_id: int):
    token = _issue_link_token(db, user_id, VERIFY_ACCOUNT_PURPOSE, VERIFY_LINK_LIFETIME)

    logger.debug(
        "verification_token_generated",
        user_id=user_id,
        expires_in_minutes=_minutes(VERIFY_LINK_LIFETIME),
    )

    return f"{settings.VERIFY_ACCOUNT_BASE_URL}/{token}"


def _verify_verify_token(db: Session, token: str):
    user_id = _use_link_token(db, token, VERIFY_ACCOUNT_PURPOSE)
    if user_id is None:
        logger.warning("verification_token_invalid_or_expired")
        raise InvalidResetLink()

    logger.debug("verification_token_validated", user_id=user_id)

    return user_id


def verify_account(db: Session, token: str):
    user_id = _verify_verify_token(db, token)
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        logger.error(
            "user_not_found_for_verification",
            user_id=user_id,
        )
        raise UserNotFoundError()

    # Bind user to context for tracking
    bind_user_to_context(user.id)

    user.is_verified = True

    db.commit()

    logger.info("account_verified", user_id=user.id)

    return _user_to_out(user)


def sign_in(db: Session, user_data: UserLogin) -> dict:
    user = db.query(User).filter(User.email.ilike(user_data.email)).first()
    if not user:
        logger.warning(
            "signin_failed_user_not_found",
            email=mask_email(user_data.email),
        )
        raise BadCredentials()

    correct_password = verify_password(user_data.password, user.password_hash)
    if not correct_password:
        logger.warning("signin_failed_incorrect_password", user_id=user.id)
        raise BadCredentials()

    # A client signs in before she confirms her email (EmailConfirm=A): the
    # confirmation waits for her second message and her first top-up
    # (services/email_confirmation.py). A reader or admin account still
    # confirms first.
    if not user.is_verified and user.role != Role.USER:
        logger.warning("signin_failed_account_not_verified", user_id=user.id)
        raise AccountNotVerified()

    # Bind user to request context for tracking
    bind_user_to_context(user.id)

    token_data = {"sub": str(user.id), "role": user.role.value}
    access_token = create_access_token(data=token_data)
    refresh_token = create_refresh_token(data=token_data)

    logger.info(
        "tokens_generated",
        user_id=user.id,
        role=user.role.value,
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


async def resend_verify_link(db: Session, email: str):
    user = db.query(User).filter(User.email.ilike(email)).first()
    if not user:
        logger.warning(
            "resend_verify_failed_user_not_found",
            email=mask_email(email),
        )
        raise UserNotFoundError()

    if user.is_verified:
        logger.warning("resend_verify_failed_already_verified", user_id=user.id)
        raise UserAlreadyVerified()

    # Bind user to context for tracking
    bind_user_to_context(user.id)

    try:
        await send_verify_mail(db, user)
        logger.info("verification_email_resent", user_id=user.id)
    except Exception as e:
        logger.critical(
            "resend_verification_email_failed",
            user_id=user.id,
            **error_fields(e),
        )
        # Raise user-friendly exception
        raise EmailServiceUnavailable()

    return user


async def forgot_password(db: Session, email: EmailStr) -> str:
    message = "If theres an email associated with the user, a reset link will be sent"

    user = db.query(User).filter(User.email.ilike(email)).first()

    if not user:
        logger.info(
            "forgot_password_user_not_found",
            email=mask_email(email),
            message="Returning generic message for security",
        )
        return message

    # Bind user to context for tracking
    bind_user_to_context(user.id)

    # Still return success message for security reasons
    # Don't let user know if email failed
    await send_password_link(db, user)

    return message


async def send_password_link(db: Session, user: User) -> bool:
    """Emails the account the site's reset link, with which she sets a new
    password: forgot_password above, and a reader the owner has just created
    from the phone (services/owner_readers.py), who sets her first one this
    way. True when the email went out; a failure is logged, never raised."""
    reset_link = _generate_reset_link(db, user.id)
    mail_vars = {
        "reset_link": reset_link,
        "username": user.username,
        "link_minutes": _minutes(RESET_LINK_LIFETIME),
    }

    try:
        await send_email(
            recepientEmail=[NameEmail(email=user.email, name=user.username)],
            template_key=MailTemplateKey.FORGOT_PASSWORD.value,
            vars=mail_vars,
        )

        logger.info("password_reset_email_sent", user_id=user.id)
        return True
    except Exception as e:
        logger.critical(
            "password_reset_email_failed",
            user_id=user.id,
            **error_fields(e),
        )
        return False


def _generate_reset_link(db: Session, user_id: int):
    token = _issue_link_token(db, user_id, RESET_PASSWORD_PURPOSE, RESET_LINK_LIFETIME)

    logger.debug(
        "password_reset_token_generated",
        user_id=user_id,
        expires_in_minutes=_minutes(RESET_LINK_LIFETIME),
    )

    return f"{settings.RESET_PASSWORD_BASE_URL}/{token}"


def _verify_reset_token(db: Session, token: str):
    user_id = _use_link_token(db, token, RESET_PASSWORD_PURPOSE)

    if user_id is None:
        logger.warning("reset_token_invalid_or_expired")
        raise InvalidResetLink()

    logger.debug("reset_token_validated", user_id=user_id)

    return user_id


def reset_password(db: Session, reset_data: ResetPasswordReq):
    user_id = _verify_reset_token(db, reset_data.reset_token)
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        logger.error(
            "user_not_found_for_password_reset",
            user_id=user_id,
        )
        raise UserNotFoundError()

    # Bind user to context for tracking
    bind_user_to_context(user.id)

    password_hash = hash_password(reset_data.new_password)

    user.password_hash = password_hash
    # Using one reset link cancels every other open reset link of the account
    # (ROUND32, decision 3), in the same commit as the new password.
    cancelled = _cancel_open_link_tokens(db, user.id, RESET_PASSWORD_PURPOSE)
    db.commit()

    logger.info("password_reset_completed", user_id=user.id, other_reset_links_cancelled=cancelled)

    return _user_to_out(user)


def refresh_access_token(db: Session, refresh_token: str) -> dict:
    """
    Generate a new access token using a valid refresh token.

    Args:
        db: Database session
        refresh_token: Valid refresh token

    Returns:
        dict: New access token and the same refresh token

    Raises:
        BadCredentials: If refresh token is invalid or expired
        UserNotFoundError: If user no longer exists
    """
    try:
        # Decode and validate the refresh token
        payload = decode_token(refresh_token)

        # Check if it's actually a refresh token
        if payload.get("type") != "refresh":
            logger.warning("token_type_mismatch", token_type=payload.get("type"))
            raise BadCredentials("Invalid token type")

        user_id = payload.get("sub")
        if not user_id:
            logger.warning("refresh_token_missing_user_id")
            raise BadCredentials("Invalid token: missing user ID")

        # Verify user still exists
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            logger.warning("refresh_token_user_not_found", user_id=user_id)
            raise UserNotFoundError()

        # Bind user to context for tracking
        bind_user_to_context(user.id)

        # Generate new access token
        token_data = {"sub": str(user.id), "role": user.role.value}
        new_access_token = create_access_token(data=token_data)

        logger.info(
            "access_token_refreshed",
            user_id=user.id,
            role=user.role.value,
        )

        return {
            "access_token": new_access_token,
            "refresh_token": refresh_token,  # Return the same refresh token
            "token_type": "bearer",
        }

    except jwt.ExpiredSignatureError:
        logger.warning("refresh_token_expired")
        raise BadCredentials("Refresh token has expired. Please sign in again.")
    except jwt.InvalidTokenError as e:
        logger.warning("refresh_token_invalid", **error_fields(e))
        raise BadCredentials("Invalid refresh token")
    except (BadCredentials, UserNotFoundError):
        raise
    except Exception as e:
        logger.error(
            "refresh_token_unexpected_error",
            **error_fields(e),
            exc_info=True,
        )
        raise BadCredentials("Token refresh failed")


def change_password(
    db: Session, user: User, current_password: str, new_password: str
) -> None:
    """
    Change user password.

    Args:
        db: Database session
        user: Current user
        current_password: User's current password
        new_password: New password to set

    Raises:
        BadCredentials: If current password is incorrect
    """
    # Verify current password
    if not verify_password(current_password, user.password_hash):
        logger.warning(
            "change_password_invalid_current_password",
            user_id=user.id,
        )
        raise BadCredentials("Current password is incorrect")

    # Hash new password
    new_password_hash = hash_password(new_password)

    # Update password
    user.password_hash = new_password_hash
    db.commit()

    logger.info(
        "password_changed_successfully",
        user_id=user.id,
    )


def _user_to_out(user: User) -> UserRead:
    return UserRead(
        id=user.id,
        username=user.username,
        email=user.email,
        is_verified=user.is_verified,
    )
