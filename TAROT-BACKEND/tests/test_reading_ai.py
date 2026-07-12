"""End-to-end tests for the AI reading pipeline (Valentina / Sabri / Atlas).

The model calls are stubbed, so these exercise the real pipeline LOGIC — mode
routing, the Sabri redraft loop (pass / fail / fallback), auto-send tagging,
Atlas summarisation, and the master switch — deterministically and offline.
"""

import asyncio

import pytest

from app.enums.ai_draft_status import AiDraftStatus
from app.enums.author_type import AuthorType
from app.enums.chat_status import ChatStatus
from app.enums.note_source import NoteSource
from app.enums.response_mode import ResponseMode
from app.enums.role import Role
from app.models import AiDraft, Chat, ClientNote, Message, User
from app.services.ai.reading_pipeline import run_pipeline_core
from app.services.chats import persist_ai_message


# ── helpers ──────────────────────────────────────────────────────────────────
def _make_chat(db, make_user, mode=ResponseMode.SABRI, status=ChatStatus.ACTIVE):
    client = make_user(balance=100, role=Role.USER)
    psychic = make_user(role=Role.PSYCHIC)
    chat = Chat(
        user_id=client.id,
        psychic_id=psychic.id,
        status=status,
        response_mode=mode,
    )
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return chat, client, psychic


def _add_message(db, chat, sender_id, content, is_system=False):
    m = Message(chat_id=chat.id, sender_id=sender_id, content=content, is_system=is_system)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


# ── schema defaults / backfill semantics ─────────────────────────────────────
def test_schema_defaults(db, make_user):
    chat, client, psychic = _make_chat(db, make_user)
    # response_mode defaults to SABRI
    assert chat.response_mode == ResponseMode.SABRI
    # a plain message defaults to HUMAN_PSYCHIC (the backfill value)
    m = _add_message(db, chat, client.id, "hello")
    assert m.author_type == AuthorType.HUMAN_PSYCHIC
    # a dossier note defaults to HUMAN
    note = ClientNote(client_id=client.id, note="human note")
    db.add(note)
    db.commit()
    db.refresh(note)
    assert note.source == NoteSource.HUMAN


def test_persist_ai_message_tags_ai_drafted(db, make_user):
    chat, client, psychic = _make_chat(db, make_user)
    msg = persist_ai_message(db, chat, "a drafted reply")
    assert msg.author_type == AuthorType.AI_DRAFTED
    assert msg.sender_id == psychic.id  # delivered as the reader
    assert msg.content == "a drafted reply"


# ── the core loop: SABRI mode ────────────────────────────────────────────────
def test_sabri_clean_pass_auto_sends(db, make_user):
    chat, client, psychic = _make_chat(db, make_user, mode=ResponseMode.SABRI)
    result = run_pipeline_core(
        db, chat, None, "will he call?",
        mode=ResponseMode.SABRI,
        draft_fn=lambda feedback: "warm reflective reply",
        check_fn=lambda draft: {"passed": True, "flags": [], "reason": "ok"},
        max_attempts=3,
    )
    assert result["outcome"] == "auto_send"
    assert result["content"] == "warm reflective reply"
    assert result["attempts"] == 1
    # no draft persisted for review on a clean auto-send
    assert db.query(AiDraft).count() == 0


def test_sabri_fail_then_pass_redrafts_and_sends(db, make_user):
    chat, client, psychic = _make_chat(db, make_user, mode=ResponseMode.SABRI)
    calls = []
    verdicts = iter([
        {"passed": False, "flags": ["overreaching claim"], "reason": "bad"},
        {"passed": True, "flags": [], "reason": "ok"},
    ])

    def draft_fn(feedback):
        calls.append(feedback)
        return f"draft attempt {len(calls)}"

    result = run_pipeline_core(
        db, chat, None, "message",
        mode=ResponseMode.SABRI,
        draft_fn=draft_fn,
        check_fn=lambda draft: next(verdicts),
        max_attempts=3,
    )
    assert result["outcome"] == "auto_send"
    assert result["attempts"] == 2
    # first attempt had no feedback, the redraft received Sabri's flags
    assert calls[0] is None
    assert calls[1]["flags"] == ["overreaching claim"]
    assert calls[1]["previous_draft"] == "draft attempt 1"
    assert db.query(AiDraft).count() == 0


def test_sabri_all_fail_falls_back_to_review(db, make_user):
    chat, client, psychic = _make_chat(db, make_user, mode=ResponseMode.SABRI)
    n = {"i": 0}

    def draft_fn(feedback):
        n["i"] += 1
        return f"draft {n['i']}"

    result = run_pipeline_core(
        db, chat, None, "message",
        mode=ResponseMode.SABRI,
        draft_fn=draft_fn,
        check_fn=lambda draft: {"passed": False, "flags": ["still bad"], "reason": "no"},
        max_attempts=3,
    )
    assert result["outcome"] == "pending_review"
    assert result["attempts"] == 3  # exhausted the cap
    assert result["passed"] is False
    # a pending draft is created for manual review, never auto-sent
    drafts = db.query(AiDraft).all()
    assert len(drafts) == 1
    d = drafts[0]
    assert d.status == AiDraftStatus.PENDING
    assert d.sabri_passed is False
    assert d.attempts == 3
    assert d.draft_text == "draft 3"
    assert d.mode == ResponseMode.SABRI
    # no reader message was sent
    assert db.query(Message).filter(Message.author_type == AuthorType.AI_DRAFTED).count() == 0


