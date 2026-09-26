import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.database.client import get_db
from app.enums.user_status import UserStatus
from app.logging_config import get_logger
from app.models.user import User

security = HTTPBearer(auto_error=False)

settings = get_app_settings()
logger = get_logger(__name__)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """
    Extracts and verifies JWT token from Authorization header and returns the user.
    A missing, invalid or expired token, an unknown user or a suspended account
    is refused with 401; there is no development bypass.
    """
    # Handle missing credentials explicitly
    if not credentials:
        logger.warning("auth_failed_missing_credentials")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing",
        )

    token = credentials.credentials
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        user_id: str = payload.get("sub")

        if not user_id:
            logger.warning("auth_failed_missing_user_id_in_token")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing user ID",
            )

    except jwt.ExpiredSignatureError:
        logger.warning("auth_failed_token_expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
        )
    except jwt.InvalidTokenError as e:
        logger.warning(
            "auth_failed_invalid_token",
            error=str(e),
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    except Exception as e:
        logger.error(
            "auth_failed_unexpected_error",
            error=str(e),
            error_type=e.__class__.__name__,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
        )

    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            logger.warning(
                "auth_failed_user_not_found",
                user_id=user_id,
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
            )

        # Suspended covers both admin suspension and self-deleted (anonymized)
        # accounts: their previously-issued tokens must stop working — this is
        # what "logs them out everywhere" after account deletion.
        if user.status == UserStatus.SUSPENDED:
            logger.warning(
                "auth_failed_account_suspended",
                user_id=user.id,
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="This account has been deactivated",
            )

        logger.debug("auth_success", user_id=user.id)

        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "auth_database_error",
            user_id=user_id,
            error=str(e),
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )


def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User | None:
    """Return the bearer user when valid, otherwise continue anonymously."""
    if credentials is None:
        return None
    try:
        return get_current_user(credentials, db)
    except Exception:
        return None
