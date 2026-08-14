"""Synthetic regression tests for exact product reading-session links."""

from __future__ import annotations

import asyncio

from app.enums.chat_session_status import ChatSessionStatus
from app.enums.chat_status import ChatStatus
from app.enums.role import Role
from app.models import Chat, ChatSession, Message, SessionInterval
from app.schemas.chat import ChatStart, MessageOut
from app.services.chats import (
    persist_ai_message,
    req_start_chat,
    save_message,
    save_system_message,
    start_new_chat_session,
    update_chat_status,
)
from app.services.ai.reading_steering import current_session


def _request(db, make_user):
    client = make_user(balance=100, role=Role.USER)
    psychic = make_user(role=Role.PSYCHIC)
    psychic.price_per_second = 0.05
    db.commit()

    chat_id = req_start_chat(
        db,
        client.id,
        ChatStart(psychic_id=psychic.id, message="synthetic request"),
    )
    return client, psychic, db.get(Chat, chat_id)


def test_request_accept_and_all_runtime_writes_share_one_session(db, make_user):
    client, psychic, chat = _request(db, make_user)
    request_message = db.query(Message).filter(Message.chat_id == chat.id).one()
    requested_session = db.get(ChatSession, request_message.chat_session_id)

    assert requested_session is not None
    assert requested_session.status == ChatSessionStatus.REQUESTED
    assert requested_session.chat_id == chat.id

    active_session = start_new_chat_session(db, chat.id)
    client_message = asyncio.run(
        save_message(db, {"content": "synthetic live message"}, client, chat)
    )
    system_message = save_system_message(db, chat.id, "synthetic system message")
    ai_message = persist_ai_message(db, chat, "synthetic drafted reply")

    assert active_session.id == requested_session.id
    assert active_session.status == ChatSessionStatus.ACTIVE
    assert current_session(db, chat.id).id == active_session.id
    assert db.query(SessionInterval).filter_by(session_id=active_session.id).count() == 1
    assert {
        request_message.chat_session_id,
        client_message.chat_session_id,
        system_message.chat_session_id,
        ai_message.chat_session_id,
    } == {active_session.id}
    assert MessageOut.model_validate(request_message).chat_session_id == active_session.id


def test_rejected_request_is_cancelled_without_a_billable_interval(db, make_user):
    _, _, chat = _request(db, make_user)
    request_message = db.query(Message).filter(Message.chat_id == chat.id).one()

    update_chat_status(db, chat.id, ChatStatus.ENDED)
    db.refresh(chat)
    rejected_session = db.get(ChatSession, request_message.chat_session_id)

    assert chat.status == ChatStatus.ENDED
    assert rejected_session is not None
    assert rejected_session.status == ChatSessionStatus.CANCELLED
    assert db.query(SessionInterval).filter_by(session_id=rejected_session.id).count() == 0
    assert current_session(db, chat.id) is None
