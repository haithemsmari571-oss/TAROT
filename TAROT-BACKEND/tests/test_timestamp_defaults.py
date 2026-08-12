import os
import time
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import Integer, create_engine, text
from sqlalchemy.orm import Mapped, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool

from app.models.base import Base


class TimestampWallClockProbe(Base):
    __tablename__ = "timestamp_wall_clock_probe"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)


def _as_utc(value):
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _assert_created_at_reflects_insert_time(engine):
    TimestampWallClockProbe.__table__.drop(engine, checkfirst=True)
    TimestampWallClockProbe.__table__.create(engine)
    TestingSession = sessionmaker(bind=engine, expire_on_commit=False)

    try:
        with TestingSession.begin() as session:
            session.execute(text("SELECT 1"))
            transaction_started_at = datetime.now(timezone.utc)
            time.sleep(1.1)
            row = TimestampWallClockProbe()
            session.add(row)
            session.flush()

            created_at = _as_utc(row.created_at)
            print(f"transaction_started_at={transaction_started_at.isoformat()}")
            print(f"created_at={created_at.isoformat()}")
            assert created_at >= transaction_started_at + timedelta(seconds=1)
    finally:
        TimestampWallClockProbe.__table__.drop(engine, checkfirst=True)
        engine.dispose()


def test_created_at_uses_wall_clock_within_one_sqlite_transaction():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    _assert_created_at_reflects_insert_time(engine)


def test_created_at_uses_wall_clock_within_one_postgresql_transaction():
    database_url = os.getenv("TIMESTAMP_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TIMESTAMP_TEST_DATABASE_URL is required for this PostgreSQL test")
    _assert_created_at_reflects_insert_time(create_engine(database_url))
