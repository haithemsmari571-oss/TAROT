import asyncio
import os
from datetime import datetime, timezone
from uuid import uuid4

import pytest


def test_six_second_ordered_burst_and_billing_isolation_postgresql(monkeypatch):
    database_url = os.getenv("D25_POSTGRES_TEST_DATABASE_URL", "").strip()
    if not database_url:
        pytest.skip("D25_POSTGRES_TEST_DATABASE_URL is required")
    if os.getenv("D25_POSTGRES_TEST_CONFIRM_DISPOSABLE") != "YES":
        pytest.fail("D25 PostgreSQL test requires an explicitly disposable database")
    assert os.getenv("DATABASE_URL") == database_url
    assert database_url.rsplit("/", 1)[-1] == "tarot_d25"

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
    from app.services import chats as chats_service
    from app.services.ai import reading_burst, reading_duo, reading_executor
    from app.services.ai.reading_executor import ProportionalRevealConfig

    assert reading_burst.MESSAGE_BURST_SILENCE_SECONDS == 6.0
    suffix = uuid4().hex
    calls = []
    delivered = []

    async def fake_generate(_chat_id, turn, *_args, **_kwargs):
        calls.append(turn)
        return ["one PostgreSQL response"], "", "new"

    async def fake_broadcast(_db, _chat, message):
        delivered.append(message.id)

    monkeypatch.setattr(reading_burst, "_engine_config", lambda: (True, "two_role"))
    monkeypatch.setattr(reading_duo, "_duo_generate", fake_generate)
    monkeypatch.setattr(chats_service, "broadcast_persisted_ai_message", fake_broadcast)
    monkeypatch.setattr(
        reading_executor,
        "proportional_reveal_config_from_settings",
        lambda: ProportionalRevealConfig(
            per_word_ms=0, min_typing_ms=0, between_bubbles_ms=0
        ),
    )

    async def no_typing(*_args, **_kwargs):
        return None

    monkeypatch.setattr(reading_executor, "broadcast_typing", no_typing)

    with SessionLocal() as db:
        client = User(
            email=f"d25-client-{suffix}@example.invalid",
            username=f"d25-client-{suffix}",
            password_hash="synthetic",
            role=Role.USER,
            balance=37,
            credit_balance=0,
            is_verified=True,
        )
        psychic = User(
            email=f"d25-reader-{suffix}@example.invalid",
            username=f"d25-reader-{suffix}",
            password_hash="synthetic",
            role=Role.PSYCHIC,
            balance=11,
            credit_balance=0,
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
        db.commit()
        client_id = client.id
        psychic_id = psychic.id
        chat_id = chat.id
        session_id = session.id

    async def scenario():
        latest_message_id = None
        for number in range(10):
            with SessionLocal() as writer:
                message = Message(
                    chat_id=chat_id,
                    chat_session_id=session_id,
                    sender_id=client_id,
                    content=f"postgres-message-{number}",
                )
                writer.add(message)
                writer.commit()
                writer.refresh(message)
                latest_message_id = message.id
            await reading_burst.note_client_message(
                chat_id, session_id, latest_message_id
            )

        await asyncio.sleep(5.5)
        assert calls == []
        deadline = asyncio.get_running_loop().time() + 2.0
        while len(delivered) != 1 and asyncio.get_running_loop().time() < deadline:
            await asyncio.sleep(0.02)
        assert len(calls) == 1
        assert len(delivered) == 1
        await reading_burst.stop_burst_coordinator()
        return latest_message_id

    latest_message_id = asyncio.run(scenario())

    turn = calls[0]
    positions = [turn.index(f"postgres-message-{number}") for number in range(10)]
    assert positions == sorted(positions)
    assert all(turn.count(f"postgres-message-{number}") == 1 for number in range(10))

    with SessionLocal() as db:
        client = db.get(User, client_id)
        psychic = db.get(User, psychic_id)
        row = db.get(ReadingMessageBurst, session_id)
        assert float(client.balance) == 37
        assert float(psychic.balance) == 11
        assert (
            db.query(Transaction).filter(Transaction.related_chat_id == chat_id).count()
            == 0
        )
        assert row.latest_client_message_id == latest_message_id
        assert row.completed_client_message_id == latest_message_id
        assert row.generation_version == 10
        assert row.status == "IDLE"
        stored = (
            db.query(Message)
            .filter(
                Message.chat_session_id == session_id,
                Message.sender_id == client_id,
            )
            .order_by(Message.id)
            .all()
        )
        assert [message.content for message in stored] == [
            f"postgres-message-{number}" for number in range(10)
        ]
