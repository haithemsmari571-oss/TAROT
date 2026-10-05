"""The owner's phone for per-message conversations (ROUND52).

The owner-only routes under /api/admin, the one server-side way to send as the
reader (owner_messaging.send_as_reader), Hybrid suggestions written by the
automatic reader's own generation and never sent, and the three double-reply
guards:

  a. an automatic reply re-reads the chat's mode before the call and before its
     first bubble; taken over by a person, nothing is sent and the written
     reply becomes the suggestion;
  b. a switch to Automatic closes what the reader's side has answered and
     answers the rest with ONE reply;
  c. a switch to Hybrid asks for a suggestion at once.

The journey harness (tests/test_per_message_journey.py) drives the real routes,
handler, charge, queue and engine on an in-memory database with the model
stubbed at the streaming helper; tests/test_refund_promise.py's `durable`
fixture makes the sweep readable on SQLite. Auth runs through the real
get_current_user and require_permission with real access tokens.
"""

from __future__ import annotations

import asyncio
import json
from datetime import timedelta
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event, or_

from app.database.client import get_db
from app.enums.ai_draft_status import AiDraftStatus
from app.enums.author_type import AuthorType
from app.enums.chat_status import ChatStatus
from app.enums.message_status import MessageStatus
from app.enums.response_mode import ResponseMode
from app.enums.role import Role
from app.enums.transaction_status import TransactionStatus
from app.enums.transaction_type import TransactionType
from app.models import Chat, Message, Transaction, User
from app.models.ai_draft import AiDraft
from app.routers import chats as chats_router
from app.routers import owner_messaging as owner_router
from app.routers import reading_ai as reading_ai_router
from app.services import offline_replies, owner_messaging
from app.services import session_manager as sm
from app.services.ai import client as ai_client
from app.services.ai import reading_single
from app.utils.security import create_access_token, decode_access_token
from tests.test_delete_account import _offline_hours
from tests.test_per_message_journey import (  # noqa: F401 - fixtures by name
    PRICE,
    _client_messages,
    _model,
    _naive_utc_now,
    _open_thread,
    _reader_messages,
    _rows,
    _send,
    journey,
    sqlite,
)
from tests.test_refund_promise import _age, _entry, _set_entry, durable  # noqa: F401

WINDOW = offline_replies.OFFLINE_REPLY_TIMEOUT


def _pending_state_as_text():
    """offline_replies.pending_state read as text, as tests/test_delete_account.py
    reads the sweep's selection: SQLite cannot evaluate the JSON path."""
    return or_(*[
        Transaction.transaction_metadata.like(f'%"state": "{state}"%')
        for state in offline_replies.PENDING_STATES
    ])


def _bearer(user):
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


@pytest.fixture
def owner(durable):
    """The durable journey with the owner routes, the chats router and the
    cockpit's reading router mounted under real auth, a SUPERADMIN and an ADMIN,
    and the two hooks recorded: notify_owner and request_suggestion."""
    mp = durable.monkeypatch
    mp.setattr(offline_replies, "pending_state", _pending_state_as_text)
    mp.setattr(owner_messaging, "SessionLocal", durable.Local)
    mp.setattr(reading_single, "_turn_covers", {})
    mp.setattr(reading_single, "_suggesters", {})
    mp.setattr(reading_single, "_suggest_wanted", set())
    notified = []
    mp.setattr(owner_messaging, "notify_owner", lambda chat_id, kind: notified.append((chat_id, kind)))
    suggestions = []
    real_request = reading_single.request_suggestion
    mp.setattr(
        reading_single, "request_suggestion",
        lambda chat_id, fresh=True: suggestions.append((chat_id, fresh)),
    )
    db = durable.db
    staff = {}
    for role in (Role.SUPERADMIN, Role.ADMIN):
        user = User(
            email=f"{role.value.lower()}@test.co", username=role.value.lower(),
            password_hash="hash", role=role, is_verified=True,
        )
        db.add(user)
        staff[role] = user
    db.commit()
    app = FastAPI()
    app.include_router(owner_router.router, prefix="/api/admin")
    app.include_router(chats_router.router, prefix="/api/chat")
    app.include_router(reading_ai_router.router, prefix="/api/chat")
    app.dependency_overrides[get_db] = lambda: db
    return SimpleNamespace(
        journey=durable, db=db, monkeypatch=mp, notified=notified, suggestions=suggestions,
        real_request=real_request, http=TestClient(app, raise_server_exceptions=False),
        superadmin=staff[Role.SUPERADMIN], admin=staff[Role.ADMIN],
    )


def _set_mode(o, chat_id, mode, user=None):
    return o.http.put(
        f"/api/admin/chats/{chat_id}/mode", json={"mode": mode},
        headers=_bearer(user or o.superadmin),
    )


def _switch_in_db(Local, chat_id, mode):
    """A mode switch committed from elsewhere (another request, mid-turn)."""
    with Local() as session:
        session.get(Chat, chat_id).response_mode = mode
        session.commit()


