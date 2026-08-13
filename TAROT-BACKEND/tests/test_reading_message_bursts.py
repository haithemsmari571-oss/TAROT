import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy.orm import sessionmaker

from app.database import client as database_client
from app.enums.chat_session_status import ChatSessionStatus
from app.enums.chat_session_triggers import ChatSessionTrigger
from app.enums.chat_status import ChatStatus
from app.enums.response_mode import ResponseMode
from app.enums.role import Role
from app.models.ai_draft import AiDraft
from app.models.chat import Chat
from app.models.chat_session import ChatSession
from app.models.message import Message
from app.models.reading_message_burst import ReadingMessageBurst
from app.models.session_intervals import SessionInterval
from app.models.transaction import Transaction
from app.services.ai import reading_burst, reading_duo, reading_executor
from app.services.ai.reading_executor import ProportionalRevealConfig


def _install_db(monkeypatch, db):
    factory = sessionmaker(bind=db.get_bind(), expire_on_commit=False)
    monkeypatch.setattr(database_client, "SessionLocal", factory)
    return factory


def _seed_reading(db, make_user, mode=ResponseMode.SABRI):
    client = make_user(balance=100)
    psychic = make_user(role=Role.PSYCHIC)
    psychic.price_per_second = 0.1
    chat = Chat(
        user_id=client.id,
        psychic_id=psychic.id,
        status=ChatStatus.ACTIVE,
        response_mode=mode,
    )
    db.add(chat)
    db.flush()
    session = ChatSession(chat_id=chat.id, status=ChatSessionStatus.ACTIVE)
    db.add(session)
    db.flush()
    interval = SessionInterval(
        session_id=session.id,
        started_at=datetime.now(),
        trigger_event=ChatSessionTrigger.INITIAL_START,
    )
    db.add(interval)
    db.commit()
    return client, psychic, chat, session, interval


