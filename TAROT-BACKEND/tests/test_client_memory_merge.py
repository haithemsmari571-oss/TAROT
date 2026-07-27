"""One rolling summary per (client, psychic), merged forward — and a purge that sticks.

The behaviour being replaced: every session end re-summarised the client's ENTIRE
message history and appended the result beside all the earlier ones. Five
readings left five overlapping summaries, and a deletion was undone at the next
session because the summariser read raw history from the beginning again.
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

import app.models  # noqa: F401  (registers the mappers)
from app.models import ClientMemorySummary
from app.models.base import Base
from app.services import client_memory


@pytest.fixture()
def db(tmp_path):
    engine = create_engine(f"sqlite:///{(tmp_path / 'memory.sqlite3').as_posix()}")
    Base.metadata.create_all(engine)
    session: Session = sessionmaker(bind=engine)()
    yield session
    session.close()
    engine.dispose()


BASE = datetime(2026, 7, 1, 12, 0, tzinfo=timezone.utc)


def _chat(db: Session, *, chat_id=1, client_id=10, psychic_id=20):
    from app.enums.chat_status import ChatStatus
    from app.models.chat import Chat

    chat = Chat(id=chat_id, user_id=client_id, psychic_id=psychic_id, status=ChatStatus.ENDED)
    db.add(chat)
    db.commit()
    return chat


def _msg_at(db: Session, *, chat_id, sender_id, content, when):
    from app.models.message import Message

    db.add(
        Message(chat_id=chat_id, sender_id=sender_id, content=content, is_system=False, created_at=when)
    )
    db.commit()


def _msg(db: Session, *, chat_id, sender_id, content, minutes):
    from app.models.message import Message

    db.add(
        Message(
            chat_id=chat_id,
            sender_id=sender_id,
            content=content,
            is_system=False,
            created_at=BASE + timedelta(minutes=minutes),
        )
    )
    db.commit()


class TestResumePoint:
    def test_no_stamps_means_read_everything(self, db):
        row = client_memory.get_or_create_record(db, 10, 20)
        assert client_memory.resume_point(row) is None

    def test_a_purge_floor_beats_an_older_watermark(self, db):
        """The whole point of keeping cleared_at instead of deleting the row."""
        row = client_memory.get_or_create_record(db, 10, 20)
        row.covers_through = BASE
        row.cleared_at = BASE + timedelta(hours=5)
        db.commit()
        assert client_memory.resume_point(row) == BASE + timedelta(hours=5)


class TestTranscriptWindow:
    def test_only_messages_after_the_watermark_are_read(self, db):
        _chat(db)
        _msg(db, chat_id=1, sender_id=10, content="old client line", minutes=0)
        _msg(db, chat_id=1, sender_id=20, content="old reader line", minutes=1)
        _msg(db, chat_id=1, sender_id=10, content="NEW client line", minutes=100)

        text, newest = client_memory.build_new_session_transcript(
            db, 1, BASE + timedelta(minutes=50)
        )
        assert "NEW client line" in text
        assert "old client line" not in text
        assert "old reader line" not in text
        assert newest == BASE + timedelta(minutes=100)

    def test_speakers_are_labelled_from_the_chat(self, db):
        _chat(db)
        _msg(db, chat_id=1, sender_id=10, content="from the client", minutes=0)
        _msg(db, chat_id=1, sender_id=20, content="from the reader", minutes=1)
        text, _ = client_memory.build_new_session_transcript(db, 1, None)
        assert text == "Client: from the client\nReader: from the reader"


class TestMergeForward:
    def test_the_model_receives_the_existing_summary_and_only_new_messages(self, db, monkeypatch):
        _chat(db)
        _msg(db, chat_id=1, sender_id=10, content="already folded in", minutes=0)
        _msg(db, chat_id=1, sender_id=20, content="also folded in", minutes=1)

        row = client_memory.get_or_create_record(db, 10, 20)
        row.summary = "She has asked about her ex twice."
        row.covers_through = BASE + timedelta(minutes=30)
        db.commit()

        _msg(db, chat_id=1, sender_id=10, content="this session she mentions a new job", minutes=60)
        _msg(db, chat_id=1, sender_id=20, content="reader explores the move", minutes=61)

        seen = {}

        def fake_run_chat(*, system, user_content, model, max_tokens):
            seen["system"] = system
            seen["user"] = user_content
            return {"text": "Merged: the ex, and now a new job."}

        _patch_ai(monkeypatch, fake_run_chat)
        result = client_memory.merge_session(db, 1)

        assert result is not None
        # The prior summary is an input, not something regenerated from scratch.
        assert "She has asked about her ex twice." in seen["user"]
        assert "this session she mentions a new job" in seen["user"]
        # Already-folded material must NOT be re-read.
        assert "already folded in" not in seen["user"]
        assert "Merge, do not restart." in seen["system"]

    def test_one_row_is_replaced_not_appended(self, db, monkeypatch):
        _chat(db)
        _patch_ai(monkeypatch, lambda **kw: {"text": "summary v1"})
        _msg(db, chat_id=1, sender_id=10, content="a", minutes=0)
        _msg(db, chat_id=1, sender_id=20, content="b", minutes=1)
        client_memory.merge_session(db, 1)

        _patch_ai(monkeypatch, lambda **kw: {"text": "summary v2"})
        _msg(db, chat_id=1, sender_id=10, content="c", minutes=10)
        _msg(db, chat_id=1, sender_id=20, content="d", minutes=11)
        client_memory.merge_session(db, 1)

        rows = db.query(ClientMemorySummary).all()
        assert len(rows) == 1, "exactly one summary per (client, psychic)"
        assert rows[0].summary == "summary v2"
        assert client_memory._aware(rows[0].covers_through) == BASE + timedelta(minutes=11)

    def test_a_failed_model_call_does_not_advance_the_watermark(self, db, monkeypatch):
        """Otherwise the messages it failed on would never be summarised."""
        _chat(db)
        _msg(db, chat_id=1, sender_id=10, content="a", minutes=0)
        _msg(db, chat_id=1, sender_id=20, content="b", minutes=1)

        def boom(**kwargs):
            raise RuntimeError("provider down")

        _patch_ai(monkeypatch, boom)
        assert client_memory.merge_session(db, 1) is None
        row = client_memory.get_or_create_record(db, 10, 20)
        assert row.covers_through is None
        assert row.summary is None

    def test_a_session_too_short_is_skipped_without_calling_the_model(self, db, monkeypatch):
        _chat(db)
        _msg(db, chat_id=1, sender_id=10, content="just one line", minutes=0)
        calls = []
        _patch_ai(monkeypatch, lambda **kw: calls.append(1) or {"text": "x"})
        assert client_memory.merge_session(db, 1) is None
        assert calls == []


class TestPurge:
    def test_purge_clears_the_summary_and_stamps_a_floor(self, db, monkeypatch):
        _chat(db)
        _patch_ai(monkeypatch, lambda **kw: {"text": "remembered things"})
        _msg(db, chat_id=1, sender_id=10, content="a", minutes=0)
        _msg(db, chat_id=1, sender_id=20, content="b", minutes=1)
        client_memory.merge_session(db, 1)

        report = client_memory.purge_client_memory(db, 10)
        assert report["summaries_cleared"] == 1
        assert report["notes_deleted"] == 1

        row = client_memory.get_or_create_record(db, 10, 20)
        assert row.summary is None
        assert row.cleared_at is not None
        assert client_memory.resume_point(row) == client_memory._aware(row.cleared_at)

    def test_the_next_session_does_not_resurrect_pre_deletion_history(self, db, monkeypatch):
        """The regression the whole design exists to prevent."""
        _chat(db)
        _patch_ai(monkeypatch, lambda **kw: {"text": "she discussed a SECRET affair"})
        _msg(db, chat_id=1, sender_id=10, content="SECRET affair detail", minutes=0)
        _msg(db, chat_id=1, sender_id=20, content="reader replies", minutes=1)
        client_memory.merge_session(db, 1)

        client_memory.purge_client_memory(db, 10)

        seen = {}

        def capture(**kwargs):
            seen.update(kwargs)
            return {"text": "fresh summary"}

        _patch_ai(monkeypatch, capture)
        # The purge floor is a real wall-clock instant, so the "next session"
        # messages have to actually follow it — which is the behaviour under test.
        after = datetime.now(timezone.utc) + timedelta(minutes=1)
        _msg_at(db, chat_id=1, sender_id=10, content="a brand new topic", when=after)
        _msg_at(db, chat_id=1, sender_id=20, content="reader replies again", when=after + timedelta(minutes=1))
        client_memory.merge_session(db, 1)

        assert "SECRET affair detail" not in seen["user_content"]
        assert "she discussed a SECRET affair" not in seen["user_content"]
        assert "a brand new topic" in seen["user_content"]

    def test_purge_evicts_cached_reading_state(self, db, monkeypatch):
        """SessionStore.delete was dead code; without it the persisted state
        rehydrates the pre-deletion transcript into the next prompt."""
        _chat(db)
        evicted = []

        class FakeStore:
            def delete(self, session_id):
                evicted.append(session_id)

        monkeypatch.setattr(
            "app.services.ai.reading_session.get_session_store", lambda: FakeStore()
        )
        report = client_memory.purge_client_memory(db, 10)
        assert evicted == ["chat:1"]
        assert report["reading_sessions_evicted"] == 1


def _patch_ai(monkeypatch, run_chat):
    """Point the merge at a fake model. Nothing here spends a cent."""
    import app.services.ai.client as ai_client

    monkeypatch.setattr(ai_client, "is_configured", lambda: True)
    monkeypatch.setattr(ai_client, "run_chat", run_chat)

    from app.config import get_app_settings

    settings = get_app_settings()
    monkeypatch.setattr(settings, "AI_DRAFTING_ENABLED", True, raising=False)