def _hybrid_thread(o):
    """A live conversation, its first question answered, switched to Hybrid
    through the owner's route, then one paid message sent in it."""
    db = o.db
    r = _open_thread(o.journey)
    _set_entry(db, r.hall.id, state="delivered", live=False, lease_until=None)
    assert _set_mode(o, r.chat.id, "hybrid").status_code == 200
    assert o.notified == [(r.chat.id, owner_messaging.CLIENT_MESSAGE)]  # /request's question
    o.suggestions.clear()
    o.notified.clear()
    _send(o.journey, r.chat, r.client, "are you still there?")
    message = _client_messages(db, r.chat, r.client)[-1]
    assert message.content == "are you still there?"
    return r, message


def _drafts(db, chat):
    db.expire_all()
    return db.query(AiDraft).filter(AiDraft.chat_id == chat.id).order_by(AiDraft.id).all()


def _reply_ids(db, r):
    return [m.id for m in _reader_messages(db, r.chat, r.psychic)]


async def _replay_claimed(o, chat_id, message_id, token):
    await o.journey.real_enqueue(chat_id, message_id, queue_token=token)
    await reading_single.wait_for_idle(chat_id)


def _replay_live(o, chat_id, message_id):
    async def run():
        await o.journey.real_enqueue(chat_id, message_id)
        await reading_single.wait_for_idle(chat_id)

    asyncio.run(run())


# ── who may call ─────────────────────────────────────────────────────────────
def _endpoints(chat_id):
    return [
        ("get", "/api/admin/inbox", None),
        ("get", f"/api/admin/chats/{chat_id}/thread", None),
        ("put", f"/api/admin/chats/{chat_id}/mode", {"mode": "hybrid"}),
        ("post", f"/api/admin/chats/{chat_id}/suggestion/send", {"content": "hello"}),
        ("post", f"/api/admin/chats/{chat_id}/suggestion/discard", None),
        ("post", f"/api/admin/chats/{chat_id}/suggestion/regenerate", None),
        ("put", f"/api/admin/chats/{chat_id}/typing", {"typing": True}),
    ]


def _call(o, method, path, body, headers=None):
    kwargs = {"json": body} if body is not None else {}
    return getattr(o.http, method)(path, headers=headers or {}, **kwargs)


def test_every_owner_route_refuses_anyone_but_the_superadmin(owner):
    r = _open_thread(owner.journey)
    callers = {"client": r.client, "psychic": r.psychic, "admin": owner.admin}
    for method, path, body in _endpoints(r.chat.id):
        anonymous = _call(owner, method, path, body)
        assert anonymous.status_code == 401, (path, anonymous.text)
        for name, user in callers.items():
            resp = _call(owner, method, path, body, _bearer(user))
            assert resp.status_code == 403, (name, path, resp.text)
    # Nothing moved: the chat is still Automatic and nobody wrote as the reader.
    owner.db.expire_all()
    assert owner.db.get(Chat, r.chat.id).response_mode == ResponseMode.SABRI
    assert _reply_ids(owner.db, r) == [r.opener.id]


def test_the_superadmin_is_let_through_every_owner_route(owner):
    r = _open_thread(owner.journey)
    for method, path, body in _endpoints(r.chat.id):
        resp = _call(owner, method, path, body, _bearer(owner.superadmin))
        assert resp.status_code not in (401, 403), (path, resp.text)


def test_the_owner_routes_answer_only_under_per_message_billing(owner):
    r = _open_thread(owner.journey)
    owner.monkeypatch.setattr(sm.settings, "BILLING_MODE", "per_minute")
    resp = owner.http.get("/api/admin/inbox", headers=_bearer(owner.superadmin))
    assert (resp.status_code, resp.json()["detail"]) == (409, "PER_MESSAGE_ONLY")
    resp = owner.http.get(f"/api/admin/chats/{r.chat.id}/thread", headers=_bearer(owner.superadmin))
    assert resp.status_code == 409


