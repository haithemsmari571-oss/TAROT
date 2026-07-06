"""Shared test fixtures.

Tests run against an in-memory SQLite database built directly from the models'
metadata (no Alembic, no Postgres needed). The reward/ledger services are
written with portable SQLAlchemy, so this exercises the real logic. Postgres-
specific concerns (native enum types, ALTER TYPE) live only in the migrations,
which are reviewed separately.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 — registers every model on Base.metadata
from app.enums.role import Role
from app.models import User
from app.models.base import Base


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,  # one shared in-memory DB for the session
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, expire_on_commit=False)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture
def make_user(db):
    """Factory creating minimal, unique client users."""
    counter = {"n": 0}

    def _make(
        balance: float = 0, credit_balance: float = 0, role: Role = Role.USER
    ) -> User:
        counter["n"] += 1
        n = counter["n"]
        user = User(
            email=f"user{n}@test.co",
            username=f"user{n}",
            password_hash="hash",
            balance=balance,
            credit_balance=credit_balance,
            role=role,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    return _make
