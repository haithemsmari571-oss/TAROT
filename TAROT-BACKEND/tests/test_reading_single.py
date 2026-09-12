"""The one-call reader engine (per-message billing, step 4b).

The model is stubbed at the streaming helper the engine shares with Valentina,
everything else is real: the session store and draft log on the test database,
the capsule, the ledger, Sabri's sanitiser, the flow lock, reader-message
persistence, the room broadcast through the real ConnectionManager with a fake
socket, and the refund. BILLING_MODE is forced to per_message throughout; the
engine itself does not read it, the wiring step will.
"""

from __future__ import annotations

import asyncio
import json
import time
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 - registers every model on Base.metadata
from app.config import get_app_settings
from app.enums.author_type import AuthorType
from app.enums.chat_status import ChatStatus
from app.enums.role import Role
from app.enums.transaction_type import TransactionType
from app.models import Category, Chat, Message, PsychicCategory, Transaction, User
from app.models.base import Base
from app.models.reading_draft_attempt import ReadingDraftAttempt
from app.services.ai import reading_assistant, reading_burst, reading_single, registry
from app.services.ai import client as ai_client
from app.services.ai.reading_draft_log import DraftAttemptLog
from app.services.ai.reading_session import SessionStore
from app.services.transactions import create_debit_transaction

PRICE = 2.0


# ── fixtures ─────────────────────────────────────────────────────────────────
@pytest.fixture
def sqlite(monkeypatch):
    """An in-memory database that ALSO stands in for app.database.client.SessionLocal,
    because the engine opens its own sessions per step."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    Local = sessionmaker(bind=engine, expire_on_commit=False)
    from app.database import client as database_client

    monkeypatch.setattr(database_client, "SessionLocal", Local)
    db = Local()
    try:
        yield db, Local
    finally:
        db.close()
        engine.dispose()


class _Log:
    """Stands in for the engine's structlog logger and keeps every event."""

    def __init__(self):
        self.events = []

    def _record(self, level, event, **fields):
        self.events.append((level, event, fields))

    def debug(self, event, **fields):
        self._record("debug", event, **fields)

    def info(self, event, **fields):
        self._record("info", event, **fields)

    def warning(self, event, **fields):
        self._record("warning", event, **fields)

    def error(self, event, **fields):
        self._record("error", event, **fields)

    def find(self, event):
        return [fields for _level, name, fields in self.events if name == event]


class _FakeWebSocket:
    """Captures exactly what the room sends the client."""

    def __init__(self):
        self.sent = []

    async def send_json(self, payload):
        self.sent.append(payload)

    def messages(self):
        return [p for p in self.sent if p.get("type") == "message"]

    def typing(self):
        return [p["event"] for p in self.sent if "event" in p]


class _Model:
    """Stands in for ai_client.run_chat_stream, the helper write_valentina uses.

    Each entry of ``script`` is one call: a string is streamed back, an Exception
    is raised, and a (seconds, text) tuple blocks that long first, which is how a
    call times out."""

    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        step = self.script.pop(0)
        if isinstance(step, tuple):
            time.sleep(step[0])
            step = step[1]
        if isinstance(step, Exception):
            raise step
        return iter([step])


@pytest.fixture
def engine(sqlite, monkeypatch):
    """The engine wired to the test database with its side channels captured."""
    db, Local = sqlite
    settings = get_app_settings()
    monkeypatch.setattr(settings, "BILLING_MODE", "per_message")
    registry.seed_prompts(db)  # reading.single resolves from the registry, not the fallback

    store = SessionStore(session_factory=Local)
    draft_log = DraftAttemptLog(session_factory=Local)
    log = _Log()
    folds = []
    sleeps = []

    async def _atlas(state, user_id, psychic_id=None):
        state.atlas_memory_text = "ATLAS MEMORY TEXT"
        return state.atlas_memory_text

    async def _no_sleep(seconds):
        sleeps.append(seconds)

    monkeypatch.setattr(reading_single, "get_session_store", lambda: store)
    monkeypatch.setattr(reading_single, "get_draft_log", lambda: draft_log)
    monkeypatch.setattr(reading_single, "logger", log)
    monkeypatch.setattr(reading_single, "schedule_fold", lambda chat_id: folds.append(chat_id))
    monkeypatch.setattr(reading_single, "_atlas_memory", _atlas)
    monkeypatch.setattr(reading_single, "_sleep", _no_sleep)
    monkeypatch.setattr(reading_single, "_queues", {})
    monkeypatch.setattr(reading_single, "_workers", {})
    monkeypatch.setattr(reading_single, "_in_flight", {})
    monkeypatch.setattr(reading_burst, "_message_flow_locks", {})
    monkeypatch.setattr(
        reading_assistant, "build_client_file", lambda db, client_id: "CLIENT FILE TEXT"
    )
    return SimpleNamespace(
        db=db, Local=Local, store=store, draft_log=draft_log, log=log, folds=folds,
        sleeps=sleeps, settings=settings, monkeypatch=monkeypatch,
    )