# ── function 2: send as the reader ───────────────────────────────────────────
def test_send_as_reader_stores_delivers_and_closes_the_refund_entry(owner):
    db = owner.db
    r, message = _hybrid_thread(owner)

    resp = owner.http.post(
        f"/api/admin/chats/{r.chat.id}/suggestion/send",
        json={"content": "  i'm here, give me a moment  "},
        headers=_bearer(owner.superadmin),
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["closed_as_answered"] == [message.id] and body["suggestion_id"] is None
    db.expire_all()
    reply = db.get(Message, body["message_id"])
    # Stored as the reader, by a person, as the reader's socket stores it.
    assert (reply.chat_id, reply.sender_id, reply.author_type, reply.content, reply.is_system) == (
        r.chat.id, r.psychic.id, AuthorType.HUMAN_PSYCHIC, "i'm here, give me a moment", False,
    )
    # Her room got the reader's message frame (she has the room open: seen),
    # then the reader's typing dots cleared.
    frames = [p for p in r.ws.messages() if p.get("id") == reply.id]
    assert len(frames) == 1
    assert (frames[0]["sender_id"], frames[0]["content"], frames[0]["status"]) == (
        r.psychic.id, reply.content, MessageStatus.READ.value,
    )
    assert r.ws.events("typing_stop")[-1]["sender_id"] == r.psychic.id
    # Her paid message is closed as answered in the same commit...
    entry = _entry(db, message.id)
    assert (entry["state"], entry["reply_ids"]) == ("delivered", [reply.id])
    # ...so the window refunds nothing.
    _age(db, message.id, WINDOW + timedelta(minutes=1))
    refunded = []
    offline_replies.sweep(refunded)
    assert refunded == [] and _rows(db, TransactionType.REVERSAL, message.id) == []
    # The reading memory has her message and the reply, in order, with ids.
    state = owner.journey.store.get(f"chat:{r.chat.id}")
    assert [e.get("message_id") for e in state.chat_transcript][-2:] == [message.id, reply.id]


def test_send_marks_the_current_suggestion_sent(owner):
    db = owner.db
    r, message = _hybrid_thread(owner)
    suggestion_id = owner_messaging.store_suggestion(r.chat.id, message.id, ["a", "b"], 1)

    resp = owner.http.post(
        f"/api/admin/chats/{r.chat.id}/suggestion/send",
        json={"content": "a, edited\n\nb"}, headers=_bearer(owner.superadmin),
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["suggestion_id"] == suggestion_id
    assert [(d.id, d.status) for d in _drafts(db, r.chat)] == [(suggestion_id, AiDraftStatus.SENT)]
    assert db.get(Message, resp.json()["message_id"]).content == "a, edited\n\nb"


def test_send_is_refused_in_an_automatic_chat_and_for_a_blank_reply(owner):
    r = _open_thread(owner.journey)
    resp = owner.http.post(
        f"/api/admin/chats/{r.chat.id}/suggestion/send", json={"content": "hello"},
        headers=_bearer(owner.superadmin),
    )
    assert (resp.status_code, resp.json()["detail"]) == (409, "CHAT_IS_AUTOMATIC")
    assert _set_mode(owner, r.chat.id, "hybrid").status_code == 200
    blank = owner.http.post(
        f"/api/admin/chats/{r.chat.id}/suggestion/send", json={"content": "   "},
        headers=_bearer(owner.superadmin),
    )
    assert blank.status_code == 422
    assert _reply_ids(owner.db, r) == [r.opener.id]


# ── Hybrid suggestions ───────────────────────────────────────────────────────
def test_a_hybrid_message_asks_for_a_suggestion_and_an_automatic_one_tells_the_owner(owner):
    r, _message = _hybrid_thread(owner)
    assert owner.suggestions == [(r.chat.id, True)]
    assert (r.chat.id, owner_messaging.CLIENT_MESSAGE) not in owner.notified

    assert _set_mode(owner, r.chat.id, "automatic").status_code == 200
    owner.suggestions.clear()
    _send(owner.journey, r.chat, r.client, "another, now automatic")
    assert owner.suggestions == []
    assert owner.notified[-1] == (r.chat.id, owner_messaging.CLIENT_MESSAGE)


def test_the_suggestion_is_the_automatic_readers_reply_stored_and_never_sent(owner):
    db = owner.db
    r, first = _hybrid_thread(owner)
    model = _model(owner.journey, ["i'm here\n\ntell me what changed"])
    frames_before = len(r.ws.sent)

    asyncio.run(reading_single._suggest_once(r.chat.id))

    [draft] = _drafts(db, r.chat)
    assert (draft.status, draft.mode, draft.client_message_id, draft.draft_text, draft.attempts) == (
        AiDraftStatus.PENDING, ResponseMode.HYBRID, first.id, "i'm here\n\ntell me what changed", 1,
    )
    # The same generation as an automatic reply: the reading.single input, with
    # her message marked as the one to answer.
    [call] = model.calls
    assert reading_single.MARKED_MESSAGE_HEADER + "\n" + first.content in call["user_content"]
    assert "READER IDENTITY" in call["user_content"]
    # Never sent and never shown: no reader message, no frame of any kind.
    assert _reply_ids(db, r) == [r.opener.id]
    assert len(r.ws.sent) == frames_before
    assert owner.notified[-1] == (r.chat.id, owner_messaging.SUGGESTION_READY)

    # She writes again: a fresh one answers both, and replaces the first.
    _send(owner.journey, r.chat, r.client, "and is he thinking of me")
    second = _client_messages(db, r.chat, r.client)[-1]
    model = _model(owner.journey, ["yes, both"])
    asyncio.run(reading_single._suggest_once(r.chat.id))
    old, new = _drafts(db, r.chat)
    assert (old.status, new.status, new.client_message_id) == (
        AiDraftStatus.DISCARDED, AiDraftStatus.PENDING, second.id,
    )
    marked = model.calls[0]["user_content"].split(reading_single.MARKED_MESSAGE_HEADER)[-1]
    assert first.content in marked and second.content in marked
    assert marked.index(first.content) < marked.index(second.content)


async def _suggester_done(chat_id):
    task = reading_single._suggesters.get(chat_id)
    if task is not None:
        await task


def test_request_suggestion_writes_one_and_a_handover_does_not_rewrite_a_current_one(owner):
    db = owner.db
    r, first = _hybrid_thread(owner)
    model = _model(owner.journey, ["first reply"])

    async def ask(fresh):
        owner.real_request(r.chat.id, fresh=fresh)
        await _suggester_done(r.chat.id)

    asyncio.run(ask(True))
    assert len(model.calls) == 1 and [d.status for d in _drafts(db, r.chat)] == [AiDraftStatus.PENDING]
    # A handover (not fresh) while the stored one answers her newest: nothing.
    asyncio.run(ask(False))
    assert len(model.calls) == 1 and len(_drafts(db, r.chat)) == 1


def test_a_message_arriving_while_one_is_written_starts_it_again_for_all(owner):
    db = owner.db
    r, first = _hybrid_thread(owner)
    calls = []

    def model(**kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            # She writes again while the first is being written.
            reading_single._suggest_wanted.add(r.chat.id)
            return iter(["answers only the first"])
        return iter(["answers both"])

    owner.monkeypatch.setattr(ai_client, "run_chat_stream", model)

    async def ask():
        owner.real_request(r.chat.id)
        await _suggester_done(r.chat.id)

    asyncio.run(ask())
    assert len(calls) == 2
    [draft] = _drafts(db, r.chat)
    assert (draft.status, draft.draft_text) == (AiDraftStatus.PENDING, "answers both")
    assert owner.notified.count((r.chat.id, owner_messaging.SUGGESTION_READY)) == 1


def test_discard_drops_the_suggestion_and_sends_nothing(owner):
    db = owner.db
    r, message = _hybrid_thread(owner)
    suggestion_id = owner_messaging.store_suggestion(r.chat.id, message.id, ["x"], 1)

    resp = owner.http.post(
        f"/api/admin/chats/{r.chat.id}/suggestion/discard", headers=_bearer(owner.superadmin)
    )

    assert resp.status_code == 200, resp.text
    assert resp.json() == {"chat_id": r.chat.id, "suggestion_id": suggestion_id}
    assert [d.status for d in _drafts(db, r.chat)] == [AiDraftStatus.DISCARDED]
    assert _reply_ids(db, r) == [r.opener.id]
    again = owner.http.post(
        f"/api/admin/chats/{r.chat.id}/suggestion/discard", headers=_bearer(owner.superadmin)
    )
    assert (again.status_code, again.json()["detail"]) == (404, "NO_SUGGESTION")
    # Her message still keeps its promise: it is not answered.
    assert _entry(db, message.id)["state"] == "queued"


def test_regenerate_asks_for_a_fresh_one_only_when_something_waits(owner):
    r, message = _hybrid_thread(owner)
    owner.suggestions.clear()  # her message asked for one already
    url = f"/api/admin/chats/{r.chat.id}/suggestion/regenerate"
    resp = owner.http.post(url, headers=_bearer(owner.superadmin))
    assert resp.status_code == 202, resp.text
    assert resp.json() == {
        "chat_id": r.chat.id, "status": "generating", "unanswered_message_ids": [message.id],
    }
    assert owner.suggestions == [(r.chat.id, True)]

    owner.http.post(
        f"/api/admin/chats/{r.chat.id}/suggestion/send", json={"content": "here"},
        headers=_bearer(owner.superadmin),
    )
    resp = owner.http.post(url, headers=_bearer(owner.superadmin))
    assert (resp.status_code, resp.json()["detail"]) == (409, "NOTHING_TO_ANSWER")

    assert _set_mode(owner, r.chat.id, "automatic").status_code == 200
    resp = owner.http.post(url, headers=_bearer(owner.superadmin))
    assert (resp.status_code, resp.json()["detail"]) == (409, "CHAT_IS_AUTOMATIC")


def test_typing_reaches_her_room_as_the_reader(owner):
    r, _message = _hybrid_thread(owner)
    resp = owner.http.put(
        f"/api/admin/chats/{r.chat.id}/typing", json={"typing": True},
        headers=_bearer(owner.superadmin),
    )
    assert resp.status_code == 200 and resp.json() == {"chat_id": r.chat.id, "typing": True}
    [frame] = r.ws.events("typing_start")
    assert (frame["chat_id"], frame["sender_id"]) == (r.chat.id, r.psychic.id)


# ── guard a: an automatic reply goes out only while the chat is Automatic ────
def test_guard_a_a_queued_reply_is_never_generated_once_a_person_answers(owner):
    db = owner.db
    r = _open_thread(owner.journey)
    model = _model(owner.journey, ["must never be asked"])
    _switch_in_db(owner.journey.Local, r.chat.id, ResponseMode.HYBRID)

    _replay_live(owner, r.chat.id, r.hall.id)

    assert model.calls == []
    assert _reply_ids(db, r) == [r.opener.id]
    assert owner.suggestions == [(r.chat.id, False)]
    entry = _entry(db, r.hall.id)
    assert entry["state"] == "queued" and entry["reply_ids"] == []
    assert _rows(db, TransactionType.REVERSAL, r.hall.id) == []


def test_guard_a_a_reply_written_while_handed_over_becomes_the_suggestion(owner):
    db = owner.db
    r = _open_thread(owner.journey)

    def model(**kwargs):
        # The owner switches the chat to Hybrid while the reply is being written.
        _switch_in_db(owner.journey.Local, r.chat.id, ResponseMode.HYBRID)
        return iter(["the reply she nearly got\n\nsecond bubble"])

    owner.monkeypatch.setattr(ai_client, "run_chat_stream", model)
    _replay_live(owner, r.chat.id, r.hall.id)

    # Not one bubble reached her, and the dots she may have seen are cleared.
    assert _reply_ids(db, r) == [r.opener.id]
    assert [p for p in r.ws.messages() if p.get("sender_id") == r.psychic.id] == []
    dots = [p["event"] for p in r.ws.sent if p.get("event") in ("typing_start", "typing_stop")]
    assert dots == [] or dots[-1] == "typing_stop"
    # The work is kept as the owner's suggestion.
    [draft] = _drafts(db, r.chat)
    assert (draft.status, draft.client_message_id, draft.draft_text) == (
        AiDraftStatus.PENDING, r.hall.id, "the reply she nearly got\n\nsecond bubble",
    )
    assert owner.notified[-1] == (r.chat.id, owner_messaging.SUGGESTION_READY)
    # Her message still waits under its 24 hour promise; nothing refunded.
    entry = _entry(db, r.hall.id)
    assert entry["state"] == "queued" and entry["reply_ids"] == []
    assert _rows(db, TransactionType.REVERSAL, r.hall.id) == []
    # The draft log says it was written and held, not delivered.
    from app.models.reading_draft_attempt import ReadingDraftAttempt

    db.expire_all()
    [attempt] = db.query(ReadingDraftAttempt).filter(ReadingDraftAttempt.chat_id == r.chat.id).all()
    assert attempt.is_delivered is False and json.loads(attempt.notes)["held_for_person"] is True


def test_no_typing_dots_start_once_a_person_answers(owner):
    from datetime import datetime, timezone

    r = _open_thread(owner.journey)

    def dots():
        typing = reading_single._Typing(r.chat.id, r.psychic.id)
        presence = reading_single._new_presence("hi", datetime.now(timezone.utc))
        asyncio.run(reading_single._start_typing(presence, typing, automatic_only=True))
        return r.ws.events("typing_start")

    _switch_in_db(owner.journey.Local, r.chat.id, ResponseMode.HYBRID)
    assert dots() == []
    _switch_in_db(owner.journey.Local, r.chat.id, ResponseMode.SABRI)
    assert len(dots()) == 1


def test_guard_a_the_first_bubble_reads_the_mode_under_the_row_lock(owner):
    """The last line: a switch that lands after the reply is written and its
    dots have started still stops the first bubble, which reads the mode under
    the chat's row lock in its own transaction."""
    db = owner.db
    r = _open_thread(owner.journey)

    def model(**kwargs):
        _switch_in_db(owner.journey.Local, r.chat.id, ResponseMode.HYBRID)
        return iter(["held at the last moment"])

    owner.monkeypatch.setattr(ai_client, "run_chat_stream", model)
    # The two earlier reads miss the switch (it lands just after each of them).
    owner.monkeypatch.setattr(reading_single, "_is_automatic", lambda chat_id: True)
    _replay_live(owner, r.chat.id, r.hall.id)

    assert _reply_ids(db, r) == [r.opener.id]
    [draft] = _drafts(db, r.chat)
    assert (draft.status, draft.draft_text) == (AiDraftStatus.PENDING, "held at the last moment")
    entry = _entry(db, r.hall.id)
    assert entry["state"] == "queued" and entry["reply_ids"] == []


def test_guard_a_a_failed_reply_after_the_handover_is_not_refunded_early(owner):
    db = owner.db
    r = _open_thread(owner.journey)
    calls = []

    def model(**kwargs):
        calls.append(kwargs)
        _switch_in_db(owner.journey.Local, r.chat.id, ResponseMode.HYBRID)
        raise RuntimeError("overloaded")

    owner.monkeypatch.setattr(ai_client, "run_chat_stream", model)
    _replay_live(owner, r.chat.id, r.hall.id)

    assert len(calls) == reading_single.MAX_ATTEMPTS
    assert _rows(db, TransactionType.REVERSAL, r.hall.id) == []
    assert _reply_ids(db, r) == [r.opener.id]
    assert owner.suggestions == [(r.chat.id, False)]


# ── guard b: a switch to Automatic answers only what is unanswered, once ─────
def test_guard_b_closes_the_answered_and_answers_the_rest_with_one_reply(owner):
    db = owner.db
    r, first = _hybrid_thread(owner)
    # A person answers her first message as the reader (the cockpit's socket).
    by_hand = Message(chat_id=r.chat.id, sender_id=r.psychic.id, content="i'm here", is_system=False)
    db.add(by_hand)
    db.commit()
    _send(owner.journey, r.chat, r.client, "second question")
    _send(owner.journey, r.chat, r.client, "third question")
    second, third = _client_messages(db, r.chat, r.client)[-2:]
    suggestion_id = owner_messaging.store_suggestion(r.chat.id, third.id, ["draft"], 1)

    resp = _set_mode(owner, r.chat.id, "automatic")

    assert resp.status_code == 200, resp.text
    assert resp.json() == {
        "chat_id": r.chat.id, "mode": "automatic",
        "closed_as_answered": [first.id], "unanswered_message_ids": [second.id, third.id],
    }
    entry = _entry(db, first.id)
    assert (entry["state"], entry["reply_ids"]) == ("delivered", [by_hand.id])
    assert [(d.id, d.status) for d in _drafts(db, r.chat)] == [(suggestion_id, AiDraftStatus.DISCARDED)]
    head, covered = _entry(db, third.id), _entry(db, second.id)
    assert head["covers"] == [second.id] and head["state"] == "delivering" and "manual" not in head
    assert covered["covered_by"] == third.id and "manual" not in covered
    # Only the newest is handed to the automatic reader, claimed at once.
    args, kwargs = owner.journey.calls["enqueue_reply"][-1]
    assert args == (r.chat.id, third.id) and kwargs["queue_token"] == head["token"]

    model = _model(owner.journey, ["one reply for both\n\nand the rest"])
    asyncio.run(_replay_claimed(owner, r.chat.id, third.id, head["token"]))

    # Exactly one call, answering both of her unanswered messages.
    [call] = model.calls
    marked = call["user_content"].split(reading_single.MARKED_MESSAGE_HEADER)[-1]
    assert second.content in marked and third.content in marked and first.content not in marked
    bubbles = [m for m in _reader_messages(db, r.chat, r.psychic) if m.id > third.id]
    assert [m.content for m in bubbles] == ["one reply for both", "and the rest"]
    assert all(m.author_type == AuthorType.AI_DRAFTED for m in bubbles)
    assert _entry(db, second.id)["state"] == "delivered"
    assert _entry(db, second.id)["reply_ids"] == [bubbles[0].id]
    assert _entry(db, third.id)["reply_ids"] == [m.id for m in bubbles]
    # Nothing left for the sweep: never a second reply.
    assert offline_replies.sweep() == []
    assert _reply_ids(db, r) == [r.opener.id, by_hand.id] + [m.id for m in bubbles]


def test_guard_b_a_switch_with_her_reader_away_leaves_one_head_for_the_sweep(owner):
    db = owner.db
    r, first = _hybrid_thread(owner)
    _send(owner.journey, r.chat, r.client, "second question")
    second = _client_messages(db, r.chat, r.client)[-1]
    reader = db.get(User, r.psychic.id)
    reader.online_from, reader.online_to = _offline_hours()
    db.commit()
    enqueued_before = len(owner.journey.calls["enqueue_reply"])

    assert _set_mode(owner, r.chat.id, "automatic").status_code == 200
    assert len(owner.journey.calls["enqueue_reply"]) == enqueued_before
    assert _entry(db, second.id)["state"] == "queued"

    reader.online_from = reader.online_to = None  # her hours begin
    db.commit()
    claim = offline_replies.claim_next(r.psychic.id)
    assert claim is not None and claim[:2] == (r.chat.id, second.id)
    # The older one waits inside that reply, never answered on its own.
    assert offline_replies.claim_next(r.psychic.id) is None
    assert _entry(db, first.id)["covered_by"] == second.id


def test_guard_b_a_failed_head_lets_what_it_covered_wait_on_its_own(owner):
    db = owner.db
    r, first = _hybrid_thread(owner)
    _send(owner.journey, r.chat, r.client, "second question")
    second = _client_messages(db, r.chat, r.client)[-1]
    assert _set_mode(owner, r.chat.id, "automatic").status_code == 200
    token = _entry(db, second.id)["token"]
    _model(owner.journey, [RuntimeError("down"), RuntimeError("down")])

    asyncio.run(_replay_claimed(owner, r.chat.id, second.id, token))

    assert _entry(db, second.id)["state"] == "refunded"
    assert "covered_by" not in _entry(db, first.id)
    assert _entry(db, first.id)["state"] == "queued"


def test_the_cockpit_mode_route_switches_through_the_same_guards(owner):
    db = owner.db
    r, first = _hybrid_thread(owner)
    db.add(Message(chat_id=r.chat.id, sender_id=r.psychic.id, content="by hand", is_system=False))
    db.commit()

    resp = owner.http.put(
        f"/api/chat/{r.chat.id}/response-mode", json={"mode": "SABRI"},
        headers=_bearer(owner.superadmin),
    )

    assert resp.status_code == 200, resp.text
    assert resp.json() == {"chat_id": r.chat.id, "response_mode": "SABRI"}
    assert _entry(db, first.id)["state"] == "delivered"


# ── guard c: a switch to Hybrid asks for a suggestion at once ────────────────
def test_guard_c_a_switch_to_hybrid_with_an_unanswered_message_asks_at_once(owner):
    r = _open_thread(owner.journey)
    resp = _set_mode(owner, r.chat.id, "hybrid")
    assert resp.status_code == 200, resp.text
    assert resp.json()["unanswered_message_ids"] == [r.hall.id]
    assert owner.suggestions == [(r.chat.id, False)]


def test_guard_c_not_when_the_reply_being_written_answers_them_all(owner):
    r = _open_thread(owner.journey)
    owner.monkeypatch.setitem(reading_single._turn_covers, r.chat.id, {r.hall.id})
    assert _set_mode(owner, r.chat.id, "hybrid").status_code == 200
    assert owner.suggestions == []


def test_guard_c_not_when_nothing_waits(owner):
    r = _open_thread(owner.journey)
    _set_entry(owner.db, r.hall.id, state="delivered", live=False, lease_until=None)
    assert _set_mode(owner, r.chat.id, "hybrid").status_code == 200
    assert owner.suggestions == []


def test_mode_route_refuses_an_unknown_chat_or_mode(owner):
    assert _set_mode(owner, 999, "hybrid").status_code == 404
    r = _open_thread(owner.journey)
    assert _set_mode(owner, r.chat.id, "SABRI").status_code == 422


# ── the inbox ────────────────────────────────────────────────────────────────
def _conversation(db, n, reader, mode, lines, *, paid=(), suggestion_for=None):
    """One chat with ``lines`` of (side, minutes ago); ``paid`` indexes the lines
    charged and still waiting; ``suggestion_for`` the line a pending suggestion
    answers."""
    client = User(email=f"c{n}@test.co", username=f"client{n}", password_hash="hash", role=Role.USER)
    db.add(client)
    db.commit()
    chat = Chat(user_id=client.id, psychic_id=reader.id, status=ChatStatus.ACTIVE, response_mode=mode)
    db.add(chat)
    db.commit()
    rows = []
    for index, (side, minutes) in enumerate(lines):
        message = Message(
            chat_id=chat.id, sender_id=client.id if side == "client" else reader.id,
            content=f"chat {n} line {index}", status=MessageStatus.SENT,
            created_at=_naive_utc_now() - timedelta(minutes=minutes),
        )
        db.add(message)
        db.commit()
        rows.append(message)
    for index in paid:
        db.add(Transaction(
            user_id=client.id, transaction_type=TransactionType.DEBIT, amount=PRICE,
            balance_before=10, balance_after=10 - PRICE, status=TransactionStatus.COMPLETED,
            related_chat_id=chat.id, related_message_id=rows[index].id,
            idempotency_key=f"msg_fee:{rows[index].id}",
            transaction_metadata=json.dumps(
                {offline_replies.QUEUE_KEY: {"state": "queued", "reply_ids": [], "manual": True}}
            ),
        ))
    if suggestion_for is not None:
        db.add(AiDraft(chat_id=chat.id, client_message_id=rows[suggestion_for].id,
                       mode=ResponseMode.HYBRID, draft_text="draft", status=AiDraftStatus.PENDING))
    db.commit()
    return chat, rows


def _maren(db):
    reader = User(email="maren@test.co", username="maren", password_hash="hash", role=Role.PSYCHIC)
    db.add(reader)
    db.commit()
    return reader


def test_the_inbox_order_and_its_fields(owner):
    db = owner.db
    reader = _maren(db)
    hours = 60
    quiet_old, _ = _conversation(db, 1, reader, ResponseMode.SABRI, [("client", 300), ("reader", 3 * hours)])
    suggested, _ = _conversation(
        db, 2, reader, ResponseMode.HYBRID, [("reader", 400), ("client", 50)], paid=[1], suggestion_for=1
    )
    waiting_late, _ = _conversation(db, 3, reader, ResponseMode.HYBRID, [("client", 1 * hours)], paid=[0])
    quiet_new, _ = _conversation(db, 4, reader, ResponseMode.SABRI, [("client", 30), ("reader", 5)])
    waiting_soon, w_rows = _conversation(db, 5, reader, ResponseMode.HUMAN, [("client", 10 * hours)], paid=[0])
    waiting_free, _ = _conversation(db, 6, reader, ResponseMode.SABRI, [("reader", 90), ("client", 30)])

    resp = owner.http.get("/api/admin/inbox", headers=_bearer(owner.superadmin))

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert [item["chat_id"] for item in body["items"]] == [
        suggested.id, waiting_soon.id, waiting_late.id, waiting_free.id, quiet_new.id, quiet_old.id,
    ]
    assert (body["total"], body["has_more"]) == (6, False)
    first = body["items"][0]
    assert first["has_suggestion"] is True and first["waiting"] is True
    assert (first["mode"], first["reader_name"], first["client_name"]) == ("hybrid", "Maren", "client2")
    assert (first["last_message_text"], first["last_sender"]) == ("chat 2 line 1", "client")
    soon = body["items"][1]
    assert soon["mode"] == "hybrid"  # a legacy HUMAN chat reads as Hybrid
    oldest = w_rows[0].created_at
    assert soon["oldest_unanswered_at"].startswith(oldest.isoformat()[:19])
    assert soon["refund_at"].startswith((oldest + WINDOW).isoformat()[:19])
    free = body["items"][3]
    assert free["waiting"] is True and free["refund_at"] is None
    quiet = body["items"][4]
    assert (quiet["waiting"], quiet["last_sender"], quiet["has_suggestion"]) == (False, "reader", False)
    page = owner.http.get("/api/admin/inbox?offset=4&limit=2", headers=_bearer(owner.superadmin)).json()
    assert [i["chat_id"] for i in page["items"]] == [quiet_new.id, quiet_old.id]
    assert page["has_more"] is False


def test_the_inbox_is_two_statements_whatever_the_number_of_chats(owner):
    db = owner.db
    reader = _maren(db)

    def statements():
        count = {"n": 0}

        def _count(*_args):
            count["n"] += 1

        connection = db.connection()
        event.listen(connection, "after_cursor_execute", _count)
        try:
            owner_messaging.owner_inbox(db, offset=0, limit=50)
        finally:
            event.remove(connection, "after_cursor_execute", _count)
        return count["n"]

    for n in range(3):
        _conversation(db, n, reader, ResponseMode.HYBRID, [("client", 10 + n)], paid=[0])
    few = statements()
    for n in range(3, 12):
        _conversation(db, n, reader, ResponseMode.SABRI, [("client", 10 + n), ("reader", n)], paid=[0])
    assert few == statements() == 2


# ── the thread ───────────────────────────────────────────────────────────────
def test_the_thread_pages_shows_the_suggestion_and_marks_nothing_read(owner):
    db = owner.db
    r, message = _hybrid_thread(owner)
    db.expire_all()
    status_before = db.get(Message, message.id).status
    frames_before = len(r.ws.sent)
    suggestion_id = owner_messaging.store_suggestion(r.chat.id, message.id, ["one", "two"], 2)

    resp = owner.http.get(f"/api/admin/chats/{r.chat.id}/thread", headers=_bearer(owner.superadmin))

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert (body["mode"], body["waiting"], body["unanswered_message_ids"]) == ("hybrid", True, [message.id])
    assert body["suggestion"]["id"] == suggestion_id and body["suggestion"]["text"] == "one\n\ntwo"
    assert body["suggestion"]["through_message_id"] == message.id
    sides = [(m["id"], m["side"]) for m in body["messages"]]
    assert sides[0] == (r.opener.id, "reader") and sides[-1] == (message.id, "client")
    assert body["refund_at"] is not None and body["has_more"] is False
    db.expire_all()
    assert db.get(Message, message.id).status == status_before
    assert len(r.ws.sent) == frames_before  # nothing told to her room

    older = owner.http.get(
        f"/api/admin/chats/{r.chat.id}/thread?limit=1&before_id={message.id}",
        headers=_bearer(owner.superadmin),
    ).json()
    assert len(older["messages"]) == 1 and older["messages"][0]["id"] < message.id
    assert older["has_more"] is True
    missing = owner.http.get("/api/admin/chats/999/thread", headers=_bearer(owner.superadmin))
    assert missing.status_code == 404


def test_a_reply_written_by_hand_since_makes_the_suggestion_stale(owner):
    db = owner.db
    r, message = _hybrid_thread(owner)
    owner_messaging.store_suggestion(r.chat.id, message.id, ["one"], 1)
    db.add(Message(chat_id=r.chat.id, sender_id=r.psychic.id, content="by hand", is_system=False))
    db.commit()
    body = owner.http.get(f"/api/admin/chats/{r.chat.id}/thread", headers=_bearer(owner.superadmin)).json()
    assert body["suggestion"] is None and body["unanswered_message_ids"] == []
    inbox = owner.http.get("/api/admin/inbox", headers=_bearer(owner.superadmin)).json()
    assert [i["has_suggestion"] for i in inbox["items"] if i["chat_id"] == r.chat.id] == [False]


# ── the cockpit's reader token works on the chat socket again ────────────────
def test_the_psychic_token_is_an_access_token_the_socket_accepts(owner):
    r = _open_thread(owner.journey)
    resp = owner.http.get(f"/api/chat/{r.chat.id}/details", headers=_bearer(owner.superadmin))
    assert resp.status_code == 200, resp.text
    token = resp.json()["psychic_token"]
    claims = decode_access_token(token)
    assert (claims["sub"], claims["type"], claims["role"]) == (str(r.psychic.id), "access", "PSYCHIC")
    user = asyncio.run(chats_router.authenticate_websocket_user(token, owner.db))
    assert user.id == r.psychic.id
    # A client never gets one.
    resp = owner.http.get(f"/api/chat/{r.chat.id}/details", headers=_bearer(r.client))
    assert resp.status_code == 200 and resp.json()["psychic_token"] is None
