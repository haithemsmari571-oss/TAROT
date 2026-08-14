import asyncio
import os
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest


def _require_disposable_database():
    database_url = os.getenv("D32_POSTGRES_TEST_DATABASE_URL", "").strip()
    if not database_url:
        pytest.skip("D32 disposable PostgreSQL test is opt-in")
    if os.getenv("D32_POSTGRES_TEST_CONFIRM_DISPOSABLE") != "YES":
        raise AssertionError("D32 PostgreSQL test requires a disposable database")
    assert os.getenv("DATABASE_URL") == database_url
    assert database_url.rsplit("/", 1)[-1] == "tarot_d32"


def test_automatic_notification_and_newer_client_send_are_causally_ordered_postgresql(
    monkeypatch,
):
    _require_disposable_database()

    from app.database.client import SessionLocal
    from app.enums.chat_session_status import ChatSessionStatus
    from app.enums.chat_status import ChatStatus
    from app.enums.response_mode import ResponseMode
    from app.enums.role import Role
    from app.models.chat import Chat
    from app.models.chat_session import ChatSession
    from app.models.message import Message
    from app.models.reading_message_burst import ReadingMessageBurst
    from app.models.transaction import Transaction
    from app.models.user import User
    from app.routers.chats import manager
    from app.services import session_manager as session_manager_module
    from app.services.ai import reading_burst
    from app.services.chat.handlers.message_handler import MessageHandler

    reading_burst._message_flow_locks.clear()
    suffix = uuid4().hex
    with SessionLocal() as db:
        client = User(
            email=f"d32-client-{suffix}@example.invalid",
            username=f"d32-client-{suffix}",
            password_hash="synthetic",
            role=Role.USER,
            balance=37,
            credit_balance=3,
            is_verified=True,
        )
        psychic = User(
            email=f"d32-reader-{suffix}@example.invalid",
            username=f"d32-reader-{suffix}",
            password_hash="synthetic",
            role=Role.PSYCHIC,
            balance=11,
            credit_balance=2,
            price_per_second=0.1,
            is_verified=True,
        )
        db.add_all([client, psychic])
        db.flush()
        chat = Chat(
            user_id=client.id,
            psychic_id=psychic.id,
            status=ChatStatus.ACTIVE,
            response_mode=ResponseMode.SABRI,
            client_joined_at=datetime.now(timezone.utc),
        )
        db.add(chat)
        db.flush()
        session = ChatSession(chat_id=chat.id, status=ChatSessionStatus.ACTIVE)
        db.add(session)
        db.flush()
        trigger = Message(
            chat_id=chat.id,
            chat_session_id=session.id,
            sender_id=client.id,
            content="D32 first client message",
        )
        db.add(trigger)
        db.flush()
        db.add(
            ReadingMessageBurst(
                chat_session_id=session.id,
                chat_id=chat.id,
                latest_client_message_id=trigger.id,
                generation_version=3,
                status="DELIVERING",
                lease_owner="d32-owner",
                response_bubbles='["D32 older Automatic bubble"]',
                delivery_position=0,
            )
        )
        db.commit()
        ids = {
            "client": client.id,
            "psychic": psychic.id,
            "chat": chat.id,
            "session": session.id,
            "trigger": trigger.id,
        }

    claim = reading_burst._Claim(
        chat_session_id=ids["session"],
        chat_id=ids["chat"],
        client_id=ids["client"],
        psychic_id=ids["psychic"],
        mode=ResponseMode.SABRI.value,
        owner="d32-owner",
        version=3,
        through_message_id=ids["trigger"],
        contents=["D32 first client message"],
        response_bubbles=["D32 older Automatic bubble"],
    )
    automatic_committed = asyncio.Event()
    release_notification = asyncio.Event()
    notifications = []

    async def paused_automatic_notification(_db, _chat, message):
        automatic_committed.set()
        await release_notification.wait()
        notifications.append(message.content)

    async def record_client_notification(message, chat_id):
        assert chat_id == str(ids["chat"])
        notifications.append(message["content"])

    monkeypatch.setattr(
        "app.services.chats.broadcast_persisted_ai_message",
        paused_automatic_notification,
    )
    monkeypatch.setattr(manager, "send_to_chat", record_client_notification)
    monkeypatch.setattr(reading_burst, "_wake", lambda _session_id: None)
    prior_manager = session_manager_module.session_manager
    session_manager_module.session_manager = SimpleNamespace(
        active_sessions={
            ids["chat"]: SimpleNamespace(awaiting_join=False, is_grace=False)
        }
    )

    class Socket:
        async def send_json(self, _payload):
            return None

    async def scenario():
        automatic = asyncio.create_task(
            reading_burst._deliver_bubble(
                claim, "D32 older Automatic bubble", expected_position=0, total=1
            )
        )
        await automatic_committed.wait()
        client_db = SessionLocal()
        client_send = asyncio.create_task(
            MessageHandler(
                Socket(), client_db, ids["chat"], ids["client"]
            ).handle({"content": "D32 newer client message"})
        )
        await asyncio.sleep(0.05)
        with SessionLocal() as reader:
            assert (
                reader.query(Message)
                .filter(
                    Message.chat_session_id == ids["session"],
                    Message.sender_id == ids["client"],
                )
                .count()
                == 1
            )
        assert not client_send.done()
        release_notification.set()
        try:
            await asyncio.gather(automatic, client_send)
        finally:
            client_db.close()

    try:
        asyncio.run(scenario())
    finally:
        session_manager_module.session_manager = prior_manager

    assert notifications == [
        "D32 older Automatic bubble",
        "D32 newer client message",
    ]
    with SessionLocal() as db:
        row = db.get(ReadingMessageBurst, ids["session"])
        newer = (
            db.query(Message)
            .filter(
                Message.chat_session_id == ids["session"],
                Message.sender_id == ids["client"],
            )
            .order_by(Message.id.desc())
            .first()
        )
        assert newer.content == "D32 newer client message"
        assert row.completed_client_message_id == ids["trigger"]
        assert row.latest_client_message_id == newer.id
        assert row.status == "WAITING"
        assert (
            db.query(Transaction)
            .filter(Transaction.related_chat_id == ids["chat"])
            .count()
            == 0
        )
