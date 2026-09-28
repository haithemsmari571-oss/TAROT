"""The refund promise on a chat a person answers (HUMAN or HYBRID).

The owner's console switches a live per-message conversation to HUMAN or
HYBRID (PUT /api/chat/{id}/response-mode). The thread never closes, so the
client carries on from her Chats list, and every message she sends there is
charged. The room still promises "refunded automatically if she has not
replied within 24 hours", so those messages are covered as the automatic
reader's are:

- each gets its queue entry with the charge, marked manual, and keeps its
  presence receipts (not the away reader's early Delivered);
- the automatic reader never claims it, nor an entry queued before the switch;
- at the window it is refunded when nobody on the reader's side has written
  since, and closed as delivered, with no refund, when somebody has.

The journey harness (tests/test_per_message_journey.py) drives the real
routes, handler, charge and queue on an in-memory database, and
tests/test_refund_promise.py's `durable` fixture makes the sweep readable on
SQLite.
"""

from __future__ import annotations

from datetime import timedelta

import pytest

from app.enums.message_status import MessageStatus
from app.enums.response_mode import ResponseMode
from app.enums.transaction_type import TransactionType
from app.models import Chat, Message
from app.services import offline_replies
from tests.test_per_message_journey import (  # noqa: F401 - fixtures by name
    PRICE,
    _client_messages,
    _enqueued,
    _naive_utc_now,
    _open_thread,
    _rows,
    _send,
    journey,
    sqlite,
)
from tests.test_refund_promise import _age, _entry, _set_entry, durable  # noqa: F401

MANUAL_MODES = [ResponseMode.HUMAN, ResponseMode.HYBRID]


def _switch(db, chat, mode):
    """What the owner's console does, as the route commits it."""
    db.expire_all()
    stored = db.get(Chat, chat.id)
    stored.response_mode = mode
    db.commit()


def _manual_thread(durable, mode):
    """A live conversation, its first question answered, then switched to a
    person, and one paid message sent in it from the room."""
    db = durable.db
    r = _open_thread(durable)
    _set_entry(db, r.hall.id, state="delivered", live=False, lease_until=None)
    _switch(db, r.chat, mode)
    _send(durable, r.chat, r.client, "are you still there?")
    message = _client_messages(db, r.chat, r.client)[-1]
    assert message.content == "are you still there?"
    return r, message


@pytest.mark.parametrize("mode", MANUAL_MODES)
def test_a_paid_message_to_a_person_gets_a_manual_entry_with_its_charge(durable, mode):
    db = durable.db
    r, message = _manual_thread(durable, mode)

    debits = _rows(db, TransactionType.DEBIT, message.id)
    assert [float(d.amount) for d in debits] == [PRICE]
    entry = _entry(db, message.id)
    assert entry == {"state": "queued", "reply_ids": [], "manual": True}
    # Not an away reader's wait: no early Delivered tick, no automatic reply.
    assert not offline_replies.is_queued(db, message.id)
    db.refresh(message)
    assert message.status != MessageStatus.DELIVERED
    assert [args[1] for args in _enqueued(durable)] == [r.hall.id]


@pytest.mark.parametrize("mode", MANUAL_MODES)
def test_the_automatic_reader_never_claims_a_manual_entry(durable, mode):
    db = durable.db
    r, message = _manual_thread(durable, mode)

    # The reader keeps no hours, so she is online: only the mode holds it back.
    assert offline_replies.claim_next(r.psychic.id) is None
    assert offline_replies.sweep() == []
    assert _entry(db, message.id)["state"] == "queued"


@pytest.mark.parametrize("mode", MANUAL_MODES)
def test_an_entry_queued_before_the_switch_is_left_to_the_person(durable, mode):
    db = durable.db
    r = _open_thread(durable)
    # Its live reply was lost, so the sweep would answer it on an automatic chat...
    _set_entry(db, r.hall.id, lease_until=(_naive_utc_now() - timedelta(minutes=1)).isoformat())
    _switch(db, r.chat, mode)

    # ...but a person answers this chat now.
    assert offline_replies.claim_next(r.psychic.id) is None
    assert _entry(db, r.hall.id)["state"] == "queued"

    # Switched back, the automatic reader takes it again.
    _switch(db, r.chat, ResponseMode.SABRI)
    claim = offline_replies.claim_next(r.psychic.id)
    assert claim is not None and claim[:2] == (r.chat.id, r.hall.id)


@pytest.mark.parametrize("mode", MANUAL_MODES)
def test_unanswered_at_the_window_it_is_refunded_with_the_line(durable, mode):
    db = durable.db
    r, message = _manual_thread(durable, mode)
    _age(db, message.id, offline_replies.OFFLINE_REPLY_TIMEOUT + timedelta(minutes=1))

    refunded = []
    offline_replies.sweep(refunded)

    assert refunded == [message.id]
    reversals = _rows(db, TransactionType.REVERSAL, message.id)
    assert [t.idempotency_key for t in reversals] == [f"msg_refund:{message.id}"]
    assert float(reversals[0].amount) == PRICE
    entry = _entry(db, message.id)
    assert (entry["state"], entry["reason"]) == ("refunded", "expired")
    note = db.get(Message, entry["note_id"])
    assert (note.chat_id, note.is_system, note.content) == (r.chat.id, True, offline_replies.REFUND_NOTE)

    # Once only.
    again = []
    offline_replies.sweep(again)
    assert again == [] and len(_rows(db, TransactionType.REVERSAL, message.id)) == 1


@pytest.mark.parametrize("mode", MANUAL_MODES)
def test_answered_by_the_reader_side_it_closes_without_a_refund(durable, mode):
    db = durable.db
    r, message = _manual_thread(durable, mode)
    # The person answers as the reader (the reader's socket, or an approved draft).
    reply = Message(chat_id=r.chat.id, sender_id=r.psychic.id, content="i'm here, give me a moment", is_system=False)
    db.add(reply)
    db.commit()
    _age(db, message.id, offline_replies.OFFLINE_REPLY_TIMEOUT + timedelta(minutes=1))

    refunded = []
    offline_replies.sweep(refunded)

    assert refunded == []
    assert _rows(db, TransactionType.REVERSAL, message.id) == []
    entry = _entry(db, message.id)
    assert (entry["state"], entry["reply_ids"]) == ("delivered", [reply.id])
    assert entry["completed_at"]


@pytest.mark.parametrize("mode", MANUAL_MODES)
def test_a_system_line_is_not_a_reply(durable, mode):
    db = durable.db
    r, message = _manual_thread(durable, mode)
    db.add(Message(chat_id=r.chat.id, sender_id=None, content="26 September 2026", is_system=True))
    db.commit()
    _age(db, message.id, offline_replies.OFFLINE_REPLY_TIMEOUT + timedelta(minutes=1))

    refunded = []
    offline_replies.sweep(refunded)

    assert refunded == [message.id]
    assert _entry(db, message.id)["state"] == "refunded"


def test_an_automatic_chat_keeps_its_rule_reply_ids_only(durable):
    """On an automatic chat nothing changes: only the automatic reader's own
    bubbles (reply_ids) answer a message, so a later bubble does not close an
    older unanswered one."""
    db = durable.db
    r = _open_thread(durable)
    db.add(Message(chat_id=r.chat.id, sender_id=r.psychic.id, content="a later bubble", is_system=False))
    db.commit()
    _age(db, r.hall.id, offline_replies.OFFLINE_REPLY_TIMEOUT + timedelta(minutes=1))

    refunded = []
    offline_replies.sweep(refunded)

    assert refunded == [r.hall.id]
    assert "manual" not in _entry(db, r.hall.id)