def _model(engine, script):
    model = _Model(script)
    engine.monkeypatch.setattr(ai_client, "run_chat_stream", model)
    return model


def _people(db, *, balance=20.0, price=PRICE):
    client = User(
        email="client@test.co", username="client", password_hash="hash",
        balance=balance, role=Role.USER,
    )
    psychic = User(
        email="sophie@test.co", username="sophie", password_hash="hash",
        role=Role.PSYCHIC, price_per_message=price, bio="Love, loss and what comes next.",
    )
    category = Category(title="Love")
    db.add_all([client, psychic, category])
    db.commit()
    db.add(PsychicCategory(psychic_id=psychic.id, category_id=category.id))
    chat = Chat(user_id=client.id, psychic_id=psychic.id, status=ChatStatus.ACTIVE)
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return client, psychic, chat


def _room(engine, chat, client):
    from app.manager import manager

    ws = _FakeWebSocket()
    engine.monkeypatch.setitem(manager.active_chats, str(chat.id), [(ws, client.id)])
    return ws


def _paid_message(db, chat, client, text, price=PRICE):
    """A client message row and its per-message debit, as the charge writes them."""
    message = Message(chat_id=chat.id, sender_id=client.id, content=text)
    db.add(message)
    db.commit()
    db.refresh(message)
    create_debit_transaction(
        db=db, user_id=client.id, amount=price, description=f"Message #{message.id}",
        related_chat_id=chat.id, related_message_id=message.id,
        idempotency_key=f"msg_fee:{message.id}",
        metadata={"price_per_message": price, "psychic_id": chat.psychic_id}, commit=True,
    )
    return message


def _reader_messages(db, chat, psychic):
    db.expire_all()
    return (
        db.query(Message)
        .filter(Message.chat_id == chat.id, Message.sender_id == psychic.id)
        .order_by(Message.id.asc())
        .all()
    )


def _rows(db, kind, message_id=None):
    query = db.query(Transaction).filter(Transaction.transaction_type == kind)
    if message_id is not None:
        query = query.filter(Transaction.related_message_id == message_id)
    return query.all()


def _draft_rows(db):
    db.expire_all()
    return db.query(ReadingDraftAttempt).order_by(ReadingDraftAttempt.id.asc()).all()


async def _answer(chat_id, *message_ids):
    for message_id in message_ids:
        await reading_single.enqueue_reply(chat_id, message_id)
    await reading_single.wait_for_idle(chat_id)


THREE = (
    "u started timing the replies. the Tower came up for him and it is not about u\n\n"
    "they commit to things that don't look back at them\n\n"
    "there's a screenshot u go back to when u need proof this was real"
)


