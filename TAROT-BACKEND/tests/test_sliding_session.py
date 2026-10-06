"""A client stays signed in for a year from her last visit (ROUND66).

- Every sign-in and every refresh issues a new refresh token that lasts
  REFRESH_TOKEN_EXPIRE_DAYS (365) from now; the access token keeps its own
  lifetime.
- A refresh token made before this change (7 days, no session version) still
  refreshes until its own expiry.
- A password change or reset adds one to users.session_version, and a refresh
  token carrying an older version is refused. The device that changed the
  password gets new tokens in the answer and stays signed in.
- A suspended, closed or vanished account is refused with the same answer as
  an expired token.

The real auth and profile routers on the in-memory database, with the
DomainError handler of app/main.py, as tests/test_auth_logs.py builds them.
"""

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import get_app_settings
from app.database.client import get_db
from app.enums.user_status import UserStatus
from app.exceptions.domain import DomainError
from app.models import User
from app.routers import auth as auth_router
from app.routers import profile as profile_router
from app.services.auth import REFRESH_REFUSED
from app.services.users import soft_delete_own_account, suspend_user
from app.utils.security import SESSION_VERSION_CLAIM, decode_token
from tests.test_auth_links_in_database import NEW_PASSWORD, _reset, _reset_email, _signed_up
from tests.test_auth_logs import EMAIL, PASSWORD, mail  # noqa: F401

settings = get_app_settings()
REFUSED = {"message": REFRESH_REFUSED}


@pytest.fixture
def api(db, mail):
    from app.main import domain_exception_handler

    app = FastAPI()
    app.include_router(auth_router.router, prefix="/api/auth")
    app.include_router(profile_router.router, prefix="/api/profile")
    app.add_exception_handler(DomainError, domain_exception_handler)
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app, raise_server_exceptions=False)


def _sign_in(api, db, mail, password=PASSWORD) -> tuple[User, dict]:
    user, _ = _signed_up(api, db, mail, verified=True)
    response = api.post("/api/auth/sign-in", json={"email": EMAIL, "password": password})
    assert response.status_code == 200, response.text
    return user, response.json()


def _refresh(api, refresh_token):
    return api.post("/api/auth/refresh-token", json={"refresh_token": refresh_token})


def _days_left(token: str) -> float:
    exp = decode_token(token)["exp"]
    return (exp - datetime.now(timezone.utc).timestamp()) / 86400


