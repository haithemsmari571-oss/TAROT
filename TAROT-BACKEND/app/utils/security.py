from datetime import datetime, timedelta, timezone
import jwt
from pwdlib import PasswordHash

from app.config import get_app_settings


password_hash = PasswordHash.recommended()
settings = get_app_settings()

# The two token kinds carry their purpose in a "type" claim. A refresh token is
# for /refresh-token only; it must never be accepted where an access token is
# expected (the HTTP API and the chat/notification sockets). One source for the
# rule, used by get_current_user and both websocket authenticators.
ACCESS_TOKEN_TYPE = "access"
REFRESH_TOKEN_TYPE = "refresh"


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.JWT_TOKEN_EXPIRE_MINUTES
        )
    to_encode.update({"exp": expire, "type": ACCESS_TOKEN_TYPE})
    encoded_jwt = jwt.encode(
        to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    """
    Create a refresh token with longer expiration time.
    Refresh tokens are used to obtain new access tokens without re-authentication.
    """
    to_encode = data.copy()
    # Refresh tokens typically last 7 days
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    to_encode.update({"exp": expire, "type": REFRESH_TOKEN_TYPE})
    encoded_jwt = jwt.encode(
        to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt


def decode_token(token: str) -> dict:
    """
    Decode and validate a JWT token.

    Args:
        token: JWT token string

    Returns:
        dict: Decoded token payload

    Raises:
        jwt.ExpiredSignatureError: If token has expired
        jwt.InvalidTokenError: If token is invalid
    """
    payload = jwt.decode(
        token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
    )
    return payload


def decode_access_token(token: str) -> dict:
    """Decode a token and require it to be an access token.

    Rejects a refresh token (or any other kind) with jwt.InvalidTokenError, so a
    caller that already handles jwt exceptions turns it into the same 401 as a
    bad token. Expiry still raises jwt.ExpiredSignatureError from jwt.decode.
    """
    payload = decode_token(token)
    if payload.get("type") != ACCESS_TOKEN_TYPE:
        raise jwt.InvalidTokenError("Not an access token")
    return payload
