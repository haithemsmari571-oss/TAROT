"""Sign-up asks her to agree to the Terms and the Privacy Policy and keeps the
moment; Ask Valentina is for over-18s, from her date of birth.

- POST /api/auth/sign-up needs accept_terms true, and stores terms_accepted_at.
- A date of birth under 18 is refused with "Ask Valentina is for adults 18 and over.", as the
  {message} the sign-up page reads.
- PATCH /api/profile/me cannot set her date of birth under 18, or blank it.

The real routers behind a FastAPI test client on the in-memory database, with
the real DomainError handler of app/main.py; the verification email is not sent.
"""

from datetime import date, datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.exceptions.domain import DomainError
from app.models import User
from app.routers import auth as auth_router
from app.routers import profile as profile_router
from app.schemas.auth import UserSignup
from app.schemas.user import MINIMUM_AGE, UNDER_MINIMUM_AGE, is_under_minimum_age
from app.services import auth as auth_service

UNDER_AGE = "Ask Valentina is for adults 18 and over."


def _birthday(years_ago: int, today: date | None = None) -> date:
    today = today or date.today()
    try:
        return today.replace(year=today.year - years_ago)
    except ValueError:  # 29 February, in a year without one
        return today.replace(year=today.year - years_ago, day=28)


def _body(**changes):
    body = {
        "username": "nadia", "email": "nadia@test.co", "password": "secret-1",
        "date_of_birth": "1990-03-03", "gender": "WOMAN", "accept_terms": True,
    }
    body.update(changes)
    return {k: v for k, v in body.items() if v is not ...}


@pytest.fixture
def signup(db, monkeypatch):
    from app.main import domain_exception_handler

    async def _no_mail(db, user):
        return None

    monkeypatch.setattr(auth_service, "send_verify_mail", _no_mail)
    app = FastAPI()
    app.include_router(auth_router.router, prefix="/api/auth")
    app.add_exception_handler(DomainError, domain_exception_handler)
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app, raise_server_exceptions=False)


def _profile(db, user) -> TestClient:
    app = FastAPI()
    app.include_router(profile_router.router, prefix="/api/profile")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app, raise_server_exceptions=False)


# ── the words and the number, one source ─────────────────────────────────────
def test_the_rule_is_eighteen_in_the_owners_words():
    assert MINIMUM_AGE == 18
    assert UNDER_MINIMUM_AGE == UNDER_AGE


@pytest.mark.parametrize("born, today, under", [
    (date(2008, 9, 25), date(2026, 9, 24), True),   # the day before her 18th birthday
    (date(2008, 9, 25), date(2026, 9, 25), False),  # her 18th birthday
    (date(2008, 2, 29), date(2026, 2, 28), True),   # born on 29 February
    (date(2008, 2, 29), date(2026, 3, 1), False),   # 18 on 1 March in a year without one
    (date(1990, 3, 3), date(2026, 9, 25), False),
])
def test_under_minimum_age_counts_whole_birthdays(born, today, under):
    assert is_under_minimum_age(born, today) is under


# ── the Terms box ────────────────────────────────────────────────────────────
@pytest.mark.parametrize("accept_terms", [..., False, None, "yes"])
def test_the_schema_takes_only_a_ticked_box(accept_terms):
    with pytest.raises(ValidationError):
        UserSignup(**_body(accept_terms=accept_terms))
    assert UserSignup(**_body()).accept_terms is True


def test_sign_up_stores_when_she_agreed(db, signup):
    before = datetime.now(timezone.utc)
    response = signup.post("/api/auth/sign-up", json=_body())
    after = datetime.now(timezone.utc)

    assert response.status_code == 201, response.text
    user = db.query(User).filter(User.email == "nadia@test.co").one()
    accepted = user.terms_accepted_at.replace(tzinfo=timezone.utc)  # SQLite drops the zone
    assert before <= accepted <= after


@pytest.mark.parametrize("accept_terms", [..., False])
def test_sign_up_without_the_box_ticked_creates_nothing(db, signup, accept_terms):
    response = signup.post("/api/auth/sign-up", json=_body(accept_terms=accept_terms))

    assert response.status_code == 422, response.text
    assert db.query(User).count() == 0


# ── 18 or over at sign-up ────────────────────────────────────────────────────
def test_sign_up_under_eighteen_is_refused_in_her_words(db, signup):
    seventeen = _birthday(MINIMUM_AGE - 1)

    response = signup.post("/api/auth/sign-up", json=_body(date_of_birth=seventeen.isoformat()))

    assert response.status_code == 400, response.text
    assert response.json() == {"message": UNDER_AGE}
    assert db.query(User).count() == 0


def test_sign_up_on_her_eighteenth_birthday_is_accepted(db, signup):
    eighteen_today = _birthday(MINIMUM_AGE)

    response = signup.post("/api/auth/sign-up", json=_body(date_of_birth=eighteen_today.isoformat()))

    assert response.status_code == 201, response.text
    assert db.query(User).one().date_of_birth == eighteen_today


# ── her own profile edits ────────────────────────────────────────────────────
@pytest.mark.parametrize("date_of_birth", ["under", None])
def test_details_cannot_set_her_date_of_birth_under_eighteen_or_blank(db, make_user, date_of_birth):
    user = make_user()
    user.date_of_birth = date(1990, 3, 3)
    db.commit()
    value = _birthday(MINIMUM_AGE - 1).isoformat() if date_of_birth == "under" else None

    response = _profile(db, user).patch("/api/profile/me", json={"date_of_birth": value})

    assert response.status_code == 422, response.text
    assert [item["msg"] for item in response.json()["detail"]] == [f"Value error, {UNDER_AGE}"]
    db.refresh(user)
    assert user.date_of_birth == date(1990, 3, 3)


def test_details_accept_an_adult_date_and_leave_an_unsent_one_alone(db, make_user):
    user = make_user()
    client = _profile(db, user)

    response = client.patch("/api/profile/me", json={"date_of_birth": "1991-04-04"})
    assert response.status_code == 200, response.text
    db.refresh(user)
    assert user.date_of_birth == date(1991, 4, 4)

    # A name change sends no date: nothing is checked and nothing moves.
    response = client.patch("/api/profile/me", json={"username": "nadia r"})
    assert response.status_code == 200, response.text
    db.refresh(user)
    assert (user.username, user.date_of_birth) == ("nadia r", date(1991, 4, 4))
