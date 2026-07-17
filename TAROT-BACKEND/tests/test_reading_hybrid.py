"""HYBRID producer + mode-switch cancellation.

  * A HYBRID (two_role) turn: Sabri is skipped outright, Valentina's raw draft lands in
    ai_drafts as PENDING, and NOTHING is broadcast/auto-sent by the pipeline.
  * A SABRI chat is completely unaffected (the interception returns False and the normal
    auto pipeline is launched exactly as before).
  * HYBRID under single_agent stays a deliberate gap (returns False -> behaves as today).
  * Switching a chat away from SABRI cancels an in-flight turn AND a queued redirect via
    the engines' existing cancel primitives; switching TO SABRI cancels nothing.
No real model calls; Valentina's writer is stubbed."""

import asyncio

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 — registers every model on Base.metadata
from app.enums.ai_draft_status import AiDraftStatus
from app.enums.chat_status import ChatStatus
from app.enums.response_mode import ResponseMode
from app.enums.role import Role
from app.models.ai_draft import AiDraft
from app.models.base import Base
from app.models.chat import Chat
from app.services.ai import (
    reading_assistant,
    reading_duo,
    reading_hybrid,
    reading_valentina,
)
from app.services.ai.reading_session import get_session_store


def _mem_db(monkeypatch):
    """In-memory DB with the full schema, installed as app.database.client.SessionLocal."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr("app.database.client.SessionLocal", factory)
    return factory


def _seed_chat(factory, chat_id, mode):
    with factory() as db:
        db.add(Chat(id=chat_id, user_id=1, psychic_id=2, status=ChatStatus.ACTIVE,
                    response_mode=mode))
        db.commit()


def _hybrid_env(monkeypatch, draft_text="VALENTINA RAW DRAFT — he's not gone..."):
    """two_role engine, AI on/configured, Valentina stubbed, broadcast/Sabri spied."""
    from app.config import get_app_settings
    from app.services.ai import client as ai_client

    s = get_app_settings()
    monkeypatch.setattr(s, "READING_ENGINE", "two_role")
    monkeypatch.setattr(s, "AI_DRAFTING_ENABLED", True)
    monkeypatch.setattr(ai_client, "is_configured", lambda: True)
    monkeypatch.setattr(reading_assistant, "build_client_file", lambda db, uid: "DOSSIER")
    monkeypatch.setattr("app.services.client_dossier.get_client_dob", lambda db, uid: None)
    monkeypatch.setattr(
        reading_valentina, "write_valentina",
        lambda inp, client_message=None: draft_text,
    )
    calls = {"broadcast": [], "sabri": []}
    async def _no_broadcast(*a, **k):
        calls["broadcast"].append(a)
    monkeypatch.setattr("app.services.chats.broadcast_ai_message", _no_broadcast)
    monkeypatch.setattr(
        "app.services.ai.reading_sabri.sabri_deliver",
        lambda *a, **k: calls["sabri"].append(a) or (["x"], ""),
    )
    return calls


async def _run_handled_turn(chat_id, client_message_id, message, chat):
    handled = reading_hybrid.maybe_launch_hybrid(chat_id, client_message_id, message, chat)
    for task in list(reading_hybrid._tasks.get(chat_id, set())):
        await task
    return handled


# ── the HYBRID producer ──────────────────────────────────────────────────────
def test_hybrid_turn_writes_pending_draft_never_broadcasts_never_calls_sabri(monkeypatch):
    factory = _mem_db(monkeypatch)
    _seed_chat(factory, 7301, ResponseMode.HYBRID)
    get_session_store().delete("chat:7301")
    calls = _hybrid_env(monkeypatch)

    with factory() as db:
        chat = db.query(Chat).filter(Chat.id == 7301).first()
    handled = asyncio.run(_run_handled_turn(7301, 555, "will he come back?", chat))

    assert handled is True  # the auto pipeline must NOT be launched for this message
    with factory() as db:
        drafts = db.query(AiDraft).filter(AiDraft.chat_id == 7301).all()
    assert len(drafts) == 1
    d = drafts[0]
    assert d.status == AiDraftStatus.PENDING
    assert d.mode == ResponseMode.HYBRID
    assert d.draft_text.startswith("VALENTINA RAW DRAFT")   # Valentina's RAW draft, un-Sabri'd
    assert d.client_message_id == 555
    assert d.sabri_passed is False
    assert calls["sabri"] == []       # Sabri disabled outright — never invoked
    assert calls["broadcast"] == []   # nothing auto-sent by the pipeline


def test_hybrid_empty_valentina_stores_nothing_and_sends_nothing(monkeypatch):
    factory = _mem_db(monkeypatch)
    _seed_chat(factory, 7302, ResponseMode.HYBRID)
    get_session_store().delete("chat:7302")
    calls = _hybrid_env(monkeypatch, draft_text="   ")

    with factory() as db:
        chat = db.query(Chat).filter(Chat.id == 7302).first()
    handled = asyncio.run(_run_handled_turn(7302, None, "hello?", chat))

    assert handled is True
    with factory() as db:
        assert db.query(AiDraft).filter(AiDraft.chat_id == 7302).count() == 0
    assert calls["broadcast"] == []   # no fallback send — HYBRID never auto-sends


# ── SABRI (the live default) is completely unaffected ────────────────────────
def test_sabri_chat_is_not_intercepted(monkeypatch):
    factory = _mem_db(monkeypatch)
    _seed_chat(factory, 7303, ResponseMode.SABRI)
    _hybrid_env(monkeypatch)
    with factory() as db:
        chat = db.query(Chat).filter(Chat.id == 7303).first()

    async def scenario():
        return reading_hybrid.maybe_launch_hybrid(7303, 1, "hi", chat)

    assert asyncio.run(scenario()) is False        # falls through to the normal pipeline
    assert not reading_hybrid._tasks.get(7303)     # and nothing was launched here
    with factory() as db:
        assert db.query(AiDraft).count() == 0


def test_human_chat_is_not_intercepted(monkeypatch):
    factory = _mem_db(monkeypatch)
    _seed_chat(factory, 7304, ResponseMode.HUMAN)
    _hybrid_env(monkeypatch)
    with factory() as db:
        chat = db.query(Chat).filter(Chat.id == 7304).first()

    async def scenario():
        return reading_hybrid.maybe_launch_hybrid(7304, 1, "hi", chat)

    assert asyncio.run(scenario()) is False  # pipeline's own HUMAN gate handles it, as before


def test_hybrid_under_single_agent_engine_is_deliberate_gap(monkeypatch):
    factory = _mem_db(monkeypatch)
    _seed_chat(factory, 7305, ResponseMode.HYBRID)
    _hybrid_env(monkeypatch)
    from app.config import get_app_settings

    monkeypatch.setattr(get_app_settings(), "READING_ENGINE", "single_agent")
    with factory() as db:
        chat = db.query(Chat).filter(Chat.id == 7305).first()

    async def scenario():
        return reading_hybrid.maybe_launch_hybrid(7305, 1, "hi", chat)

    assert asyncio.run(scenario()) is False  # single_agent HYBRID: unchanged (behaves as SABRI)


# ── mode-switch cancellation ─────────────────────────────────────────────────
def test_switch_away_from_sabri_cancels_inflight_and_queued_turn():
    async def scenario():
        started = asyncio.Event()

        async def fake_turn():
            started.set()
            await asyncio.sleep(60)  # would keep delivering long after the switch

        task = asyncio.create_task(fake_turn())
        reading_duo._turn_tasks[7306] = task
        reading_duo._active[7306] = True
        reading_duo._pending[7306] = ("queued redirect message", None)  # would run as a FULL extra turn
        await started.wait()

        await reading_hybrid.cancel_ai_turns_for_mode_change(7306, ResponseMode.HUMAN)
        return task

    task = asyncio.run(scenario())
    assert task.cancelled()                          # the in-flight turn was actually cancelled
    assert 7306 not in reading_duo._pending          # the queued redirect will NEVER run
    assert not reading_duo._active.get(7306)
    assert 7306 not in reading_duo._turn_tasks


def test_switch_to_sabri_cancels_nothing():
    async def scenario():
        async def fake_turn():
            await asyncio.sleep(60)

        task = asyncio.create_task(fake_turn())
        reading_duo._turn_tasks[7307] = task
        await reading_hybrid.cancel_ai_turns_for_mode_change(7307, ResponseMode.SABRI)
        alive = not task.done()
        task.cancel()  # cleanup
        try:
            await task
        except asyncio.CancelledError:
            pass
        reading_duo._turn_tasks.pop(7307, None)
        return alive

    assert asyncio.run(scenario()) is True  # switching TO full-auto interrupts nothing


def test_endpoint_commits_mode_then_cancels(db, make_user, monkeypatch):
    from app.routers.reading_ai import set_response_mode
    from app.schemas.reading_ai import ResponseModeUpdate

    admin = make_user(role=Role.ADMIN)
    client = make_user()
    psychic = make_user()
    chat = Chat(user_id=client.id, psychic_id=psychic.id, status=ChatStatus.ACTIVE,
                response_mode=ResponseMode.SABRI)
    db.add(chat)
    db.commit()
    db.refresh(chat)

    cancelled = []

    async def spy(chat_id, new_mode):
        cancelled.append((chat_id, new_mode))

    monkeypatch.setattr(reading_hybrid, "cancel_ai_turns_for_mode_change", spy)

    resp = asyncio.run(
        set_response_mode(chat.id, ResponseModeUpdate(mode=ResponseMode.HUMAN),
                          user=admin, db=db)
    )
    assert resp.status_code == 200
    db.refresh(chat)
    assert chat.response_mode == ResponseMode.HUMAN       # committed
    assert cancelled == [(chat.id, ResponseMode.HUMAN)]   # then the cancel hook fired
