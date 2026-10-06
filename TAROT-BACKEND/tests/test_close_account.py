"""scripts/close_account.py (ROUND60): a staff account closed the way a client's
own Delete account closes hers, and the accounts it refuses.

With --apply only: the dry run opens its transaction READ ONLY, a Postgres
statement, and was proven on the real database (relay/ROUND60_RESULT.md).
"""

import importlib
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 - registers every model on Base.metadata
from app.enums.role import Role
from app.enums.user_status import UserStatus
from app.models import User
from app.models.auth_link_token import RESET_PASSWORD_PURPOSE, AuthLinkToken
from app.models.base import Base
from app.models.push_subscription import PUSH_APP_OWNER, PushSubscription
from app.models.push_token import PushToken
from app.services.users import closed_account_email
from app.utils.security import hash_password, verify_password

close_account = importlib.import_module("scripts.close_account")
OLD_PASSWORD = "the-old-password"


@pytest.fixture
def db(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(close_account, "SessionLocal", sessions)
    monkeypatch.setattr(close_account, "engine", engine)
    session = sessions()
    # Account 1, the site's first owner, as on every database.
    _account(session, Role.SUPERADMIN, account_id=1)
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def _account(db, role, *, account_id=None, status=UserStatus.ACTIVE, verified=True) -> User:
    n = db.query(User).count() + 1
    user = User(
        id=account_id, email=f"staff{n}@example.test", username=f"staff{n}",
        password_hash=hash_password(OLD_PASSWORD), role=role, status=status, is_verified=verified,
    )
    db.add(user)
    db.commit()
    return user


def _signed_in_things(db, user):
    db.add_all([
        PushSubscription(user_id=user.id, endpoint=f"https://push.example/{user.id}", p256dh="k", auth="a", app=PUSH_APP_OWNER),
        PushToken(user_id=user.id, token=f"phone-{user.id}", platform="ios"),
        AuthLinkToken(user_id=user.id, purpose=RESET_PASSWORD_PURPOSE, token_hash="0" * 64,
                      expires_at=datetime.now(timezone.utc) + timedelta(hours=1)),
    ])
    db.commit()


def _left(db, model, user_id):
    return db.query(model).filter(model.user_id == user_id).count()


@pytest.mark.parametrize("role", [Role.ADMIN, Role.SUPERADMIN])
def test_apply_closes_a_staff_account_as_self_deletion_does(db, capsys, role):
    staff = _account(db, role)
    _signed_in_things(db, staff)

    assert close_account.main(["--id", str(staff.id), "--apply"]) == 0

    db.expire_all()
    closed = db.get(User, staff.id)
    assert closed.email == closed_account_email(staff.id)
    assert closed.username == f"deleted-user-{staff.id}"
    assert closed.status == UserStatus.SUSPENDED
    assert not verify_password(OLD_PASSWORD, closed.password_hash)
    assert [_left(db, model, staff.id) for model in (PushSubscription, PushToken, AuthLinkToken)] == [0, 0, 0]
    assert "Done. The account is closed" in capsys.readouterr().out
    # A second run finds nothing to do.
    assert close_account.main(["--id", str(staff.id), "--apply"]) == 0
    assert "Already closed. Nothing to do." in capsys.readouterr().out


def _refused(db, capsys, account_id) -> str:
    before = [(u.id, u.email, u.status) for u in db.query(User).order_by(User.id)]
    assert close_account.main(["--id", str(account_id), "--apply"]) == 1
    db.expire_all()
    assert [(u.id, u.email, u.status) for u in db.query(User).order_by(User.id)] == before
    out = capsys.readouterr().out
    assert "REFUSED" in out and "Nothing was changed." in out
    return out


def test_account_1_is_refused(db, capsys):
    _account(db, Role.SUPERADMIN)  # another SUPERADMIN, so only the id refuses it
    assert "account 1 is the site's first owner account" in _refused(db, capsys, 1)


def test_a_reader_is_refused(db, capsys):
    assert "is a reader" in _refused(db, capsys, _account(db, Role.PSYCHIC).id)


def test_a_client_is_refused(db, capsys):
    assert "is a client" in _refused(db, capsys, _account(db, Role.USER).id)


def test_an_unknown_id_is_refused(db, capsys):
    assert "there is no account with id 9999" in _refused(db, capsys, 9999)


def test_the_last_superadmin_who_can_sign_in_is_refused(db, capsys):
    db.get(User, 1).status = UserStatus.SUSPENDED
    db.commit()
    _account(db, Role.SUPERADMIN, verified=False)  # cannot sign in either
    last = _account(db, Role.SUPERADMIN)
    assert "the last SUPERADMIN who can sign in" in _refused(db, capsys, last.id)


def test_a_superadmin_with_another_left_is_closed(db, capsys):
    staff = _account(db, Role.SUPERADMIN)  # account 1 is still there and active
    assert close_account.main(["--id", str(staff.id), "--apply"]) == 0
