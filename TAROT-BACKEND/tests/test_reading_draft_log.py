"""Append-only reading-pipeline audit log: one row per generation attempt, every attempt
kept (never overwritten), and a failed write degrades gracefully instead of raising."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 — registers ReadingDraftAttempt on Base.metadata
from app.models.base import Base
from app.models.reading_draft_attempt import ReadingDraftAttempt
from app.services.ai.reading_draft_log import DraftAttemptLog


def _log_with_db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    return DraftAttemptLog(session_factory=factory), factory


def _rows(factory, chat_id):
    with factory() as db:
        return (
            db.query(ReadingDraftAttempt)
            .filter(ReadingDraftAttempt.chat_id == chat_id)
            .order_by(ReadingDraftAttempt.id)
            .all()
        )


def test_log_appends_a_row_with_all_fields():
    log, factory = _log_with_db()
    log.log(
        chat_id=7, turn_number=1, engine="single_agent", stage="reader_output",
        raw_content="hey love\n\n@@HOLD@@\nif X :: banked", notes='[["if X","banked"]]',
    )
    rows = _rows(factory, 7)
    assert len(rows) == 1
    r = rows[0]
    assert r.engine == "single_agent" and r.stage == "reader_output"
    assert "hey love" in r.raw_content and "@@HOLD@@" in r.raw_content  # RAW output preserved
    assert r.notes == '[["if X","banked"]]'
    assert r.attempt_number == 1 and r.is_delivered is False
    assert r.created_at is not None


def test_append_only_keeps_every_attempt_never_overwrites():
    log, factory = _log_with_db()
    for n in (1, 2, 3):
        log.log(
            chat_id=9, turn_number=2, attempt_number=n, engine="single_agent",
            stage="reader_output", raw_content=f"attempt {n} raw", is_delivered=(n == 3),
        )
    rows = _rows(factory, 9)
    assert [r.attempt_number for r in rows] == [1, 2, 3]  # every attempt kept, not overwritten
    assert [r.raw_content for r in rows] == ["attempt 1 raw", "attempt 2 raw", "attempt 3 raw"]
    assert [r.is_delivered for r in rows] == [False, False, True]  # which attempt was delivered


def test_two_role_records_valentina_draft_and_sabri_delivery():
    log, factory = _log_with_db()
    log.log(chat_id=11, turn_number=1, engine="two_role", stage="valentina_draft",
            raw_content="VALENTINA RAW DRAFT ...", is_delivered=False)
    log.log(chat_id=11, turn_number=1, engine="two_role", stage="sabri_delivery",
            raw_content="curated bubbles ...", notes='{"fact_drift":{"numbers":["7"]}}',
            is_delivered=True)
    rows = _rows(factory, 11)
    by_stage = {r.stage: r for r in rows}
    assert set(by_stage) == {"valentina_draft", "sabri_delivery"}
    assert by_stage["valentina_draft"].is_delivered is False
    assert by_stage["sabri_delivery"].is_delivered is True
    assert "fact_drift" in by_stage["sabri_delivery"].notes


def test_failed_write_degrades_gracefully_never_raises():
    def broken_factory():
        raise RuntimeError("db down")

    log = DraftAttemptLog(session_factory=broken_factory)
    # must NOT raise, and returns None
    assert log.log(chat_id=1, turn_number=1, engine="two_role",
                   stage="sabri_delivery", raw_content="x") is None
    assert log._db_ok is False  # probed once, cached unavailable -> no repeated slow retries
    # a second call is a fast no-op, still no raise
    assert log.log(chat_id=1, turn_number=2, engine="two_role",
                   stage="sabri_delivery", raw_content="y") is None
