"""Regression: the chat-messages endpoint must return a DETERMINISTIC total order.

`created_at` alone is not a total order — two rows with the same timestamp (a fast
client message + AI reply, or coarse-clock/second-precision stores) sort
non-deterministically and can render out of order or skip/duplicate across
pages. The endpoint now orders by (created_at, id); id (autoincrement = send
order) is the tiebreak. These pin that contract across the asc and
negative-offset (reversed) branches.
"""

import json
from datetime import datetime, timedelta

from app.enums.author_type import AuthorType
from app.enums.chat_status import ChatStatus
from app.enums.message_status import MessageStatus
from app.enums.role import Role
from app.models import Chat, Message
from app.routers.chats import get_chat_messages_endpoint


def _seed_chat_with_tied_messages(db, make_user):
    """A chat whose messages include a created_at TIE between a client message and
    the AI reply that answered it (client inserted first → lower id)."""
    client = make_user(role=Role.USER)
    psychic = make_user(role=Role.USER)
    chat = Chat(user_id=client.id, psychic_id=psychic.id, status=ChatStatus.ACTIVE)
    db.add(chat)
    db.commit()
    db.refresh(chat)

    t0 = datetime(2026, 7, 17, 10, 0, 0)
    rows = [
        # (content, sender, author_type, created_at)  — inserted in this order → ascending id
        ("client: will he come back?", client.id, AuthorType.HUMAN_PSYCHIC, t0),
        ("ai: the cards say yes", psychic.id, AuthorType.AI_DRAFTED, t0),          # TIE with the client msg
        ("client: really?", client.id, AuthorType.HUMAN_PSYCHIC, t0 + timedelta(seconds=1)),
        ("ai: give it two weeks", psychic.id, AuthorType.AI_DRAFTED, t0 + timedelta(seconds=2)),
    ]
    ids = []
    for content, sender_id, atype, created in rows:
        m = Message(
            chat_id=chat.id, sender_id=sender_id, content=content,
            author_type=atype, status=MessageStatus.SENT, created_at=created,
        )
        db.add(m)
        db.commit()
        db.refresh(m)
        ids.append(m.id)
    # Sanity: ids ascend with insertion (so id is a valid send-order tiebreak).
    assert ids == sorted(ids)
    return client, chat, ids


def _call(chat_id, user, db, offset):
    resp = get_chat_messages_endpoint(chat_id=chat_id, offset=offset, user=user, db=db)
    return json.loads(resp.body)["messages"]


def test_standard_pagination_orders_by_created_at_then_id(db, make_user):
    client, chat, ids = _seed_chat_with_tied_messages(db, make_user)
    msgs = _call(chat.id, client, db, offset=0)
    # Deterministic oldest-first: created_at asc, id asc as the tiebreak.
    assert [m["id"] for m in msgs] == ids
    # The tied client message (lower id) is delivered ABOVE the AI reply that shares its timestamp.
    assert msgs[0]["content"].startswith("client:")
    assert msgs[1]["content"].startswith("ai:")
    assert msgs[0]["created_at"] == msgs[1]["created_at"]  # genuinely tied
    assert msgs[0]["id"] < msgs[1]["id"]


def test_negative_offset_latest_view_same_deterministic_order(db, make_user):
    client, chat, ids = _seed_chat_with_tied_messages(db, make_user)
    # Negative offset = "last N, oldest-first" (the app's initial latest view).
    msgs = _call(chat.id, client, db, offset=-100)
    assert [m["id"] for m in msgs] == ids
    assert msgs[0]["id"] < msgs[1]["id"]  # tie broken by send order, not reversed