# ── 1. three paragraphs in, three reader messages out ────────────────────────
def test_three_paragraphs_become_three_reader_messages(engine):
    db = engine.db
    client, psychic, chat = _people(db)
    ws = _room(engine, chat, client)
    message = _paid_message(db, chat, client, "will he come back? we broke up in march")
    model = _model(engine, [THREE])

    asyncio.run(_answer(chat.id, message.id))

    expected = THREE.split("\n\n")
    rows = _reader_messages(db, chat, psychic)
    assert [r.content for r in rows] == expected
    assert all(r.author_type == AuthorType.AI_DRAFTED for r in rows)
    assert [p["content"] for p in ws.messages()] == expected
    assert [p["sender_id"] for p in ws.messages()] == [psychic.id] * 3
    assert ws.typing()[0] == "typing_start" and ws.typing()[-1] == "typing_stop"

    drafts = _draft_rows(db)
    assert [(d.stage, d.engine, d.attempt_number, d.is_delivered) for d in drafts] == [
        ("single_reply", "single", 1, True)
    ]
    assert drafts[0].raw_content == THREE

    state = engine.store.get(f"chat:{chat.id}")
    assert [e["content"] for e in state.chat_transcript if e["role"] == "logan"] == expected
    assert {"kind": "card", "value": "The Tower"} in [
        {"kind": e["kind"], "value": e["value"]} for e in state.commitment_ledger
    ]
    assert engine.folds == [chat.id]

    replies = engine.log.find("reading_single_reply")
    assert len(replies) == 1
    assert replies[0]["attempt"] == 1
    assert replies[0]["bubbles"] == 3
    assert replies[0]["chars"] == sum(len(b) for b in expected)
    assert replies[0]["thinking"] is True  # a question mark: substantive turn
    assert replies[0]["first_bubble_ms"] >= 0 and replies[0]["model_ms"] >= 0
    assert _rows(db, TransactionType.REVERSAL) == []
    assert len(model.calls) == 1


# ── 2. five paragraphs: exactly three go out ─────────────────────────────────
def test_extra_paragraphs_are_dropped_with_a_warning(engine):
    db = engine.db
    client, psychic, chat = _people(db)
    _room(engine, chat, client)
    message = _paid_message(db, chat, client, "ok")
    _model(engine, ["one line\n\ntwo line\n\nthree line\n\nfour line\n\nfive line"])

    asyncio.run(_answer(chat.id, message.id))

    assert [r.content for r in _reader_messages(db, chat, psychic)] == [
        "one line", "two line", "three line",
    ]
    capped = engine.log.find("reading_single_bubbles_capped")
    assert capped == [{"chat_id": chat.id, "message_id": message.id, "count": 5, "kept": 3}]
    assert engine.log.find("reading_single_reply")[0]["bubbles"] == 3


# ── 3. both attempts fail: refund and one honest line ────────────────────────
def test_two_failures_refund_the_message_and_say_so(engine):
    db = engine.db
    client, psychic, chat = _people(db)
    ws = _room(engine, chat, client)
    message = _paid_message(db, chat, client, "what do u see for me and him")
    balance_before = client.balance
    _model(engine, [RuntimeError("boom"), RuntimeError("boom again")])

    asyncio.run(_answer(chat.id, message.id))

    reversals = _rows(db, TransactionType.REVERSAL, message.id)
    assert len(reversals) == 1
    db.refresh(client)
    assert client.balance == balance_before + PRICE

    rows = _reader_messages(db, chat, psychic)
    assert [r.content for r in rows] == [reading_single.UNREACHABLE_NOTICE]
    assert [p["content"] for p in ws.messages()] == [reading_single.UNREACHABLE_NOTICE]

    failed = engine.log.find("reading_single_failed")
    assert failed == [{
        "chat_id": chat.id, "message_id": message.id,
        "reversal_id": reversals[0].id, "error": "RuntimeError: boom again",
    }]
    assert engine.log.find("reading_single_reply") == []

    drafts = _draft_rows(db)
    assert [(d.attempt_number, d.is_delivered, d.raw_content) for d in drafts] == [
        (1, False, "ERROR: RuntimeError: boom"),
        (2, False, "ERROR: RuntimeError: boom again"),
    ]
    assert json.loads(drafts[0].notes)["error"] == "RuntimeError: boom"


# ── 4. a timeout on attempt one, text on attempt two ─────────────────────────
def test_timeout_then_success_delivers_on_attempt_two(engine):
    db = engine.db
    client, psychic, chat = _people(db)
    _room(engine, chat, client)
    message = _paid_message(db, chat, client, "is he thinking about me")
    engine.monkeypatch.setattr(engine.settings, "SINGLE_CALL_TIMEOUT_S", 0.2)
    _model(engine, [(1.0, "too late to matter"), "he is, and he hates that he is"])

    asyncio.run(_answer(chat.id, message.id))

    assert [r.content for r in _reader_messages(db, chat, psychic)] == [
        "he is, and he hates that he is"
    ]
    replies = engine.log.find("reading_single_reply")
    assert len(replies) == 1 and replies[0]["attempt"] == 2
    assert _rows(db, TransactionType.REVERSAL) == []
    drafts = _draft_rows(db)
    assert [(d.attempt_number, d.is_delivered) for d in drafts] == [(1, False), (2, True)]
    assert drafts[0].raw_content.startswith("ERROR: timeout after")
    failed = engine.log.find("reading_single_attempt_failed")
    assert len(failed) == 1 and failed[0]["error"].startswith("timeout after")


