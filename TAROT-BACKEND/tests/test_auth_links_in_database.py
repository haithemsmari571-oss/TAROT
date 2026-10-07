"""Verification and password-reset links kept in the database (ROUND31, B6 = A).

The links lived only in the backend process's memory (app/cache.py), so every
restart or deploy voided every open link, and a reset link lasted 5 minutes.
Each emailed link is now a row of auth_link_tokens holding the sha256 of its
token (services/auth.py _issue_link_token and _use_link_token). The rules:

- a link outlives the process that sent it;
- a verification link keeps its 30 minutes, a reset link lasts 60, and the
  reset email says so;
- a link works once, and only for what it was sent for.

Also the verification email's subject, which spells the brand as two words
(B4). The real auth router and the DomainError handler on the in-memory
database, as tests/test_auth_logs.py builds them. The restart of the real
backend is proven live (relay/ROUND31_RESULT.md).
"""

import hashlib
import importlib
import inspect
import re
from datetime import datetime, timedelta

import pytest
from sqlalchemy.orm import sessionmaker

from app.config import get_app_settings
from app.models import User
from app.models.auth_link_token import (
    RESET_PASSWORD_PURPOSE,
    VERIFY_ACCOUNT_PURPOSE,
    AuthLinkToken,
)
from app.services import auth as auth_service
from app.services import email as email_service
from app.utils.security import verify_password
from tests.test_auth_logs import EMAIL, PASSWORD, _app, _body, auth, mail  # noqa: F401

NEW_PASSWORD = "Starlit-secret-77"
LINK_REFUSED = {"message": "Password reset link is either invalid or expired, please try again"}


@pytest.fixture
def clock(monkeypatch):
    """services/auth.py's clock, run `ahead` of the real one."""

    class Clock(datetime):
        ahead = timedelta(0)

        @classmethod
        def now(cls, tz=None):
            return datetime.now(tz) + cls.ahead

    monkeypatch.setattr(auth_service, "datetime", Clock)
    return Clock


def _token_in(message, base: str) -> str:
    return re.search(re.escape(base) + r"/([A-Za-z0-9_-]+)", message.alternative_body).group(1)


def _signed_up(auth, db, mail, *, verified=False):
    """A new account and the token of the verification link it was emailed."""
    assert auth.post("/api/auth/sign-up", json=_body()).status_code == 201
    user = db.query(User).one()
    user.is_verified = verified
    db.commit()
    [message] = mail.sent
    return user, _token_in(message, get_app_settings().VERIFY_ACCOUNT_BASE_URL)


def _reset_email(auth, mail):
    """The reset email for the account, and the token of its link."""
    mail.sent.clear()
    assert auth.post("/api/auth/forgot-password", json={"email": EMAIL}).status_code == 200
    [message] = mail.sent
    return message, _token_in(message, get_app_settings().RESET_PASSWORD_BASE_URL)


def _reset(auth, token):
    return auth.post("/api/auth/reset-password", json={"reset_token": token, "new_password": NEW_PASSWORD})


def _verified(db, user) -> bool:
    db.expire_all()
    return db.get(User, user.id).is_verified


def _password_changed(db, user) -> bool:
    db.expire_all()
    return verify_password(NEW_PASSWORD, db.get(User, user.id).password_hash)


# ── where a link lives ───────────────────────────────────────────────────────
def test_a_link_is_a_database_row_holding_only_its_tokens_hash(db, auth, mail):
    user, token = _signed_up(auth, db, mail)

    [row] = db.query(AuthLinkToken).all()
    assert row.user_id == user.id
    assert row.purpose == VERIFY_ACCOUNT_PURPOSE
    assert row.token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert row.used_at is None
    assert token not in repr([getattr(row, column.name) for column in AuthLinkToken.__table__.columns])

    _reset_email(auth, mail)
    assert {r.purpose for r in db.query(AuthLinkToken).all()} == {VERIFY_ACCOUNT_PURPOSE, RESET_PASSWORD_PURPOSE}


def test_both_links_outlive_the_process_that_sent_them(db, auth, mail):
    """A restart keeps only the database: the auth module runs afresh (as a new
    process imports it) and the request comes on a new session."""
    user, verify_token = _signed_up(auth, db, mail)
    _, reset_token = _reset_email(auth, mail)

    importlib.reload(auth_service)
    fresh = sessionmaker(bind=db.get_bind(), expire_on_commit=False)()
    try:
        after_restart = _app(fresh)
        verified = after_restart.get(f"/api/auth/verify-account/{verify_token}")
        reset = _reset(after_restart, reset_token)
    finally:
        fresh.close()

    assert verified.status_code == 302 and "status=success" in verified.headers["location"]
    assert reset.status_code == 204, reset.text
    assert _verified(db, user) is True
    assert _password_changed(db, user) is True


