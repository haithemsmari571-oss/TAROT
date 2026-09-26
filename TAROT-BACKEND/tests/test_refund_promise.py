"""The refund promise: every paid message is answered or refunded.

"Her hello is free. Each message you send is £X, refunded automatically if she
has not replied within 24 hours." The app shows it with the backend's own
window (refund_after_hours), so the backend has to keep it for every message:

- a live send gets its queue entry in the charge's transaction, and the live
  reply takes it over, so a reply lost to a restart or a crash is left to the
  sweep, which answers it or refunds it after 24 hours;
- a refund leaves a quiet line in her thread and tells her room her balance;
- the "that message is refunded" bubble goes out only when it was;
- a paid send whose reply cannot be queued is an error, not a note.

The journey harness (tests/test_per_message_journey.py) drives the real
routes, handler, charge, engine and queue on an in-memory database. SQLite
cannot evaluate the sweep's JSON-path state test, so _pending is swapped for
tests/test_delete_account.py's text form, as that file does.
"""

from __future__ import annotations

import asyncio
import json
from datetime import timedelta
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database.client import get_db
from app.enums.message_status import MessageStatus
from app.enums.transaction_type import TransactionType
from app.models import Message, Transaction
from app.routers import chats as chats_router
from app.routers import public_settings as public_settings_router
from app.services import offline_replies
from app.services.ai import reading_single
from tests.test_delete_account import _pending_as_text
from tests.test_per_message_journey import (  # noqa: F401 - fixtures by name
    PRICE,
    _client_messages,
    _model,
    _naive_utc_now,
    _open_thread,
    _reader_messages,
    _replay,
    _rows,
    _send,
    journey,
    sqlite,
)


@pytest.fixture
def durable(journey):
    """The journey with the queue's clock naive (SQLite hands DateTime columns
    back without a zone) and the sweep's selection readable on SQLite."""
    journey.monkeypatch.setattr(offline_replies, "_now", _naive_utc_now)
    journey.monkeypatch.setattr(offline_replies, "_pending", _pending_as_text)
    return journey


def _entry(db, message_id):
    db.expire_all()
    debit = (
        db.query(Transaction)
        .filter(Transaction.idempotency_key == f"msg_fee:{message_id}")
        .one()
    )
    return json.loads(debit.transaction_metadata)[offline_replies.QUEUE_KEY]


def _set_entry(db, message_id, **changes):
    debit = (
        db.query(Transaction)
        .filter(Transaction.idempotency_key == f"msg_fee:{message_id}")
        .one()
    )
    metadata = json.loads(debit.transaction_metadata)
    metadata[offline_replies.QUEUE_KEY].update(changes)
    debit.transaction_metadata = json.dumps(metadata)
    db.commit()


def _age(db, message_id, by):
    db.expire_all()
    stored = db.get(Message, message_id)
    stored.created_at = _naive_utc_now() - by
    db.commit()


REPLY = "u started timing the replies\n\nfast and u breathe. slow and ur body braces"


# ── the window the app promises, from the refund's own clock ─────────────────
def test_the_refund_window_is_served_from_the_timeout(durable):
    assert offline_replies.refund_after_hours() == 24
    assert offline_replies.OFFLINE_REPLY_TIMEOUT == timedelta(hours=24)

    r = _open_thread(durable)
    details = r.http.get(f"/api/chat/{r.chat.id}/details")
    assert details.status_code == 200, details.text
    assert details.json()["refund_after_hours"] == 24
    # The same fields ride the session_info frame and the session-time shapes.
    assert chats_router._billing_fields(durable.db, r.chat)["refund_after_hours"] == 24

    app = FastAPI()
    app.include_router(public_settings_router.router, prefix="/api")
    app.dependency_overrides[get_db] = lambda: durable.db
    public = TestClient(app).get("/api/settings/public")
    assert public.status_code == 200, public.text
    assert public.json()["refund_after_hours"] == 24