def _old_style_refresh_token(user: User, *, lifetime=timedelta(days=7)) -> str:
    """A refresh token exactly as security.create_refresh_token made it before
    ROUND66: 7 days, and no session version."""
    claims = {
        "sub": str(user.id),
        "role": user.role.value,
        "exp": datetime.now(timezone.utc) + lifetime,
        "type": "refresh",
    }
    return jwt.encode(claims, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


# ── a year from the last visit ─────────────────────────────────────────────────
def test_the_lifetime_is_a_setting_of_365_days():
    assert settings.REFRESH_TOKEN_EXPIRE_DAYS == 365


def test_sign_in_gives_a_refresh_token_for_365_days_and_keeps_the_access_lifetime(db, api, mail):
    _, tokens = _sign_in(api, db, mail)

    assert 364.99 < _days_left(tokens["refresh_token"]) <= 365
    assert decode_token(tokens["refresh_token"])[SESSION_VERSION_CLAIM] == 0
    access_minutes = _days_left(tokens["access_token"]) * 1440
    assert settings.JWT_TOKEN_EXPIRE_MINUTES - 1 < access_minutes <= settings.JWT_TOKEN_EXPIRE_MINUTES


def test_every_refresh_gives_a_new_refresh_token_365_days_from_now(db, api, mail):
    user, _ = _sign_in(api, db, mail)
    # Signed in long ago: three days left on her refresh token.
    old = _old_style_refresh_token(user, lifetime=timedelta(days=3))

    response = _refresh(api, old)

    assert response.status_code == 200, response.text
    fresh = response.json()["refresh_token"]
    assert fresh != old
    assert 364.99 < _days_left(fresh) <= 365
    assert decode_token(fresh)["type"] == "refresh"
    # And the new one refreshes in its turn.
    assert _refresh(api, fresh).status_code == 200


def test_a_refresh_token_made_before_the_change_still_refreshes(db, api, mail):
    user, _ = _sign_in(api, db, mail)
    old = _old_style_refresh_token(user)
    assert SESSION_VERSION_CLAIM not in decode_token(old)

    response = _refresh(api, old)

    assert response.status_code == 200, response.text
    assert decode_token(response.json()["access_token"])["sub"] == str(user.id)


def test_an_expired_refresh_token_is_refused(db, api, mail):
    user, _ = _sign_in(api, db, mail)

    response = _refresh(api, _old_style_refresh_token(user, lifetime=timedelta(seconds=-1)))

    assert response.status_code == 400
    assert response.json() == REFUSED


# ── a password change or reset ends every other sign-in ────────────────────────
def test_a_password_change_refuses_older_refresh_tokens_and_keeps_this_device(db, api, mail):
    user, tokens = _sign_in(api, db, mail)
    pre_change = _old_style_refresh_token(user)

    changed = api.post(
        "/api/profile/me/change-password",
        json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )

    assert changed.status_code == 200, changed.text
    body = changed.json()
    assert body["message"] == "Password changed successfully"
    db.expire_all()
    assert db.get(User, user.id).session_version == 1
    # Every sign-in from before is refused, the pre-ROUND66 kind included...
    assert _refresh(api, tokens["refresh_token"]).status_code == 400
    assert _refresh(api, tokens["refresh_token"]).json() == REFUSED
    assert _refresh(api, pre_change).json() == REFUSED
    # ...and the device that changed it carries on with the new tokens.
    assert decode_token(body["refresh_token"])[SESSION_VERSION_CLAIM] == 1
    assert 364.99 < _days_left(body["refresh_token"]) <= 365
    again = _refresh(api, body["refresh_token"])
    assert again.status_code == 200, again.text
    assert decode_token(again.json()["refresh_token"])[SESSION_VERSION_CLAIM] == 1


def test_a_refused_password_change_ends_nothing(db, api, mail):
    user, tokens = _sign_in(api, db, mail)

    refused = api.post(
        "/api/profile/me/change-password",
        json={"current_password": "Not-her-password-7", "new_password": NEW_PASSWORD},
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )

    assert refused.status_code == 400
    db.expire_all()
    assert db.get(User, user.id).session_version == 0
    assert _refresh(api, tokens["refresh_token"]).status_code == 200


def test_a_password_reset_refuses_older_refresh_tokens(db, api, mail):
    user, tokens = _sign_in(api, db, mail)
    _, link = _reset_email(api, mail)

    assert _reset(api, link).status_code == 204

    db.expire_all()
    assert db.get(User, user.id).session_version == 1
    assert _refresh(api, tokens["refresh_token"]).json() == REFUSED
    # Signing in with the new password works and refreshes.
    signed_in = api.post("/api/auth/sign-in", json={"email": EMAIL, "password": NEW_PASSWORD})
    assert signed_in.status_code == 200
    assert _refresh(api, signed_in.json()["refresh_token"]).status_code == 200


# ── suspended, closed or gone: the same answer as an expired token ────────────
def test_a_suspended_account_is_refused_like_an_expired_token(db, api, mail):
    user, tokens = _sign_in(api, db, mail)
    suspend_user(db, user.id)

    response = _refresh(api, tokens["refresh_token"])

    assert response.status_code == 400
    assert response.json() == REFUSED


def test_a_closed_account_is_refused_like_an_expired_token(db, api, mail):
    user, tokens = _sign_in(api, db, mail)
    soft_delete_own_account(db, user)
    assert db.get(User, user.id).status == UserStatus.SUSPENDED

    response = _refresh(api, tokens["refresh_token"])

    assert response.status_code == 400
    assert response.json() == REFUSED


def test_an_account_that_is_gone_is_refused_like_an_expired_token(db, api, mail):
    user, tokens = _sign_in(api, db, mail)
    db.delete(user)
    db.commit()

    response = _refresh(api, tokens["refresh_token"])

    assert response.status_code == 400
    assert response.json() == REFUSED