# ── 5. two messages back to back: in order, and the second sees the first ────
def test_back_to_back_messages_are_answered_in_order(engine):
    db = engine.db
    client, psychic, chat = _people(db)
    ws = _room(engine, chat, client)
    first = _paid_message(db, chat, client, "hi, my ex is a leo and i cant stop checking")
    second = _paid_message(db, chat, client, "is he seeing someone")
    model = _model(engine, [
        "u check because the silence has a shape and u know it\n\nu know exactly how long",
        "not seeing. circling. there's a difference and u already feel it",
    ])

    asyncio.run(_answer(chat.id, first.id, second.id))

    rows = _reader_messages(db, chat, psychic)
    assert [r.content for r in rows] == [
        "u check because the silence has a shape and u know it",
        "u know exactly how long",
        "not seeing. circling. there's a difference and u already feel it",
    ]
    assert [p["content"] for p in ws.messages()] == [r.content for r in rows]
    assert [f["message_id"] for f in engine.log.find("reading_single_reply")] == [
        first.id, second.id,
    ]

    assert len(model.calls) == 2
    second_input = model.calls[1]["user_content"]
    assert "u check because the silence has a shape and u know it" in second_input
    assert "u know exactly how long" in second_input
    assert second_input.rstrip().endswith("is he seeing someone")
    first_input = model.calls[0]["user_content"]
    assert "is he seeing someone" not in first_input


# ── 6. the goodbye: unbilled, one bubble ─────────────────────────────────────
def test_say_goodbye_sends_one_unbilled_bubble(engine):
    db = engine.db
    client, psychic, chat = _people(db)
    ws = _room(engine, chat, client)
    _paid_message(db, chat, client, "thank u, i have to go")
    debits_before = len(_rows(db, TransactionType.DEBIT))
    model = _model(engine, ["go gently. that thread about the screenshot is still there when u want it\n\nand another"])

    asyncio.run(reading_single.say_goodbye(chat.id))

    assert reading_single.ENDED_NOTE in model.calls[0]["user_content"]
    assert reading_single.MARKED_MESSAGE_HEADER not in model.calls[0]["user_content"]
    assert [r.content for r in _reader_messages(db, chat, psychic)] == [
        "go gently. that thread about the screenshot is still there when u want it"
    ]
    assert len(ws.messages()) == 1
    assert len(_rows(db, TransactionType.DEBIT)) == debits_before
    assert _rows(db, TransactionType.REVERSAL) == []
    assert [d.stage for d in _draft_rows(db)] == ["single_goodbye"]
    assert len(engine.log.find("reading_single_goodbye")) == 1


# ── 7. what the prompt is handed ─────────────────────────────────────────────
def test_build_single_input_names_the_reader_and_marks_the_message(engine):
    db = engine.db
    client, psychic, chat = _people(db)
    first = _paid_message(db, chat, client, "hi, my name is Dana")
    reply = Message(chat_id=chat.id, sender_id=psychic.id, content="hi dana, tell me what happened")
    db.add(reply)
    db.commit()
    second = _paid_message(db, chat, client, "he left in march and came back twice")
    db.refresh(chat)

    text = reading_single.build_single_input(db, chat, answer_message_id=second.id)

    identity = text.split("\n\n")[0]
    assert identity.splitlines() == [
        "READER IDENTITY (you are this reader):",
        "Name: sophie",
        "Specialisms: Love",
        "Bio: Love, loss and what comes next.",
    ]
    assert "KNOWN NUMEROLOGY" in text
    assert "Client's gender: NOT STATED" in text
    assert "CLIENT FILE (load silently, never cite):\nCLIENT FILE TEXT" in text

    marker = text.index(reading_single.MARKED_MESSAGE_HEADER)
    assert text[marker:].rstrip().endswith("he left in march and came back twice")
    conversation = text.index("THE CONVERSATION RIGHT NOW")
    assert conversation < marker
    assert "client: hi, my name is Dana" in text
    assert "you: hi dana, tell me what happened" in text
    # The answered message appears once, in the marked block, never also as memory.
    assert text.count("he left in march and came back twice") == 1

    state = engine.store.get(f"chat:{chat.id}")
    assert [e.get("message_id") for e in state.chat_transcript] == [first.id, reply.id, second.id]
    assert state.chat_transcript[-1]["role"] == "client"
    assert {"kind": "name", "value": "Dana"} in [
        {"kind": e["kind"], "value": e["value"]} for e in state.commitment_ledger
    ]


