"""What using a password-reset link does (ROUND32, decisions 3, 4, 5 and 8).

- Using a reset link cancels every other open reset link of that account, so
  an older email in her inbox no longer resets the password. Her verification
  link and every other account's links are left alone.
- Used and expired link rows are left in auth_link_tokens (no cleanup job).
- POST /api/auth/reset-password answers a real 204 with no body; the website's
  resetPassword (tarot-landing-web src/features/auth/api/authApi.ts) returns
  void and reads none.
- The links' old in-memory store, app/cache.py, is gone.

The real auth router on the in-memory database, as
tests/test_auth_links_in_database.py builds it.
"""

import importlib.util
from datetime import timedelta

from app.config import get_app_settings
from app.models import User
from app.models.auth_link_token import (
    RESET_PASSWORD_PURPOSE,
    VERIFY_ACCOUNT_PURPOSE,
    AuthLinkToken,
)
from tests.test_auth_links_in_database import (  # noqa: F401
    LINK_REFUSED,
    _password_changed,
    _reset,
    _reset_email,
    _signed_up,
    _token_in,
    clock,
)
from tests.test_auth_logs import _body, auth, mail  # noqa: F401

OTHER_EMAIL = "mira.vale@test.co"


def _rows(db, purpose, user_id=None):
    db.expire_all()
    query = db.query(AuthLinkToken).filter(AuthLinkToken.purpose == purpose)
    if user_id is not None:
        query = query.filter(AuthLinkToken.user_id == user_id)
    return query.order_by(AuthLinkToken.id).all()


def _other_account_reset_token(db, auth, mail):
    """A second verified account and the token of its own reset link."""
    assert auth.post("/api/auth/sign-up", json=_body(username="mira", email=OTHER_EMAIL)).status_code == 201
    other = db.query(User).filter(User.email == OTHER_EMAIL).one()
    other.is_verified = True
    db.commit()
    mail.sent.clear()
    assert auth.post("/api/auth/forgot-password", json={"email": OTHER_EMAIL}).status_code == 200
    [message] = mail.sent
    return other, _token_in(message, get_app_settings().RESET_PASSWORD_BASE_URL)


# ── decision 3: one reset cancels the account's other open reset links ──────
def test_using_a_reset_link_cancels_every_other_open_reset_link(db, auth, mail):
    user, _ = _signed_up(auth, db, mail, verified=True)
    _, first = _reset_email(auth, mail)
    _, second = _reset_email(auth, mail)
    _, third = _reset_email(auth, mail)

    used = _reset(auth, second)

    assert used.status_code == 204, used.text
    assert _password_changed(db, user) is True
    for token in (first, third):
        refused = _reset(auth, token)
        assert refused.status_code == 400
        assert refused.json() == LINK_REFUSED
    assert all(row.used_at is not None for row in _rows(db, RESET_PASSWORD_PURPOSE))


def test_the_cancel_leaves_her_verification_link_and_other_accounts_alone(db, auth, mail):
    user, verify_token = _signed_up(auth, db, mail)
    other, other_token = _other_account_reset_token(db, auth, mail)
    _, own = _reset_email(auth, mail)

    assert _reset(auth, own).status_code == 204

    [verify_row] = _rows(db, VERIFY_ACCOUNT_PURPOSE, user.id)
    assert verify_row.used_at is None
    assert [row.used_at for row in _rows(db, RESET_PASSWORD_PURPOSE, other.id)] == [None]
    assert "status=success" in auth.get(f"/api/auth/verify-account/{verify_token}").headers["location"]
    other_reset = _reset(auth, other_token)
    assert other_reset.status_code == 204, other_reset.text


def test_a_refused_link_cancels_nothing(db, auth, mail):
    _signed_up(auth, db, mail, verified=True)
    _, token = _reset_email(auth, mail)

    assert _reset(auth, "not-a-token-we-sent").status_code == 400

    assert _rows(db, RESET_PASSWORD_PURPOSE)[0].used_at is None
    assert _reset(auth, token).status_code == 204


# ── decision 4: used and expired rows are left where they are ────────────────
def test_used_and_expired_link_rows_are_left_in_place(db, auth, mail, clock):
    _signed_up(auth, db, mail, verified=True)
    _, expired = _reset_email(auth, mail)
    clock.ahead = timedelta(minutes=61)
    _, fresh = _reset_email(auth, mail)
    before = db.query(AuthLinkToken).count()

    assert _reset(auth, fresh).status_code == 204

    assert db.query(AuthLinkToken).count() == before
    expired_row, fresh_row = _rows(db, RESET_PASSWORD_PURPOSE)
    assert expired_row.used_at is None  # expired, so not open: left as it was
    assert fresh_row.used_at is not None
    assert _reset(auth, expired).status_code == 400


# ── decision 8: a real 204 ──────────────────────────────────────────────────
def test_a_reset_answers_a_real_204_with_no_body(db, auth, mail):
    _signed_up(auth, db, mail, verified=True)
    _, token = _reset_email(auth, mail)

    response = _reset(auth, token)

    assert response.status_code == 204
    assert response.content == b""
    assert "content-type" not in response.headers


def test_a_refused_reset_still_says_why(db, auth, mail):
    response = _reset(auth, "not-a-token-we-sent")

    assert response.status_code == 400
    assert response.json() == LINK_REFUSED


# ── decision 5: the in-memory store is gone ─────────────────────────────────
def test_the_old_in_memory_link_store_is_gone():
    assert importlib.util.find_spec("app.cache") is None