# ── a live send is charged with its entry, and the live reply takes it ───────
def test_a_live_send_is_charged_with_its_entry_and_the_live_reply_finishes_it(durable):
    db = durable.db
    r = _open_thread(durable)  # the reader keeps no hours: online, a live send

    entry = _entry(db, r.hall.id)
    assert (entry["state"], entry["reply_ids"], entry["live"]) == ("queued", [], True)
    assert "token" not in entry and entry["lease_until"]
    # Not a message waiting for an away reader: no early Delivered tick.
    assert not offline_replies.is_queued(db, r.hall.id)
    db.refresh(r.hall)
    assert r.hall.status != MessageStatus.DELIVERED
    # The lease keeps the sweep off it while the live reply takes it.
    assert offline_replies.claim_next(r.psychic.id) is None

    _model(durable, [REPLY])
    asyncio.run(_replay(durable, r.chat.id, r.hall.id))

    bubbles = _reader_messages(db, r.chat, r.psychic)[1:]
    assert [m.content for m in bubbles] == REPLY.split("\n\n")
    entry = _entry(db, r.hall.id)
    assert entry["state"] == "delivered"
    assert entry["reply_ids"] == [m.id for m in bubbles]
    assert entry["token"]
    assert _rows(db, TransactionType.REVERSAL) == []
    assert reading_single._leases == {}


# ── a live reply lost before it started is the sweep's to answer ─────────────
def test_a_live_send_whose_reply_was_lost_is_claimed_and_answered_by_the_sweep(durable):
    db = durable.db
    r = _open_thread(durable)
    # The process that charged it died before its reply began: the lease lapses.
    _set_entry(db, r.hall.id, lease_until=(_naive_utc_now() - timedelta(minutes=1)).isoformat())

    claims = offline_replies.sweep()
    assert [(chat_id, message_id) for chat_id, message_id, _ in claims] == [(r.chat.id, r.hall.id)]
    token = claims[0][2]
    assert _entry(db, r.hall.id)["state"] == "delivering"
    # The live reply, if it comes back late, finds the sweep's token and stands down.
    assert offline_replies.claim_live(r.hall.id) is None

    _model(durable, [REPLY])

    async def _wake():
        await durable.real_enqueue(r.chat.id, r.hall.id, queue_token=token)
        await reading_single.wait_for_idle(r.chat.id)

    asyncio.run(_wake())
    assert [m.content for m in _reader_messages(db, r.chat, r.psychic)[1:]] == REPLY.split("\n\n")
    assert _entry(db, r.hall.id)["state"] == "delivered"
    assert _rows(db, TransactionType.REVERSAL) == []


# ── never answered: refunded after 24 hours, with the line and the balance ───
def test_an_unanswered_live_send_is_refunded_after_the_window_and_her_room_is_told(durable):
    db = durable.db
    r = _open_thread(durable)
    _age(db, r.hall.id, offline_replies.OFFLINE_REPLY_TIMEOUT + timedelta(minutes=1))

    refunded = []
    claims = offline_replies.sweep(refunded)

    assert refunded == [r.hall.id] and claims == []
    reversals = _rows(db, TransactionType.REVERSAL, r.hall.id)
    assert [t.idempotency_key for t in reversals] == [f"msg_refund:{r.hall.id}"]
    assert float(reversals[0].amount) == PRICE
    entry = _entry(db, r.hall.id)
    assert (entry["state"], entry["reason"]) == ("refunded", "expired")
    note = db.get(Message, entry["note_id"])
    assert (note.chat_id, note.is_system, note.sender_id, note.content) == (
        r.chat.id, True, None, offline_replies.REFUND_NOTE,
    )
    # The owner's words, readable on every screen that shows system rows; the
    # app finds the row by them (perMessage.ts REFUND_NOTE).
    assert offline_replies.REFUND_NOTE == "Refund · no reply"
    db.expire_all()
    assert float(r.client.balance) == 20.0

    # Her room: the quiet line to the room, her balance to her sockets.
    assert asyncio.run(offline_replies.announce_refund(r.hall.id)) is True
    lines = [p for p in r.ws.sent if p.get("type") == "system"]
    assert lines == [{
        "type": "system", "id": note.id, "content": offline_replies.REFUND_NOTE,
        "is_system": True, "chat_id": r.chat.id, "sender_id": None,
        "created_at": note.created_at.isoformat(),
    }]
    assert r.ws.events("balance_updated") == [
        {"event": "balance_updated", "data": {"balance": 20.0, "price_per_message": PRICE}}
    ]

    # Once only.
    again = []
    offline_replies.sweep(again)
    assert again == [] and len(_rows(db, TransactionType.REVERSAL)) == 1


