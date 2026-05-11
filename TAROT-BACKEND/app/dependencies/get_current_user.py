import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.database.client import get_db
from app.enums.role import Role
from app.enums.user_status import UserStatus
from app.logging_config import get_logger
from app.models.user import User
from app.utils.security import hash_password

security = HTTPBearer(auto_error=False)

settings = get_app_settings()
logger = get_logger(__name__)


def _get_or_create_dev_user(db: Session) -> User:
    """
    Private helper: fetches or creates the dev user with admin role.
    """
    DEV_EMAIL = "dev@digmaco.com"

    try:
        user = db.query(User).filter(User.email == DEV_EMAIL).first()
        if not user:
            logger.info("creating_dev_user", email=DEV_EMAIL)
            password = hash_password("password")
            user = User(
                username="dev",
                email=DEV_EMAIL,
                role=Role.ADMIN,
                status=UserStatus.ACTIVE,
                password_hash=password,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            logger.info("dev_user_created", user_id=user.id, email=DEV_EMAIL)

        return user
    except Exception as e:
        logger.error(
            "dev_user_creation_failed",
            email=DEV_EMAIL,
            error=str(e),
            exc_info=True,
        )
        db.rollback()
        raise


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """
    Extracts and verifies JWT token from Authorization header and returns the user.
    In development mode, fetches or creates the dev user.
    """
    # IS_DEV = settings.ENVIRONMENT == "dev"

    # if IS_DEV:
    #     logger.debug("using_dev_mode_authentication")
    #     return _get_or_create_dev_user(db)

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

        logger.debug(
            "auth_success",
            user_id=user.id,
            email=user.email,
            role=user.role.value,
        )

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
