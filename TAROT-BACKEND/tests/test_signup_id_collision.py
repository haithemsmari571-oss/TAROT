"""Sign-up never answers a bare 500 when the new account's id is taken.

A row inserted with its own id leaves the users id sequence behind (ROUND23
met it locally: users_id_seq at 96 while readers 97 and 99 existed), so the
next insert draws a taken id and fails on the primary key. services/auth.py
_insert_user rolls that insert back and tries once more with the next number;
a second taken id is refused as a 409 in plain English. Nothing else is
retried.

The real sign-up route on the in-memory database (the harness of
tests/test_signup_terms_and_age.py). SQLite hands out the next free id, so a
before_insert hook gives the first inserts the ids of existing accounts, the
way a sequence that is behind would.
"""

import pytest
from sqlalchemy import event
from sqlalchemy.exc import IntegrityError

from app.enums.transaction_type import TransactionType
from app.exceptions.users import UserAlreadyExistsError
from app.models import User
from app.models.settings import Settings
from app.models.transaction import Transaction
from app.services import auth as auth_service
from tests.test_signup_terms_and_age import _body, signup  # noqa: F401 (signup is a fixture)

TAKEN = "We couldn't create your account just now. Please try again."


@pytest.fixture
def taken_ids(db, make_user):
    """take(n) makes n accounts and hands their ids, in order, to the next n
    inserts into users. The usernames of every insert tried after take() are
    recorded in `tries`."""
    queue: list[int] = []
    tries: list[str] = []

    def give_taken_id(mapper, connection, target):
        tries.append(target.username)
        if queue:
            target.id = queue.pop(0)

    event.listen(User, "before_insert", give_taken_id)

    def take(n: int) -> list[tuple[int, str, str]]:
        existing = [make_user() for _ in range(n)]
        queue.extend(user.id for user in existing)
        tries.clear()
        return [(user.id, user.username, user.email) for user in existing]

    take.tries = tries
    yield take
    event.remove(User, "before_insert", give_taken_id)


def _accounts(db) -> list[tuple[int, str, str]]:
    return [(user.id, user.username, user.email) for user in db.query(User).order_by(User.id)]


def test_one_taken_id_is_tried_again_and_the_account_is_made(db, signup, taken_ids):
    existing = taken_ids(1)
    db.add(Settings(key=auth_service.SIGNUP_BONUS_SETTING, value="100"))
    db.commit()

    response = signup.post("/api/auth/sign-up", json=_body())

    assert response.status_code == 201, response.text
    assert taken_ids.tries == ["nadia", "nadia"]
    nadia = db.query(User).filter(User.username == "nadia").one()
    assert nadia.id != existing[0][0]
    assert _accounts(db) == existing + [(nadia.id, "nadia", "nadia@test.co")]  # the other account untouched
    bonus = db.query(Transaction).one()  # the rest of sign-up follows the account that was made
    assert (bonus.user_id, bonus.transaction_type, bonus.amount) == (nadia.id, TransactionType.BONUS, 100)
    assert nadia.credit_balance == 100


def test_two_taken_ids_answer_409_in_plain_english_and_save_nothing(db, signup, taken_ids):
    existing = taken_ids(auth_service.SIGNUP_INSERT_ATTEMPTS)

    response = signup.post("/api/auth/sign-up", json=_body())

    assert response.status_code == 409, response.text
    assert response.json() == {"message": TAKEN}
    assert taken_ids.tries == ["nadia"] * auth_service.SIGNUP_INSERT_ATTEMPTS
    assert _accounts(db) == existing
    assert db.query(Transaction).count() == 0

    again = signup.post("/api/auth/sign-up", json=_body())  # nothing was saved, so trying again works

    assert again.status_code == 201, again.text
    assert db.query(User).filter(User.username == "nadia").count() == 1


def test_a_taken_email_is_not_tried_again(db, make_user):
    """Only the id is retried. Two sign-ups with one address at the same moment
    pass the check in _validate_user and meet at the unique email; the one that
    loses gets that check's own answer (tests/test_signup_race.py)."""
    other = make_user()
    tries = []

    def give_taken_email(mapper, connection, target):
        tries.append(target.username)
        target.email = other.email

    event.listen(User, "before_insert", give_taken_email)
    try:
        with pytest.raises(UserAlreadyExistsError):
            auth_service._insert_user(
                db, {"username": "nadia", "email": "nadia@test.co"}, "hash", terms_accepted_at=None
            )
    finally:
        event.remove(User, "before_insert", give_taken_email)
    assert tries == ["nadia"]
    assert db.query(User).count() == 1


@pytest.mark.parametrize("text, taken", [
    ('duplicate key value violates unique constraint "users_pkey"\nDETAIL:  Key (id)=(97) already exists.', True),
    ("UNIQUE constraint failed: users.id", True),
    ('duplicate key value violates unique constraint "ix_users_email"\nDETAIL:  Key (email)=(a@b.co) already exists.', False),
    ('duplicate key value violates unique constraint "ix_users_client_code"', False),
    ("UNIQUE constraint failed: users.email", False),
    ('insert or update on table "transactions" violates foreign key constraint "transactions_user_id_fkey"', False),
])
def test_only_the_users_primary_key_counts_as_a_taken_id(text, taken):
    error = IntegrityError("INSERT INTO users …", {}, Exception(text))
    assert auth_service._user_id_taken(error) is taken
