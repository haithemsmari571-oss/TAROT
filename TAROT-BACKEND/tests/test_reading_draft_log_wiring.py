"""The 3 wired call sites actually log the pipeline's intermediate work:
  * single_agent (reading_reader.run_reader_turn) -> reader_output (raw text + holds)
  * two_role     (reading_sabri.sabri_deliver)    -> sabri_delivery (raw + advisory notes)
  * two_role     (reading_duo._write_valentina_turn) -> valentina_draft (her raw draft)
All with injected model calls (no AI) and a DB-backed test draft-log."""

import asyncio
import json

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 — registers ReadingDraftAttempt on Base.metadata
from app.models.base import Base
from app.models.reading_draft_attempt import ReadingDraftAttempt
from app.services.ai import (
    reading_assistant, reading_draft_log, reading_duo, reading_reader,
    reading_sabri, reading_valentina,
)
from app.services.ai.reading_draft_log import DraftAttemptLog
from app.services.ai.reading_session import create_session_state


def _install_test_log(monkeypatch):
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    log = DraftAttemptLog(session_factory=factory)
    monkeypatch.setattr(reading_draft_log, "get_draft_log", lambda: log)
    return factory


def _rows(factory, chat_id):
    with factory() as db:
        return (
            db.query(ReadingDraftAttempt)
            .filter(ReadingDraftAttempt.chat_id == chat_id)
            .order_by(ReadingDraftAttempt.id)
            .all()
        )


# ── single_agent: reading_reader.run_reader_turn -> reader_output ─────────────
def test_reader_output_logged_with_raw_and_holds(monkeypatch):
    factory = _install_test_log(monkeypatch)
    raw = "hey love\n\nsomething cracked open\n\n@@HOLD@@\nif she asks timing :: mid-november"
    reading_reader.run_reader_turn(
        "READER INPUT", reader_call=lambda _i: raw, max_attempts=2, chat_id=55, turn_number=2,
    )
    rows = _rows(factory, 55)
    assert len(rows) == 1
    r = rows[0]
    assert r.engine == "single_agent" and r.stage == "reader_output"
    assert r.turn_number == 2 and r.attempt_number == 1 and r.is_delivered is True
    assert "@@HOLD@@" in r.raw_content and "something cracked open" in r.raw_content  # RAW, pre-split
    assert json.loads(r.notes) == [["if she asks timing", "mid-november"]]           # the parsed holds


def test_reader_logs_every_attempt_delivered_on_the_returned_one(monkeypatch):
    factory = _install_test_log(monkeypatch)
    seq = iter(["   \n  ", "real bubble\n\n@@HOLD@@\nif X :: banked"])  # 1st empty, 2nd delivers
    reading_reader.run_reader_turn(
        "INPUT", reader_call=lambda _i: next(seq), max_attempts=2, chat_id=99, turn_number=1,
    )
    rows = _rows(factory, 99)
    assert [r.attempt_number for r in rows] == [1, 2]         # every attempt logged
    assert [r.is_delivered for r in rows] == [False, True]    # only the returned attempt is delivered


# ── two_role: reading_sabri.sabri_deliver -> sabri_delivery ──────────────────
def test_sabri_delivery_logged_with_fact_drift_notes(monkeypatch):
    factory = _install_test_log(monkeypatch)
    # Valentina's draft carries "life path 7"; Sabri's delivery omits the 7 -> fact-drift note.
    bubbles, reserve = reading_sabri.sabri_deliver(
        "SABRI INPUT", source_content="he is a pisces with a life path 7",
        sabri_call=lambda _i: "he loves you\n\ngive it two weeks",
        max_attempts=1, chat_id=77, turn_number=4,
    )
    rows = _rows(factory, 77)
    assert len(rows) == 1
    r = rows[0]
    assert r.engine == "two_role" and r.stage == "sabri_delivery"
    assert r.turn_number == 4 and r.attempt_number == 1 and r.is_delivered is False
    assert "he loves you" in r.raw_content
    assert "7" in json.loads(r.notes)["fact_drift"]["numbers"]  # Sabri dropped Valentina's life path 7
    assert bubbles == ["he is a pisces with a life path 7"]
    assert reserve == ""


# ── two_role: reading_duo._write_valentina_turn -> valentina_draft ───────────
def test_valentina_draft_logged(monkeypatch):
    factory = _install_test_log(monkeypatch)

    class _FakeSession:
        def __enter__(self):
            return None

        def __exit__(self, *a):
            return False

    monkeypatch.setattr("app.database.client.SessionLocal", lambda: _FakeSession())
    monkeypatch.setattr(reading_assistant, "build_client_file", lambda db, uid: "DOSSIER")
    monkeypatch.setattr("app.services.client_dossier.get_client_dob", lambda db, uid: None)
    monkeypatch.setattr(
        reading_valentina, "write_valentina",
        lambda inp, client_message=None: "VALENTINA RAW DRAFT — the cards say he's not gone...",
    )

    state = create_session_state("chat:88", client_id=3, chat_id=88, is_first_session=True)
    state.messages_sent_count = 1

    text = asyncio.run(reading_duo._write_valentina_turn(88, "will he come back", None, state, 3))
    assert text.startswith("VALENTINA RAW DRAFT")

    rows = _rows(factory, 88)
    assert len(rows) == 1
    r = rows[0]
    assert r.engine == "two_role" and r.stage == "valentina_draft"
    assert r.turn_number == 1 and r.is_delivered is False
    assert "VALENTINA RAW DRAFT" in r.raw_content
