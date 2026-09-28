"""Signing in before the email is verified (as every new account on the live
site does until it clicks the link).

The sign-in page showed "Incorrect email or password." for every refusal it
could not read, so a client with the right password was told it was wrong and
never learnt that her account waited for its verification link. The server
now answers that case 403 with its own words, which the page shows (login.tsx
loginRefusal), and keeps 400 for a wrong email or password.

Since ROUND38 (EmailConfirm=A) a client signs in before she verifies
(tests/test_email_confirmation_gate.py); the 403 stays for a reader or admin
account.

The real auth router and the DomainError handler on the in-memory database,
as tests/test_auth_logs.py builds them.
"""

from app.enums.role import Role
from app.models import User
from tests.test_auth_logs import EMAIL, PASSWORD, WRONG_PASSWORD, _body, auth, mail  # noqa: F401


def test_an_unverified_account_with_the_right_password_is_told_to_verify(db, auth):
    assert auth.post("/api/auth/sign-up", json=_body()).status_code == 201
    user = db.query(User).one()
    user.role = Role.PSYCHIC
    user.is_verified = False
    db.commit()

    response = auth.post("/api/auth/sign-in", json={"email": EMAIL, "password": PASSWORD})

    assert response.status_code == 403, response.text
    assert response.json() == {"message": "Account not verified, please verify your account to login"}
    assert "access_token" not in response.text


def test_a_wrong_password_on_an_unverified_account_is_still_a_wrong_password(db, auth):
    """The verification state is never revealed to someone without the password."""
    assert auth.post("/api/auth/sign-up", json=_body()).status_code == 201
    user = db.query(User).one()
    user.is_verified = False
    db.commit()

    response = auth.post("/api/auth/sign-in", json={"email": EMAIL, "password": WRONG_PASSWORD})

    assert response.status_code == 400, response.text
    assert "not verified" not in response.text


def test_a_verified_account_signs_in(db, auth):
    assert auth.post("/api/auth/sign-up", json=_body()).status_code == 201
    user = db.query(User).one()
    user.is_verified = True
    db.commit()

    response = auth.post("/api/auth/sign-in", json={"email": EMAIL, "password": PASSWORD})

    assert response.status_code == 200, response.text
    assert set(response.json()) >= {"access_token", "refresh_token"}
