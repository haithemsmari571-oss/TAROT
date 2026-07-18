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


# ── generating signal + manual "Generate new reply" ──────────────────────────
def test_is_generating_reflects_inflight_task(monkeypatch):
    factory = _mem_db(monkeypatch)
    _seed_chat(factory, 7309, ResponseMode.HYBRID)
    get_session_store().delete("chat:7309")
    _hybrid_env(monkeypatch)
    import time as _time

    monkeypatch.setattr(
        reading_valentina, "write_valentina",
        lambda inp, client_message=None: (_time.sleep(0.3), "SLOW DRAFT")[1],
    )
    with factory() as dbs:
        chat = dbs.query(Chat).filter(Chat.id == 7309).first()

    async def scenario():
        assert reading_hybrid.is_generating(7309) is False
        assert reading_hybrid.maybe_launch_hybrid(7309, 1, "will he text me?", chat) is True
        during = reading_hybrid.is_generating(7309)   # in-flight -> the indicator shows
        for task in list(reading_hybrid._tasks.get(7309, set())):
            await task
        after = reading_hybrid.is_generating(7309)    # finished -> the indicator clears
        return during, after

    during, after = asyncio.run(scenario())
    assert during is True
    assert after is False


def test_is_generating_covers_automatic_mode_turns():
    # The SAME signal drives the "writing…" indicator and the persona halos: it must
    # also see an in-flight automatic (two_role) turn, not only hybrid draft tasks.
    assert reading_hybrid.is_generating(7399) is False
    reading_duo._active[7399] = True
    try:
        assert reading_hybrid.is_generating(7399) is True
    finally:
        reading_duo._active.pop(7399, None)
    assert reading_hybrid.is_generating(7399) is False


def test_regen_creates_new_draft_without_rerecording_transcript(monkeypatch):
    factory = _mem_db(monkeypatch)
    _seed_chat(factory, 7310, ResponseMode.HYBRID)
    get_session_store().delete("chat:7310")
    _hybrid_env(monkeypatch)
    with factory() as dbs:
        chat = dbs.query(Chat).filter(Chat.id == 7310).first()

    async def scenario():
        # automatic turn: records the client message + drafts
        assert reading_hybrid.maybe_launch_hybrid(7310, 41, "is he coming back?", chat) is True
        for task in list(reading_hybrid._tasks.get(7310, set())):
            await task
        # manual regen against the SAME latest message: drafts again, records NOTHING new
        assert reading_hybrid.launch_hybrid_regen(7310, 41, "is he coming back?", chat) is True
        for task in list(reading_hybrid._tasks.get(7310, set())):
            await task

    asyncio.run(scenario())
    with factory() as dbs:
        drafts = dbs.query(AiDraft).filter(AiDraft.chat_id == 7310).all()
    assert len(drafts) == 2                       # a fresh PENDING draft per run
    assert all(d.status == AiDraftStatus.PENDING for d in drafts)
    state = get_session_store().get("chat:7310")
    client_entries = [e for e in state.chat_transcript if e.get("role") == "client"]
    assert len(client_entries) == 1               # the regen did NOT duplicate the message


def test_regen_refuses_non_hybrid_chat(monkeypatch):
    factory = _mem_db(monkeypatch)
    _seed_chat(factory, 7311, ResponseMode.SABRI)
    _hybrid_env(monkeypatch)
    with factory() as dbs:
        chat = dbs.query(Chat).filter(Chat.id == 7311).first()

    async def scenario():
        return reading_hybrid.launch_hybrid_regen(7311, 1, "hello?", chat)

    assert asyncio.run(scenario()) is False


def _seed_endpoint_chat(db, make_user, mode, with_message=True):
    from app.models.message import Message

    admin = make_user(role=Role.ADMIN)
    client = make_user()
    psychic = make_user()
    chat = Chat(user_id=client.id, psychic_id=psychic.id, status=ChatStatus.ACTIVE,
                response_mode=mode)
    db.add(chat)
    db.commit()
    db.refresh(chat)
    if with_message:
        db.add(Message(chat_id=chat.id, sender_id=client.id, content="is he coming back?"))
        db.commit()
    return admin, chat


def test_generate_endpoint_launches_regen_for_hybrid(db, make_user, monkeypatch):
    import json as _json

    from app.routers.reading_ai import generate_draft

    admin, chat = _seed_endpoint_chat(db, make_user, ResponseMode.HYBRID)
    calls = []
    monkeypatch.setattr(reading_hybrid, "is_generating", lambda cid: False)
    monkeypatch.setattr(
        reading_hybrid, "launch_hybrid_regen",
        lambda cid, mid, content, c: calls.append((cid, content)) or True,
    )
    resp = asyncio.run(generate_draft(chat.id, user=admin, db=db))
    assert resp.status_code == 202
    assert _json.loads(resp.body)["status"] == "generating"
    assert calls == [(chat.id, "is he coming back?")]  # the client's latest message


def test_generate_endpoint_rejects_non_hybrid(db, make_user, monkeypatch):
    from app.routers.reading_ai import generate_draft

    admin, chat = _seed_endpoint_chat(db, make_user, ResponseMode.SABRI)
    resp = asyncio.run(generate_draft(chat.id, user=admin, db=db))
    assert resp.status_code == 409


def test_generate_endpoint_rejects_when_already_generating(db, make_user, monkeypatch):
    from app.routers.reading_ai import generate_draft

    admin, chat = _seed_endpoint_chat(db, make_user, ResponseMode.HYBRID)
    monkeypatch.setattr(reading_hybrid, "is_generating", lambda cid: True)
    resp = asyncio.run(generate_draft(chat.id, user=admin, db=db))
    assert resp.status_code == 409