# ── both attempts fail on a live send: refund, line, balance, then the bubble ─
def test_a_live_send_both_attempts_fail_refunds_announces_and_says_so(durable):
    db = durable.db
    r = _open_thread(durable)
    _model(durable, [RuntimeError("boom"), RuntimeError("boom again")])

    asyncio.run(_replay(durable, r.chat.id, r.hall.id))

    entry = _entry(db, r.hall.id)
    assert (entry["state"], entry["reason"]) == ("refunded", "generation_failed")
    assert len(_rows(db, TransactionType.REVERSAL, r.hall.id)) == 1
    note = db.get(Message, entry["note_id"])
    assert note.content == offline_replies.REFUND_NOTE and note.is_system
    assert [p["content"] for p in r.ws.sent if p.get("type") == "system"] == [
        offline_replies.REFUND_NOTE
    ]
    assert [e["data"]["balance"] for e in r.ws.events("balance_updated")] == [20.0]
    assert [m.content for m in _reader_messages(db, r.chat, r.psychic)[1:]] == [
        reading_single.UNREACHABLE_NOTICE
    ]


# ── the bubble says "refunded" only when the refund happened ─────────────────
@pytest.mark.parametrize("outcome", ["nothing_refunded", "refund_raised"])
def test_no_refunded_bubble_without_a_refund(monkeypatch, outcome):
    delivered = []

    def _refund(db, message_id):
        if outcome == "refund_raised":
            raise RuntimeError("ledger down")
        return None

    async def _deliver(*args, **kwargs):
        delivered.append(args)

    monkeypatch.setattr(reading_single, "refund_message", _refund)
    monkeypatch.setattr(reading_single, "_deliver", _deliver)

    asyncio.run(reading_single._refund_and_notify(1, 2, 3, None, "boom"))

    assert delivered == []


def test_the_refunded_bubble_goes_out_when_the_refund_happened(monkeypatch):
    delivered = []

    async def _deliver(chat_id, psychic_id, bubbles, state, **pacing):
        delivered.append(bubbles)

    monkeypatch.setattr(reading_single, "refund_message", lambda db, message_id: SimpleNamespace(id=9))
    monkeypatch.setattr(reading_single, "_deliver", _deliver)

    asyncio.run(reading_single._refund_and_notify(1, 2, 3, None, "boom"))

    assert delivered == [[reading_single.UNREACHABLE_NOTICE]]


# ── one failed lease renewal does not drop the lease ─────────────────────────
def test_the_lease_survives_a_failed_renewal(monkeypatch):
    beats = iter([RuntimeError("database hiccup"), True, False])
    calls = []

    def _renew(message_id, token):
        calls.append((message_id, token))
        beat = next(beats)
        if isinstance(beat, Exception):
            raise beat
        return beat

    async def _no_wait(seconds):
        return None

    monkeypatch.setattr(offline_replies, "renew", _renew)
    monkeypatch.setattr(reading_single.asyncio, "sleep", _no_wait)

    asyncio.run(reading_single._renew_lease(7, "token"))

    # It kept renewing after the error, and stopped only when renew said no.
    assert calls == [(7, "token")] * 3


# ── a paid send whose reply cannot be queued is raised, and still covered ────
def test_a_failed_reply_hand_off_is_raised_and_the_message_stays_covered(durable):
    db = durable.db
    r = _open_thread(durable)

    async def _broken(*args, **kwargs):
        raise RuntimeError("worker unavailable")

    durable.monkeypatch.setattr(reading_single, "enqueue_reply", _broken)
    with pytest.raises(RuntimeError, match="worker unavailable"):
        _send(durable, r.chat, r.client, "are you there")

    second = _client_messages(db, r.chat, r.client)[-1]
    assert second.content == "are you there"
    assert len(_rows(db, TransactionType.DEBIT, second.id)) == 1
    # Its entry was committed with the charge, so the sweep will answer or refund it.
    entry = _entry(db, second.id)
    assert (entry["state"], entry["live"]) == ("queued", True)