# ── how long a link works ────────────────────────────────────────────────────
@pytest.mark.parametrize("minutes_later, works", [(29, True), (31, False)])
def test_a_verification_link_keeps_its_30_minutes(db, auth, mail, clock, minutes_later, works):
    user, token = _signed_up(auth, db, mail)

    clock.ahead = timedelta(minutes=minutes_later)
    response = auth.get(f"/api/auth/verify-account/{token}")

    assert ("status=success" in response.headers["location"]) is works
    assert _verified(db, user) is works


@pytest.mark.parametrize("minutes_later, works", [(59, True), (61, False)])
def test_a_reset_link_lasts_60_minutes(db, auth, mail, clock, minutes_later, works):
    user, _ = _signed_up(auth, db, mail, verified=True)
    _, token = _reset_email(auth, mail)

    clock.ahead = timedelta(minutes=minutes_later)
    response = _reset(auth, token)

    assert response.status_code == (204 if works else 400), response.text
    if not works:
        assert response.json() == LINK_REFUSED
    assert _password_changed(db, user) is works


def test_the_reset_email_says_its_link_lasts_60_minutes(db, auth, mail):
    _signed_up(auth, db, mail, verified=True)
    message, _ = _reset_email(auth, mail)

    assert "This link will expire in 60 minutes." in message.alternative_body
    assert "5 minutes" not in message.alternative_body


def test_the_links_expiry_is_stored_with_it(db, auth, mail):
    _signed_up(auth, db, mail, verified=True)
    _reset_email(auth, mail)

    rows = {row.purpose: row for row in db.query(AuthLinkToken).all()}
    for purpose, minutes in ((VERIFY_ACCOUNT_PURPOSE, 30), (RESET_PASSWORD_PURPOSE, 60)):
        lifetime = rows[purpose].expires_at.replace(tzinfo=None) - rows[purpose].created_at.replace(tzinfo=None)
        assert timedelta(minutes=minutes) - timedelta(seconds=5) < lifetime <= timedelta(minutes=minutes), purpose


# ── a link works once, and only for its own purpose ──────────────────────────
def test_a_verification_link_works_once(db, auth, mail):
    user, token = _signed_up(auth, db, mail)

    first = auth.get(f"/api/auth/verify-account/{token}")
    second = auth.get(f"/api/auth/verify-account/{token}")

    assert "status=success" in first.headers["location"]
    assert "status=error" in second.headers["location"]
    assert db.query(AuthLinkToken).one().used_at is not None


def test_a_reset_link_works_once(db, auth, mail):
    user, _ = _signed_up(auth, db, mail, verified=True)
    _, token = _reset_email(auth, mail)

    first = _reset(auth, token)
    user_row = db.get(User, user.id)
    user_row.password_hash = "put back"
    db.commit()
    second = _reset(auth, token)

    assert first.status_code == 204, first.text
    assert second.status_code == 400
    assert second.json() == LINK_REFUSED
    db.expire_all()
    assert db.get(User, user.id).password_hash == "put back"  # the second use changed nothing


def test_a_link_does_only_what_it_was_sent_for(db, auth, mail):
    user, verify_token = _signed_up(auth, db, mail)
    _, reset_token = _reset_email(auth, mail)

    assert _reset(auth, verify_token).status_code == 400
    assert "status=error" in auth.get(f"/api/auth/verify-account/{reset_token}").headers["location"]
    assert _verified(db, user) is False
    assert _password_changed(db, user) is False
    assert all(row.used_at is None for row in db.query(AuthLinkToken).all())


def test_an_unknown_token_is_refused(db, auth, mail):
    _signed_up(auth, db, mail)

    assert _reset(auth, "not-a-token-we-sent").json() == LINK_REFUSED
    assert "status=error" in auth.get("/api/auth/verify-account/not-a-token-we-sent").headers["location"]


# ── the verification email's subject (B4) ───────────────────────────────────
def test_the_verification_email_subject_spells_ask_valentina_as_two_words(db, auth, mail):
    assert auth.post("/api/auth/sign-up", json=_body()).status_code == 201

    [message] = mail.sent
    assert message.subject == "Verify your Ask Valentina account"


def test_no_email_subject_spells_the_brand_as_one_word():
    assert "AskValentina" not in inspect.getsource(email_service.send_email)