# ── the core loop: HYBRID mode ───────────────────────────────────────────────
def test_hybrid_pass_still_goes_to_review(db, make_user):
    chat, client, psychic = _make_chat(db, make_user, mode=ResponseMode.HYBRID)
    result = run_pipeline_core(
        db, chat, None, "message",
        mode=ResponseMode.HYBRID,
        draft_fn=lambda feedback: "clean draft",
        check_fn=lambda draft: {"passed": True, "flags": [], "reason": "ok"},
        max_attempts=3,
    )
    # hybrid NEVER auto-sends, even on a clean pass
    assert result["outcome"] == "pending_review"
    assert result["attempts"] == 1
    d = db.query(AiDraft).one()
    assert d.status == AiDraftStatus.PENDING
    assert d.sabri_passed is True
    assert d.mode == ResponseMode.HYBRID
    assert db.query(Message).filter(Message.author_type == AuthorType.AI_DRAFTED).count() == 0


def test_hybrid_fail_goes_to_review_with_flags(db, make_user):
    chat, client, psychic = _make_chat(db, make_user, mode=ResponseMode.HYBRID)
    result = run_pipeline_core(
        db, chat, None, "message",
        mode=ResponseMode.HYBRID,
        draft_fn=lambda feedback: "flagged draft",
        check_fn=lambda draft: {"passed": False, "flags": ["tone off"], "reason": "no"},
        max_attempts=2,
    )
    assert result["outcome"] == "pending_review"
    assert result["attempts"] == 2
    assert result["flags"] == ["tone off"]


# ── the core loop: HUMAN mode ────────────────────────────────────────────────
def test_human_mode_is_skipped(db, make_user):
    chat, client, psychic = _make_chat(db, make_user, mode=ResponseMode.HUMAN)
    called = {"draft": 0}

    def draft_fn(feedback):
        called["draft"] += 1
        return "should not be called"

    result = run_pipeline_core(
        db, chat, None, "message",
        mode=ResponseMode.HUMAN,
        draft_fn=draft_fn,
        check_fn=lambda draft: {"passed": True, "flags": []},
        max_attempts=3,
    )
    assert result["outcome"] == "skipped"
    assert called["draft"] == 0
    assert db.query(AiDraft).count() == 0


# ── Atlas: dossier auto-summary at session end ───────────────────────────────
def test_atlas_summarises_and_appends_ai_note(db, make_user, monkeypatch):
    from app.services import client_dossier
    from app.services.ai import client as ai_client

    chat, client, psychic = _make_chat(db, make_user)
    # a pre-existing HUMAN note must be untouched by Atlas
    human = ClientNote(
        client_id=client.id, note="client is a Cancer, cares about her ex",
        source=NoteSource.HUMAN,
    )
    db.add(human)
    db.commit()

    _add_message(db, chat, client.id, "Will my ex come back?")
    _add_message(db, chat, psychic.id, "Let's look at what the cards reflect for you.")
    _add_message(db, chat, None, "System: session ended", is_system=True)

    monkeypatch.setattr(ai_client, "is_configured", lambda: True)
    monkeypatch.setattr(
        ai_client, "run_chat",
        lambda system, user_content, model, max_tokens=512: {
            "text": "She asked about her ex; explored her feelings. Hopeful tone.",
            "input_tokens": 10, "output_tokens": 10, "cost_usd": 0.0,
        },
    )

    note = client_dossier.run_atlas_summary(db, chat.id)
    assert note is not None
    assert note.source == NoteSource.AI_ATLAS
    assert note.author_psychic_id is None
    assert "ex" in note.note

    # the human note is still there and unchanged (Atlas appends, never overwrites)
    notes = db.query(ClientNote).filter(ClientNote.client_id == client.id).all()
    sources = {n.source for n in notes}
    assert NoteSource.HUMAN in sources and NoteSource.AI_ATLAS in sources
    assert human.note == "client is a Cancer, cares about her ex"

    # the AI note is tagged in the dossier payload the UI reads
    dossier = client_dossier.get_client_dossier(db, client.id)
    ai_notes = [n for n in dossier["notes"] if n["source"] == "AI_ATLAS"]
    assert ai_notes and ai_notes[0]["author_name"] == "Atlas (AI)"