# ── 8. a reserve marker and an em dash never reach the client ────────────────
def test_reserve_marker_and_em_dash_are_cleaned_and_logged(engine):
    db = engine.db
    client, psychic, chat = _people(db)
    ws = _room(engine, chat, client)
    message = _paid_message(db, chat, client, "ok")
    _model(engine, ["there's a screenshot u go back to — u know the one @@RESERVE@@\n\nand u still read it"])

    asyncio.run(_answer(chat.id, message.id))

    delivered = [r.content for r in _reader_messages(db, chat, psychic)]
    assert delivered == ["there's a screenshot u go back to, u know the one", "and u still read it"]
    assert all("—" not in d and "@@RESERVE@@" not in d for d in delivered)
    assert [p["content"] for p in ws.messages()] == delivered
    assert engine.log.find("reading_single_reserve_marker") == [
        {"chat_id": chat.id, "message_id": message.id, "count": 1}
    ]
    assert engine.log.find("reading_single_tells_sanitized") == [
        {"chat_id": chat.id, "message_id": message.id, "em_dash": 1}
    ]
    notes = json.loads(_draft_rows(db)[0].notes)
    assert notes == {"reserve_marker_stripped": 1, "sanitized": {"em_dash": 1}}


# ── 9. ending with two queued: both refunded, nothing sent ───────────────────
def test_drain_on_end_refunds_the_queued_and_unstarted(engine):
    db = engine.db
    client, psychic, chat = _people(db)
    _room(engine, chat, client)
    first = _paid_message(db, chat, client, "one")
    second = _paid_message(db, chat, client, "two")
    balance_before = client.balance
    model = _model(engine, [])  # any call would raise IndexError: none must happen

    async def _end_before_anything_starts():
        await reading_single.enqueue_reply(chat.id, first.id)
        await reading_single.enqueue_reply(chat.id, second.id)
        await reading_single.drain_on_end(chat.id)
        await reading_single.wait_for_idle(chat.id)

    asyncio.run(_end_before_anything_starts())

    assert len(_rows(db, TransactionType.REVERSAL, first.id)) == 1
    assert len(_rows(db, TransactionType.REVERSAL, second.id)) == 1
    db.refresh(client)
    assert client.balance == balance_before + 2 * PRICE
    assert not reading_single._queues.get(chat.id)
    assert _reader_messages(db, chat, psychic) == []
    assert model.calls == []
    drained = engine.log.find("reading_single_drained")
    assert drained[0]["queued"] == [first.id, second.id]
    assert [r["message_id"] for r in drained[0]["refunded"]] == [first.id, second.id]


# ── the hard cap, on its own ─────────────────────────────────────────────────
def test_hard_cap_trims_the_last_bubble_at_a_sentence_end():
    bubbles = ["a" * 400, "b" * 400, "first sentence here. second sentence here. third one."]
    kept, trimmed = reading_single._apply_hard_cap(bubbles, 850)
    assert kept[:2] == bubbles[:2]
    assert kept[2] == "first sentence here. second sentence here."
    assert sum(len(b) for b in kept) <= 850
    assert trimmed["total_before"] == 800 + len(bubbles[2]) == 853
    assert trimmed["bubbles_after"] == 3

    untouched, note = reading_single._apply_hard_cap(["short", "reply"], 900)
    assert untouched == ["short", "reply"] and note is None