def test_generate_endpoint_400_without_client_message(db, make_user, monkeypatch):
    from app.routers.reading_ai import generate_draft

    admin, chat = _seed_endpoint_chat(db, make_user, ResponseMode.HYBRID, with_message=False)
    monkeypatch.setattr(reading_hybrid, "is_generating", lambda cid: False)
    resp = asyncio.run(generate_draft(chat.id, user=admin, db=db))
    assert resp.status_code == 400


def test_generating_endpoint_reports_flag(db, make_user, monkeypatch):
    import json as _json

    from app.routers.reading_ai import get_draft_generating

    admin, chat = _seed_endpoint_chat(db, make_user, ResponseMode.HYBRID)
    monkeypatch.setattr("app.services.ai.reading_hybrid.is_generating", lambda cid: True)
    resp = get_draft_generating(chat.id, user=admin, db=db)
    assert resp.status_code == 200
    assert _json.loads(resp.body) == {"chat_id": chat.id, "generating": True}


# ── switching TO Automatic takes over the conversation now ───────────────────
def test_handover_cancels_hybrid_and_launches_auto_for_unanswered(db, make_user, monkeypatch):
    # The silent-draft race from live testing: a client message arrives, the hybrid turn
    # claims it, the operator switches to Automatic 2s later — the turn must be CANCELLED
    # and the unanswered message handed to the real auto pipeline.
    admin, chat = _seed_endpoint_chat(db, make_user, ResponseMode.HYBRID)  # last msg = client's
    launched = []
    monkeypatch.setattr(
        "app.services.ai.reading_pipeline.maybe_launch_pipeline",
        lambda cid, mid, content: launched.append((cid, content)),
    )

    async def scenario():
        async def stuck_hybrid_generation():
            await asyncio.sleep(60)

        task = asyncio.create_task(stuck_hybrid_generation())
        reading_hybrid._tasks.setdefault(chat.id, set()).add(task)
        await reading_hybrid.handover_to_auto(chat.id, db, chat)
        return task

    task = asyncio.run(scenario())
    assert task.cancelled()                              # no more silent PENDING draft
    assert launched == [(chat.id, "is he coming back?")]  # the hanging message is auto-answered


def test_handover_skips_launch_when_reader_answered_last(db, make_user, monkeypatch):
    from app.models.message import Message

    admin, chat = _seed_endpoint_chat(db, make_user, ResponseMode.HYBRID)
    db.add(Message(chat_id=chat.id, sender_id=chat.psychic_id, content="he is circling back"))
    db.commit()  # last message is now the READER's — nothing is hanging
    launched = []
    monkeypatch.setattr(
        "app.services.ai.reading_pipeline.maybe_launch_pipeline",
        lambda cid, mid, content: launched.append(cid),
    )
    asyncio.run(reading_hybrid.handover_to_auto(chat.id, db, chat))
    assert launched == []  # no false auto-reply to an already-answered conversation


def test_mode_switch_to_sabri_triggers_handover(db, make_user, monkeypatch):
    from app.routers.reading_ai import set_response_mode
    from app.schemas.reading_ai import ResponseModeUpdate

    admin, chat = _seed_endpoint_chat(db, make_user, ResponseMode.HYBRID)
    calls = []

    async def spy(cid, dbs, c):
        calls.append(cid)

    monkeypatch.setattr(reading_hybrid, "handover_to_auto", spy)
    resp = asyncio.run(set_response_mode(chat.id, ResponseModeUpdate(mode=ResponseMode.SABRI),
                                         user=admin, db=db))
    assert resp.status_code == 200
    assert calls == [chat.id]                 # switch TO Automatic hands the chat over
    resp = asyncio.run(set_response_mode(chat.id, ResponseModeUpdate(mode=ResponseMode.HUMAN),
                                         user=admin, db=db))
    assert resp.status_code == 200
    assert calls == [chat.id]                 # switch to HUMAN does NOT


# ── operator typing indicator bridge ─────────────────────────────────────────
def test_typing_endpoint_broadcasts_reader_typing(db, make_user, monkeypatch):
    from app.routers.reading_ai import set_reader_typing
    from app.schemas.reading_ai import TypingUpdate
    from app.services.ai import reading_executor

    admin, chat = _seed_endpoint_chat(db, make_user, ResponseMode.HYBRID)
    sent = []

    async def spy(cid, on, sender):
        sent.append((cid, on, sender))

    monkeypatch.setattr(reading_executor, "broadcast_typing", spy)
    resp = asyncio.run(set_reader_typing(chat.id, TypingUpdate(typing=True), user=admin, db=db))
    assert resp.status_code == 200
    resp = asyncio.run(set_reader_typing(chat.id, TypingUpdate(typing=False), user=admin, db=db))
    assert resp.status_code == 200
    assert sent == [(chat.id, True, chat.psychic_id), (chat.id, False, chat.psychic_id)]


def test_typing_endpoint_forbids_the_client(db, make_user, monkeypatch):
    from app.models.user import User as _User
    from app.routers.reading_ai import set_reader_typing
    from app.schemas.reading_ai import TypingUpdate

    _admin, chat = _seed_endpoint_chat(db, make_user, ResponseMode.HYBRID)
    client_user = db.query(_User).filter(_User.id == chat.user_id).first()
    resp = asyncio.run(set_reader_typing(chat.id, TypingUpdate(typing=True),
                                         user=client_user, db=db))
    assert resp.status_code == 403  # the client must never drive the reader's indicator


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