def test_atlas_skips_short_sessions(db, make_user, monkeypatch):
    from app.services import client_dossier
    from app.services.ai import client as ai_client

    chat, client, psychic = _make_chat(db, make_user)
    _add_message(db, chat, client.id, "hi")  # only one message → too short
    monkeypatch.setattr(ai_client, "is_configured", lambda: True)
    monkeypatch.setattr(ai_client, "run_chat", lambda **k: {"text": "x"})

    assert client_dossier.run_atlas_summary(db, chat.id) is None
    assert db.query(ClientNote).count() == 0


# ── master switch ────────────────────────────────────────────────────────────
def test_master_switch_disables_atlas(db, make_user, monkeypatch):
    from app.services import client_dossier

    chat, client, psychic = _make_chat(db, make_user)
    _add_message(db, chat, client.id, "one")
    _add_message(db, chat, psychic.id, "two")

    class _Settings:
        AI_DRAFTING_ENABLED = False

    monkeypatch.setattr("app.config.get_app_settings", lambda: _Settings())
    assert client_dossier.run_atlas_summary(db, chat.id) is None
    assert db.query(ClientNote).count() == 0


def test_master_switch_disables_launcher(monkeypatch):
    from app.services.ai import reading_pipeline

    class _Settings:
        AI_DRAFTING_ENABLED = False

    monkeypatch.setattr(reading_pipeline, "get_app_settings", lambda: _Settings())
    created = {"task": False}
    monkeypatch.setattr(
        reading_pipeline.asyncio, "create_task",
        lambda coro: created.__setitem__("task", True),
    )
    reading_pipeline.maybe_launch_pipeline(1, 1, "hello")
    assert created["task"] is False


# ── async wrapper integration (SessionLocal + delivery glue) ─────────────────
def _seed_engine():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool

    import app.models  # noqa: F401 — register models on Base.metadata
    from app.models.base import Base

    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    Local = sessionmaker(bind=engine, expire_on_commit=False)
    s = Local()
    client = User(email="c@t.co", username="c", password_hash="h", role=Role.USER, balance=100, credit_balance=0)
    psychic = User(email="p@t.co", username="p", password_hash="h", role=Role.PSYCHIC)
    s.add_all([client, psychic])
    s.commit()
    chat = Chat(user_id=client.id, psychic_id=psychic.id, status=ChatStatus.ACTIVE)
    s.add(chat)
    s.commit()
    ids = (chat.id, psychic.id, client.id)
    s.close()
    return Local, ids


def _patch_ai(monkeypatch, Local, *, passed, draft="AI reply"):
    import app.database.client as dbclient
    from app.services.ai import client as ai_client
    from app.services.ai import reading_assistant, sabri_check

    monkeypatch.setattr(dbclient, "SessionLocal", Local)
    monkeypatch.setattr(ai_client, "is_configured", lambda: True)
    monkeypatch.setattr(
        reading_assistant, "generate_draft",
        lambda db, chat, text, feedback=None: draft,
    )
    monkeypatch.setattr(
        sabri_check, "check_draft",
        lambda db, chat, drafttext, text: {"passed": passed, "flags": [] if passed else ["bad"], "reason": ""},
    )

    sent = {}

    async def fake_broadcast(db, chat, content):
        sent["content"] = content
        return persist_ai_message(db, chat, content)

    monkeypatch.setattr("app.services.chats.broadcast_ai_message", fake_broadcast)
    return sent


def test_async_pipeline_sabri_autosend(monkeypatch):
    from app.services.ai.reading_pipeline import run_reading_pipeline

    Local, (chat_id, psychic_id, client_id) = _seed_engine()
    # default mode is SABRI
    sent = _patch_ai(monkeypatch, Local, passed=True, draft="AI reply text")

    result = asyncio.run(run_reading_pipeline(chat_id, None, "will he text me?"))
    assert result["outcome"] == "auto_send"
    assert sent["content"] == "AI reply text"

    s = Local()
    msgs = s.query(Message).filter(Message.author_type == AuthorType.AI_DRAFTED).all()
    assert len(msgs) == 1 and msgs[0].sender_id == psychic_id
    s.close()


def test_async_pipeline_hybrid_never_sends(monkeypatch):
    from app.services.ai.reading_pipeline import run_reading_pipeline

    Local, (chat_id, psychic_id, client_id) = _seed_engine()
    s = Local()
    s.query(Chat).filter(Chat.id == chat_id).update({"response_mode": ResponseMode.HYBRID})
    s.commit()
    s.close()

    sent = _patch_ai(monkeypatch, Local, passed=True, draft="hybrid draft")
    result = asyncio.run(run_reading_pipeline(chat_id, None, "hello"))
    assert result["outcome"] == "pending_review"
    assert "content" not in sent  # broadcast never called

    s = Local()
    assert s.query(AiDraft).filter(AiDraft.status == AiDraftStatus.PENDING).count() == 1
    assert s.query(Message).filter(Message.author_type == AuthorType.AI_DRAFTED).count() == 0
    s.close()
