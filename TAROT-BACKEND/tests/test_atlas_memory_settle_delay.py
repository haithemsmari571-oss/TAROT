"""The end-of-session summary waits, and gets out of the way if she comes back.

Folding a reading into the client's long-term memory the instant it ends means a client who
comes straight back — which is what someone does when they were enjoying it — starts her
second reading against a memory being rewritten underneath her from the first.
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 — registers every model
from app.enums.chat_session_status import ChatSessionStatus
from app.enums.chat_status import ChatStatus
from app.models.atlas_client_memory_job import AtlasClientMemoryJob
from app.models.base import Base
from app.models.chat import Chat
from app.models.chat_session import ChatSession
from app.models.user import User
from app.services import atlas_client_memory_jobs as J


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


def _pair(db, chat_id=1, session_id=1, status=ChatSessionStatus.COMPLETED):
    from app.enums.role import Role

    client = db.query(User).filter(User.id == 10).first()
    if client is None:
        db.add(User(id=10, email="c@t.co", username="c", password_hash="x", role=Role.USER))
        db.add(User(id=20, email="p@t.co", username="p", password_hash="x", role=Role.PSYCHIC))
        db.flush()
    db.add(Chat(id=chat_id, user_id=10, psychic_id=20, status=ChatStatus.ENDED))
    db.flush()
    db.add(ChatSession(id=session_id, chat_id=chat_id, status=status))
    db.flush()
    return session_id


def test_a_finished_reading_is_not_summarised_immediately(db):
    session_id = _pair(db)
    assert J.enqueue_atlas_client_memory_job(db, session_id) is True
    db.commit()
    job = db.get(AtlasClientMemoryJob, session_id)
    assert job.not_before is not None
    due = job.not_before
    if due.tzinfo is None:
        due = due.replace(tzinfo=timezone.utc)
    waited = (due - datetime.now(timezone.utc)).total_seconds() / 60
    assert 10 <= waited <= 15          # the brief's window


def test_it_is_not_eligible_until_the_delay_has_passed(db):
    session_id = _pair(db)
    J.enqueue_atlas_client_memory_job(db, session_id)
    db.commit()
    assert J.pending_atlas_client_memory_job_ids(db) == []
    later = datetime.now(timezone.utc) + timedelta(minutes=J.ATLAS_MEMORY_SETTLE_MINUTES + 1)
    assert J.pending_atlas_client_memory_job_ids(db, now=later) == [session_id]


def test_coming_back_pushes_the_summary_out_of_the_way(db):
    session_id = _pair(db)
    J.enqueue_atlas_client_memory_job(db, session_id)
    db.commit()
    # Rewind it so it is due right now, then have her walk back in.
    job = db.get(AtlasClientMemoryJob, session_id)
    job.not_before = J._for_column(db, datetime.now(timezone.utc) - timedelta(minutes=1))
    db.commit()
    assert J.pending_atlas_client_memory_job_ids(db) == [session_id]

    assert J.defer_atlas_memory_for_client(db, client_id=10, psychic_id=20) == 1
    db.commit()
    assert J.pending_atlas_client_memory_job_ids(db) == []


def test_a_deferral_never_cancels_the_summary(db):
    """Deliberately a deferral, not a cancellation: the earlier reading still has to reach
    her long-term memory, just not while she is inside a live session."""
    session_id = _pair(db)
    J.enqueue_atlas_client_memory_job(db, session_id)
    J.defer_atlas_memory_for_client(db, client_id=10, psychic_id=20)
    db.commit()
    job = db.get(AtlasClientMemoryJob, session_id)
    assert job.status == "PENDING"
    much_later = datetime.now(timezone.utc) + timedelta(hours=2)
    assert J.pending_atlas_client_memory_job_ids(db, now=much_later) == [session_id]


def test_a_live_reading_with_the_same_reader_holds_the_summary_back(db):
    """The long second reading: still running when the settle delay expires.

    A client and a reader share exactly one chat row (there is a unique constraint on the
    pair), so her second reading is a second ChatSession on that same chat."""
    session_id = _pair(db, chat_id=1, session_id=1)
    J.enqueue_atlas_client_memory_job(db, session_id)
    db.add(ChatSession(id=2, chat_id=1, status=ChatSessionStatus.ACTIVE))
    db.commit()
    much_later = datetime.now(timezone.utc) + timedelta(hours=2)
    assert J.pending_atlas_client_memory_job_ids(db, now=much_later) == []


def test_a_different_readers_session_does_not_hold_it_back(db):
    """Her memory is siloed per reader, so a live reading with somebody else is irrelevant."""
    from app.enums.role import Role

    session_id = _pair(db, chat_id=1, session_id=1)
    J.enqueue_atlas_client_memory_job(db, session_id)
    db.add(User(id=30, email="p2@t.co", username="p2", password_hash="x", role=Role.PSYCHIC))
    db.flush()
    db.add(Chat(id=2, user_id=10, psychic_id=30, status=ChatStatus.ACTIVE))
    db.flush()
    db.add(ChatSession(id=2, chat_id=2, status=ChatSessionStatus.ACTIVE))
    db.commit()
    much_later = datetime.now(timezone.utc) + timedelta(hours=2)
    assert J.pending_atlas_client_memory_job_ids(db, now=much_later) == [session_id]
