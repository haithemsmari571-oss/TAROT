"""Two sign-ups with the same email or username at the same moment never answer
a bare 500 (ROUND25 defect 1).

Both pass the check in services/auth.py _validate_user before either is saved,
then meet at the users email or username unique key. _insert_user maps that
IntegrityError to the check's own answer, 400 {"message": USER_ALREADY_EXISTS},
which is what a sign-up with a taken username or email gets today. It is not
tried again, and nothing of the losing sign-up is saved.

The real sign-up route on the in-memory database (the harness of
tests/test_signup_terms_and_age.py). The other sign-up is saved in the gap
between the check and the insert: _validate_user runs as it is, and the other
account is committed straight after it, as a sign-up in another worker would be.
"""

import pytest
from sqlalchemy import event
from sqlalchemy.exc import IntegrityError

from app.exceptions.users import UserAlreadyExistsError
from app.models import User
from app.models.transaction import Transaction
from app.services import auth as auth_service
from tests.test_signup_terms_and_age import _body, signup  # noqa: F401 (signup is a fixture)

ALREADY_EXISTS = {"message": "User with that username or email already exist"}


@pytest.fixture
def saved_in_the_gap(db, monkeypatch):
    """arrange(username, email) commits that account straight after the next
    sign-up passes _validate_user. Every insert into users that sign-up tries is
    recorded, by username, in `tries`."""
    pending: list[dict] = []
    tries: list[str] = []
    real_validate = auth_service._validate_user

    def validate_then_the_other_is_saved(session, user_data):
        real_validate(session, user_data)
        while pending:
            session.add(User(password_hash="hash", **pending.pop(0)))
            session.commit()
        tries.clear()

    def record_try(mapper, connection, target):
        tries.append(target.username)

    monkeypatch.setattr(auth_service, "_validate_user", validate_then_the_other_is_saved)
    event.listen(User, "before_insert", record_try)

    def arrange(username: str, email: str) -> None:
        pending.append({"username": username, "email": email})

    arrange.tries = tries
    yield arrange
    event.remove(User, "before_insert", record_try)


def _accounts(db) -> list[tuple[str, str]]:
    return [(user.username, user.email) for user in db.query(User).order_by(User.id)]


@pytest.mark.parametrize("other, sent", [
    (("amira", "nadia@test.co"), {}),                          # the same email
    (("amira", "nadia@test.co"), {"email": "Nadia@Test.CO"}),  # sign-up stores it lower case
    (("nadia", "amira@test.co"), {}),                          # the same username
])
def test_two_at_once_answer_already_exists_and_save_nothing(db, signup, saved_in_the_gap, other, sent):
    saved_in_the_gap(*other)

    response = signup.post("/api/auth/sign-up", json=_body(**sent))

    assert response.status_code == 400, response.text
    assert response.json() == ALREADY_EXISTS
    assert saved_in_the_gap.tries == ["nadia"]  # tried once, never again
    assert _accounts(db) == [other]  # only the one that got there first
    assert db.query(Transaction).count() == 0

    fresh = signup.post("/api/auth/sign-up", json=_body(username="layla", email="layla@test.co"))

    assert fresh.status_code == 201, fresh.text  # the session was left clean
    assert _accounts(db) == [other, ("layla", "layla@test.co")]


def test_the_answer_is_the_one_a_taken_email_gets_today(db, signup, saved_in_the_gap):
    first = signup.post("/api/auth/sign-up", json=_body(username="amira"))
    taken = signup.post("/api/auth/sign-up", json=_body())  # refused by _validate_user
    saved_in_the_gap("layla", "layla@test.co")
    raced = signup.post("/api/auth/sign-up", json=_body(username="nadia2", email="layla@test.co"))

    assert first.status_code == 201, first.text
    assert (taken.status_code, taken.json()) == (400, ALREADY_EXISTS)
    assert (raced.status_code, raced.json()) == (taken.status_code, taken.json())
    assert auth_service.USER_ALREADY_EXISTS == ALREADY_EXISTS["message"]


def test_the_answer_does_not_carry_the_insert(db, make_user):
    """The IntegrityError's text holds the insert's parameters, the password
    hash among them; the answer is raised without it."""
    other = make_user()

    def give_taken_email(mapper, connection, target):
        target.email = other.email

    event.listen(User, "before_insert", give_taken_email)
    try:
        with pytest.raises(UserAlreadyExistsError) as raised:
            auth_service._insert_user(
                db, {"username": "nadia", "email": "nadia@test.co"}, "hash", terms_accepted_at=None
            )
    finally:
        event.remove(User, "before_insert", give_taken_email)
    assert raised.value.message == auth_service.USER_ALREADY_EXISTS
    assert raised.value.__cause__ is None
    assert raised.value.__suppress_context__ is True


@pytest.mark.parametrize("text, taken", [
    ('duplicate key value violates unique constraint "users_email_key"\nDETAIL:  Key (email)=(a@b.co) already exists.', True),
    ('duplicate key value violates unique constraint "users_username_key"\nDETAIL:  Key (username)=(nadia) already exists.', True),
    ("UNIQUE constraint failed: users.email", True),
    ("UNIQUE constraint failed: users.username", True),
    ('duplicate key value violates unique constraint "users_pkey"\nDETAIL:  Key (id)=(97) already exists.', False),
    ("UNIQUE constraint failed: users.id", False),
    ('duplicate key value violates unique constraint "ix_users_client_code"', False),
    ('insert or update on table "transactions" violates foreign key constraint "transactions_user_id_fkey"', False),
])
def test_only_the_email_and_username_keys_count_as_already_exists(text, taken):
    error = IntegrityError("INSERT INTO users …", {}, Exception(text))
    assert auth_service._email_or_username_taken(error) is taken
    assert not (auth_service._email_or_username_taken(error) and auth_service._user_id_taken(error))