def _client_message(db, chat, session, client, content):
    message = Message(
        chat_id=chat.id,
        chat_session_id=session.id,
        sender_id=client.id,
        content=content,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


async def _wait_until(predicate, timeout=2.0):
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while loop.time() < deadline:
        if predicate():
            return
        await asyncio.sleep(0.005)
    raise AssertionError("condition did not become true")


def _reader_message_count(factory, session_id, reader_id):
    with factory() as reader:
        return (
            reader.query(Message)
            .filter(
                Message.chat_session_id == session_id,
                Message.sender_id == reader_id,
            )
            .count()
        )


@pytest.fixture(autouse=True)
def _burst_globals(monkeypatch):
    reading_burst._tasks.clear()
    reading_burst._wake_events.clear()
    reading_burst._generating.clear()
    reading_burst._stopping = False
    monkeypatch.setattr(reading_burst, "MESSAGE_BURST_SILENCE_SECONDS", 0.08)
    monkeypatch.setattr(reading_burst, "CLIENT_TYPING_EXPIRY_SECONDS", 0.12)
    monkeypatch.setattr(reading_burst, "GENERATION_LEASE_SECONDS", 0.4)
    monkeypatch.setattr(reading_burst, "GENERATION_HEARTBEAT_SECONDS", 0.05)
    monkeypatch.setattr(reading_burst, "_engine_config", lambda: (True, "two_role"))
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
    monkeypatch.setattr(
        "app.notification_manager.notification_manager.is_user_connected",
        lambda _user_id: True,
    )
    store = __import__(
        "app.services.ai.reading_session", fromlist=["get_session_store"]
    ).get_session_store()
    store._sessions.clear()
    store._db_ok = None
    yield


def test_ten_messages_wait_for_silence_and_reach_valentina_once_in_order(
    db, make_user, monkeypatch
):
    factory = _install_db(monkeypatch, db)
    client, _psychic, chat, session, _interval = _seed_reading(db, make_user)
    calls = []

    async def fake_generate(_chat_id, turn, *_args, **_kwargs):
        calls.append(turn)
        return ["one complete response"], "", "new"

    monkeypatch.setattr(reading_duo, "_duo_generate", fake_generate)

    async def scenario():
        for number in range(10):
            with factory() as writer:
                message = _client_message(
                    writer, chat, session, client, f"message-{number}"
                )
            await reading_burst.note_client_message(chat.id, session.id, message.id)
            await asyncio.sleep(0.01)
            assert calls == []
        await asyncio.sleep(0.04)
        assert calls == []
        await _wait_until(lambda: len(calls) == 1)
        await _wait_until(
            lambda: _reader_message_count(factory, session.id, chat.psychic_id) == 1
        )
        await reading_burst.stop_burst_coordinator()

    asyncio.run(scenario())
    assert reading_burst.MESSAGE_BURST_SILENCE_SECONDS == 0.08
    turn = calls[0]
    positions = [turn.index(f"message-{number}") for number in range(10)]
    assert positions == sorted(positions)
    assert all(turn.count(f"message-{number}") == 1 for number in range(10))
    stored = (
        db.query(Message)
        .filter(
            Message.chat_session_id == session.id,
            Message.sender_id == client.id,
        )
        .order_by(Message.id)
        .all()
    )
    assert [message.content for message in stored] == [
        f"message-{number}" for number in range(10)
    ]


def test_typing_holds_the_burst_and_stuck_signal_expires(db, make_user, monkeypatch):
    _install_db(monkeypatch, db)
    client, _psychic, chat, session, _interval = _seed_reading(db, make_user)
    calls = []

    async def fake_generate(_chat_id, turn, *_args, **_kwargs):
        calls.append(turn)
        return ["reply"], "", "new"

    monkeypatch.setattr(reading_duo, "_duo_generate", fake_generate)

    async def scenario():
        message = _client_message(db, chat, session, client, "still composing")
        await reading_burst.note_client_message(chat.id, session.id, message.id)
        await reading_burst.note_client_typing(chat.id, client.id, "socket-a", True)
        await asyncio.sleep(0.1)
        assert calls == []
        # No typing_stop: the server-side lease must expire safely.
        await _wait_until(lambda: len(calls) == 1)
        await reading_burst.stop_burst_coordinator()

    asyncio.run(scenario())


def test_message_during_generation_discards_stale_output_and_regenerates_complete_turn(
    db, make_user, monkeypatch
):
    _install_db(monkeypatch, db)
    client, _psychic, chat, session, _interval = _seed_reading(db, make_user)
    started = asyncio.Event()
    release = asyncio.Event()
    calls = []
    active = 0
    max_active = 0

    async def fake_generate(_chat_id, turn, *_args, **_kwargs):
        nonlocal active, max_active
        active += 1
        max_active = max(max_active, active)
        calls.append(turn)
        try:
            if len(calls) == 1:
                started.set()
                await release.wait()
                return ["stale response"], "", "new"
            return ["fresh response"], "", "new"
        finally:
            active -= 1

    monkeypatch.setattr(reading_duo, "_duo_generate", fake_generate)

    async def scenario():
        first = _client_message(db, chat, session, client, "first part")
        await reading_burst.note_client_message(chat.id, session.id, first.id)
        await started.wait()
        second = _client_message(db, chat, session, client, "second part")
        await reading_burst.note_client_message(chat.id, session.id, second.id)
        await asyncio.sleep(0.1)
        assert len(calls) == 1  # the stale provider call still owns the durable lease
        release.set()
        await _wait_until(lambda: len(calls) == 2)
        await _wait_until(
            lambda: (
                db.query(Message)
                .filter(
                    Message.chat_session_id == session.id,
                    Message.sender_id == chat.psychic_id,
                )
                .count()
                == 1
            )
        )
        await reading_burst.stop_burst_coordinator()

    asyncio.run(scenario())
    assert max_active == 1
    assert "first part" in calls[1] and "second part" in calls[1]
    replies = db.query(Message).filter(Message.sender_id == chat.psychic_id).all()
    assert [message.content for message in replies] == ["fresh response"]


def test_new_message_cancels_only_unsent_sabri_bubbles(db, make_user, monkeypatch):
    _install_db(monkeypatch, db)
    client, _psychic, chat, session, _interval = _seed_reading(db, make_user)
    generation_count = 0
    monkeypatch.setattr(
        reading_executor,
        "proportional_reveal_config_from_settings",
        lambda: ProportionalRevealConfig(
            per_word_ms=0, min_typing_ms=0, between_bubbles_ms=300
        ),
    )

    async def fake_generate(_chat_id, _turn, *_args, **_kwargs):
        nonlocal generation_count
        generation_count += 1
        if generation_count == 1:
            return ["delivered first", "unsent second", "unsent third"], "", "new"
        return ["replacement response"], "", "new"

    monkeypatch.setattr(reading_duo, "_duo_generate", fake_generate)

    async def scenario():
        first = _client_message(db, chat, session, client, "opening burst")
        await reading_burst.note_client_message(chat.id, session.id, first.id)
        await _wait_until(
            lambda: (
                db.query(Message)
                .filter(
                    Message.sender_id == chat.psychic_id,
                    Message.content == "delivered first",
                )
                .count()
                == 1
            )
        )
        interruption = _client_message(db, chat, session, client, "new context")
        await reading_burst.note_client_message(chat.id, session.id, interruption.id)
        await _wait_until(
            lambda: (
                db.query(Message)
                .filter(
                    Message.sender_id == chat.psychic_id,
                    Message.content == "replacement response",
                )
                .count()
                == 1
            )
        )
        await reading_burst.stop_burst_coordinator()

    asyncio.run(scenario())
    replies = [
        row.content
        for row in db.query(Message)
        .filter(Message.sender_id == chat.psychic_id)
        .order_by(Message.id)
        .all()
    ]
    assert replies == ["delivered first", "replacement response"]


def test_manual_hybrid_and_automatic_modes_keep_their_contracts(
    db, make_user, monkeypatch
):
    _install_db(monkeypatch, db)
    generated = []

    async def fake_auto(_chat_id, turn, *_args, **_kwargs):
        generated.append(("auto", turn))
        return ["automatic reply"], "", "new"

    async def fake_writer(_chat_id, turn, *_args, **_kwargs):
        generated.append(("hybrid", turn))
        return "one review draft"

    monkeypatch.setattr(reading_duo, "_duo_generate", fake_auto)
    monkeypatch.setattr(reading_duo, "_write_valentina_turn", fake_writer)
    seeded = [
        _seed_reading(db, make_user, ResponseMode.HUMAN),
        _seed_reading(db, make_user, ResponseMode.HYBRID),
        _seed_reading(db, make_user, ResponseMode.SABRI),
    ]

    async def scenario():
        for client, _psychic, chat, session, _interval in seeded:
            message = _client_message(
                db, chat, session, client, chat.response_mode.value
            )
            await reading_burst.note_client_message(chat.id, session.id, message.id)
        await _wait_until(lambda: len(generated) == 2)
        await _wait_until(lambda: db.query(AiDraft).count() == 1)
        await reading_burst.stop_burst_coordinator()

    asyncio.run(scenario())
    human = seeded[0][2]
    hybrid = seeded[1][2]
    automatic = seeded[2][2]
    assert all(human.response_mode.value not in turn for _kind, turn in generated)
    assert db.query(AiDraft).filter(AiDraft.chat_id == hybrid.id).count() == 1
    assert db.query(Message).filter(Message.sender_id == hybrid.psychic_id).count() == 0
    assert (
        db.query(Message).filter(Message.sender_id == automatic.psychic_id).count() == 1
    )


def test_recovery_and_concurrent_wakes_resume_without_duplicate_response(
    db, make_user, monkeypatch
):
    _install_db(monkeypatch, db)
    client, _psychic, chat, session, _interval = _seed_reading(db, make_user)
    first = _client_message(db, chat, session, client, "restart-safe burst")
    already = Message(
        chat_id=chat.id,
        chat_session_id=session.id,
        sender_id=chat.psychic_id,
        content="already delivered bubble",
    )
    db.add(already)
    db.flush()
    row = ReadingMessageBurst(
        chat_session_id=session.id,
        chat_id=chat.id,
        latest_client_message_id=first.id,
        generation_version=7,
        status="DELIVERING",
        silence_until=reading_burst._now() - timedelta(seconds=1),
        response_bubbles='["already delivered bubble", "remaining bubble"]',
        response_reserve="",
        response_route="new",
        delivery_position=1,
    )
    db.add(row)
    db.commit()

    async def scenario():
        await asyncio.gather(
            reading_burst.start_burst_coordinator(),
            reading_burst.start_burst_coordinator(),
        )
        for _ in range(20):
            reading_burst._wake(session.id)
        await _wait_until(
            lambda: (
                db.query(Message)
                .filter(
                    Message.chat_session_id == session.id,
                    Message.sender_id == chat.psychic_id,
                )
                .count()
                == 2
            )
        )
        await asyncio.sleep(0.1)
        await reading_burst.stop_burst_coordinator()

    asyncio.run(scenario())
    replies = [
        message.content
        for message in db.query(Message)
        .filter(
            Message.chat_session_id == session.id,
            Message.sender_id == chat.psychic_id,
        )
        .order_by(Message.id)
        .all()
    ]
    assert replies == ["already delivered bubble", "remaining bubble"]


def test_active_session_message_burst_does_not_change_billing(
    db, make_user, monkeypatch
):
    _install_db(monkeypatch, db)
    client, _psychic, chat, session, interval = _seed_reading(
        db, make_user, ResponseMode.HUMAN
    )
    from app.services import session_manager as session_manager_module
    from app.services.chat.handlers.message_handler import MessageHandler

    prior_manager = session_manager_module.session_manager
    session_manager_module.session_manager = SimpleNamespace(
        active_sessions={chat.id: SimpleNamespace(awaiting_join=False, is_grace=False)}
    )

    class Socket:
        async def send_json(self, _payload):
            return None

    balance_before = float(client.balance)
    transaction_count = db.query(Transaction).count()
    interval_count = db.query(SessionInterval).count()
    try:
        asyncio.run(
            MessageHandler(Socket(), db, chat.id, client.id).handle(
                {"content": "billing must stay unchanged"}
            )
        )
    finally:
        session_manager_module.session_manager = prior_manager
    db.refresh(client)
    db.refresh(interval)
    assert float(client.balance) == balance_before
    assert db.query(Transaction).count() == transaction_count
    assert db.query(SessionInterval).count() == interval_count
    assert interval.ended_at is None
