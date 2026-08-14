import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy.orm import sessionmaker

from app.database import client as database_client
from app.enums.ai_draft_status import AiDraftStatus
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


def _pending_hybrid_draft(db, chat, session, trigger, *, completed_id=None):
    row = ReadingMessageBurst(
        chat_session_id=session.id,
        chat_id=chat.id,
        latest_client_message_id=trigger.id,
        completed_client_message_id=completed_id,
        generation_version=1,
        status="PENDING_REVIEW",
    )
    draft = AiDraft(
        chat_id=chat.id,
        client_message_id=trigger.id,
        mode=ResponseMode.HYBRID,
        draft_text="pending review draft",
        status=AiDraftStatus.PENDING,
    )
    db.add_all([row, draft])
    db.commit()
    db.refresh(draft)
    return row, draft


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
    getattr(reading_burst, "_message_flow_locks", {}).clear()
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


def test_hybrid_boundary_completes_only_after_edited_draft_is_sent(
    db, make_user, monkeypatch
):
    factory = _install_db(monkeypatch, db)
    client, psychic, chat, session, interval = _seed_reading(
        db, make_user, ResponseMode.HYBRID
    )
    admin = make_user(role=Role.SUPERADMIN)
    turns = []
    balances_before = (
        float(client.balance),
        float(client.credit_balance),
        float(psychic.balance),
        float(psychic.credit_balance),
    )
    interval_before = (interval.started_at, interval.ended_at)
    transaction_count = db.query(Transaction).count()

    async def fake_writer(_chat_id, turn, *_args, **_kwargs):
        turns.append(turn)
        return f"review draft {len(turns)}"

    async def no_broadcast(*_args, **_kwargs):
        return None

    monkeypatch.setattr(reading_duo, "_write_valentina_turn", fake_writer)
    monkeypatch.setattr(
        "app.services.chats.broadcast_persisted_ai_message", no_broadcast
    )

    async def scenario():
        original = []
        for number in range(10):
            message = _client_message(
                db, chat, session, client, f"hybrid-message-{number}"
            )
            original.append(message)
            await reading_burst.note_client_message(chat.id, session.id, message.id)
        await _wait_until(lambda: db.query(AiDraft).count() == 1)
        db.expire_all()
        row = db.get(ReadingMessageBurst, session.id)
        first_draft = db.query(AiDraft).order_by(AiDraft.id).first()
        assert row.status == "PENDING_REVIEW"
        assert row.completed_client_message_id is None

        # A new message invalidates the unfinished review draft and regenerates
        # from all eleven unanswered rows, not merely the latest one.
        latest = _client_message(db, chat, session, client, "hybrid-message-10")
        await reading_burst.note_client_message(chat.id, session.id, latest.id)
        db.expire_all()
        assert first_draft.status.value == "DISCARDED"
        await _wait_until(lambda: len(turns) == 2)
        await _wait_until(
            lambda: db.query(AiDraft).filter(AiDraft.status == "PENDING").count()
            == 1
        )
        expected_turn = reading_burst.format_client_turn(
            [f"hybrid-message-{number}" for number in range(11)]
        )
        assert turns[1] == expected_turn

        from app.routers.reading_ai import discard_draft, generate_draft, send_draft
        from app.schemas.reading_ai import DraftSend

        current = db.query(AiDraft).filter(AiDraft.status == "PENDING").one()
        discarded = discard_draft(chat.id, current.id, user=admin, db=db)
        assert discarded.status_code == 200
        db.expire_all()
        row = db.get(ReadingMessageBurst, session.id)
        assert row.status == "AWAITING_REGEN"
        assert row.completed_client_message_id is None

        regenerated = await generate_draft(chat.id, user=admin, db=db)
        assert regenerated.status_code == 202
        await _wait_until(lambda: len(turns) == 3)
        await _wait_until(
            lambda: db.query(AiDraft).filter(AiDraft.status == "PENDING").count()
            == 1
        )
        await _wait_until(lambda: not reading_burst.is_generating(chat.id))
        assert turns[2] == turns[1]

        db.expire_all()
        final_draft = db.query(AiDraft).filter(AiDraft.status == "PENDING").one()
        row = db.get(ReadingMessageBurst, session.id)
        current_session = (
            db.query(ChatSession)
            .filter(ChatSession.chat_id == chat.id)
            .order_by(ChatSession.id.desc())
            .first()
        )
        latest_non_system = (
            db.query(Message)
            .filter(
                Message.chat_session_id == session.id,
                Message.is_system.is_(False),
            )
            .order_by(Message.id.desc())
            .first()
        )
        assert (
            row.status,
            row.latest_client_message_id,
            row.completed_client_message_id,
            final_draft.client_message_id,
            final_draft.status,
            final_draft.mode,
            current_session.id,
            current_session.status,
            latest_non_system.id,
        ) == (
            "PENDING_REVIEW",
            latest.id,
            None,
            latest.id,
            AiDraftStatus.PENDING,
            ResponseMode.HYBRID,
            session.id,
            ChatSessionStatus.ACTIVE,
            latest.id,
        )
        sent = await send_draft(
            chat.id,
            final_draft.id,
            DraftSend(content="owner-edited Hybrid response"),
            user=admin,
            db=db,
        )
        assert sent.status_code == 200, sent.body
        db.expire_all()
        row = db.get(ReadingMessageBurst, session.id)
        assert row.status == "IDLE"
        assert row.completed_client_message_id == latest.id
        await reading_burst.stop_burst_coordinator()

    asyncio.run(scenario())

    from app.services.ai.reading_session import get_session_store

    state = get_session_store().get(f"chat:{chat.id}")
    assert state is not None
    assert [entry["role"] for entry in state.chat_transcript] == ["client", "logan"]
    assert state.chat_transcript[0]["content"] == turns[-1]
    assert state.chat_transcript[1]["content"] == "owner-edited Hybrid response"
    db.expire_all()
    client = db.get(type(client), client.id)
    psychic = db.get(type(psychic), psychic.id)
    interval = db.get(SessionInterval, interval.id)
    session = db.get(ChatSession, session.id)
    chat = db.get(Chat, chat.id)
    assert (
        float(client.balance),
        float(client.credit_balance),
        float(psychic.balance),
        float(psychic.credit_balance),
    ) == balances_before
    assert (interval.started_at, interval.ended_at) == interval_before
    assert session.status == ChatSessionStatus.ACTIVE
    assert chat.status == ChatStatus.ACTIVE
    assert db.query(Transaction).count() == transaction_count
    drafts = db.query(AiDraft).filter(AiDraft.chat_id == chat.id).order_by(AiDraft.id).all()
    assert [draft.status for draft in drafts] == [
        AiDraftStatus.DISCARDED,
        AiDraftStatus.DISCARDED,
        AiDraftStatus.SENT,
    ]
    reader_messages = (
        db.query(Message)
        .filter(
            Message.chat_session_id == session.id,
            Message.sender_id == psychic.id,
        )
        .all()
    )
    assert [message.content for message in reader_messages] == [
        "owner-edited Hybrid response"
    ]


def test_hybrid_send_refuses_a_newer_committed_client_message_before_notification(
    db, make_user, monkeypatch
):
    _install_db(monkeypatch, db)
    client, _psychic, chat, session, _interval = _seed_reading(
        db, make_user, ResponseMode.HYBRID
    )
    admin = make_user(role=Role.SUPERADMIN)
    original = _client_message(db, chat, session, client, "original question")
    row, draft = _pending_hybrid_draft(db, chat, session, original)
    newer = _client_message(db, chat, session, client, "newer detail")

    async def no_broadcast(*_args, **_kwargs):
        raise AssertionError("a stale draft must never be broadcast")

    monkeypatch.setattr(
        "app.services.chats.broadcast_persisted_ai_message", no_broadcast
    )

    from app.routers.reading_ai import send_draft
    from app.schemas.reading_ai import DraftSend

    response = asyncio.run(
        send_draft(
            chat.id,
            draft.id,
            DraftSend(content="stale reply"),
            user=admin,
            db=db,
        )
    )
    assert response.status_code == 409
    db.expire_all()
    assert db.get(AiDraft, draft.id).status == AiDraftStatus.DISCARDED
    assert db.get(ReadingMessageBurst, session.id).status == "AWAITING_REGEN"
    assert (
        db.query(Message)
        .filter(
            Message.chat_session_id == session.id,
            Message.sender_id == chat.psychic_id,
        )
        .count()
        == 0
    )
    assert newer.id > row.latest_client_message_id


def _seed_d30_coalesced_pending_memory(db, chat, session, client, psychic):
    from app.services.ai.reading_session import (
        get_session_store,
        record_client_message,
        record_sent_message,
    )

    answered = _client_message(db, chat, session, client, "already answered question")
    answered_reply = Message(
        chat_id=chat.id,
        chat_session_id=session.id,
        sender_id=psychic.id,
        content="already delivered answer",
    )
    db.add(answered_reply)
    db.commit()
    parts = [
        _client_message(db, chat, session, client, "legacy first part"),
        _client_message(db, chat, session, client, "legacy second part"),
        _client_message(db, chat, session, client, "legacy final part"),
    ]
    turn = reading_burst.format_client_turn([message.content for message in parts])
    row, draft = _pending_hybrid_draft(db, chat, session, parts[-1])
    row.status = "IDLE"
    row.completed_client_message_id = parts[-1].id
    db.commit()

    store = get_session_store()
    state = store.get_or_create(
        f"chat:{chat.id}", client_id=client.id, chat_id=chat.id
    )
    record_client_message(state, answered.content)
    record_sent_message(state, answered_reply.content)
    # This is D30's pre-send behavior: generation already persisted the entire
    # coalesced turn even though its draft was still waiting for owner review.
    record_client_message(state, turn)
    store.put(state)
    return answered, parts, turn, row, draft


def test_d30_coalesced_pending_hybrid_draft_sends_without_duplicate_memory(
    db, make_user, monkeypatch
):
    _install_db(monkeypatch, db)
    client, psychic, chat, session, _interval = _seed_reading(
        db, make_user, ResponseMode.HYBRID
    )
    admin = make_user(role=Role.SUPERADMIN)
    _answered, parts, turn, _row, draft = _seed_d30_coalesced_pending_memory(
        db, chat, session, client, psychic
    )

    async def no_broadcast(*_args, **_kwargs):
        return None

    monkeypatch.setattr(
        "app.services.chats.broadcast_persisted_ai_message", no_broadcast
    )
    from app.routers.reading_ai import send_draft
    from app.schemas.reading_ai import DraftSend
    from app.services.ai.reading_session import get_session_store

    response = asyncio.run(
        send_draft(chat.id, draft.id, DraftSend(), user=admin, db=db)
    )
    assert response.status_code == 200
    db.expire_all()
    row = db.get(ReadingMessageBurst, session.id)
    assert db.get(AiDraft, draft.id).status == AiDraftStatus.SENT
    assert row.status == "IDLE"
    assert row.completed_client_message_id == parts[-1].id
    state = get_session_store().get(f"chat:{chat.id}")
    current_entries = [
        entry
        for entry in state.chat_transcript
        if entry.get("role") == "client" and entry.get("content") == turn
    ]
    assert len(current_entries) == 1
    assert state.chat_transcript[-1]["content"] == draft.draft_text


def test_d30_coalesced_discard_regenerate_send_keeps_one_client_memory_entry(
    db, make_user, monkeypatch
):
    _install_db(monkeypatch, db)
    client, psychic, chat, session, _interval = _seed_reading(
        db, make_user, ResponseMode.HYBRID
    )
    admin = make_user(role=Role.SUPERADMIN)
    answered, parts, turn, _row, draft = _seed_d30_coalesced_pending_memory(
        db, chat, session, client, psychic
    )
    writer_turns = []
    writer_client_counts = []

    async def fake_writer(_chat_id, pending_turn, _trigger, state, *_args, **_kwargs):
        writer_turns.append(pending_turn)
        writer_client_counts.append(
            sum(
                entry.get("role") == "client" and entry.get("content") == turn
                for entry in state.chat_transcript
            )
        )
        return "regenerated legacy draft"

    async def no_broadcast(*_args, **_kwargs):
        return None

    monkeypatch.setattr(reading_duo, "_write_valentina_turn", fake_writer)
    monkeypatch.setattr(
        "app.services.chats.broadcast_persisted_ai_message", no_broadcast
    )
    from app.routers.reading_ai import discard_draft, generate_draft, send_draft
    from app.schemas.reading_ai import DraftSend
    from app.services.ai.reading_session import get_session_store

    async def scenario():
        discarded = discard_draft(chat.id, draft.id, user=admin, db=db)
        assert discarded.status_code == 200
        db.expire_all()
        row = db.get(ReadingMessageBurst, session.id)
        assert row.status == "AWAITING_REGEN"
        assert row.completed_client_message_id == answered.id

        regenerated = await generate_draft(chat.id, user=admin, db=db)
        assert regenerated.status_code == 202
        await _wait_until(lambda: len(writer_turns) == 1)
        await _wait_until(
            lambda: db.query(AiDraft)
            .filter(AiDraft.chat_id == chat.id, AiDraft.status == AiDraftStatus.PENDING)
            .count()
            == 1
        )
        await _wait_until(lambda: not reading_burst.is_generating(chat.id))
        db.expire_all()
        fresh = (
            db.query(AiDraft)
            .filter(AiDraft.chat_id == chat.id, AiDraft.status == AiDraftStatus.PENDING)
            .one()
        )
        sent = await send_draft(
            chat.id, fresh.id, DraftSend(), user=admin, db=db
        )
        assert sent.status_code == 200
        await reading_burst.stop_burst_coordinator()

    asyncio.run(scenario())
    assert writer_turns == [turn]
    assert writer_client_counts == [1]
    state = get_session_store().get(f"chat:{chat.id}")
    current_entries = [
        entry
        for entry in state.chat_transcript
        if entry.get("role") == "client" and entry.get("content") == turn
    ]
    assert len(current_entries) == 1
    assert state.chat_transcript[-1]["content"] == "regenerated legacy draft"
    db.expire_all()
    row = db.get(ReadingMessageBurst, session.id)
    assert row.status == "IDLE"
    assert row.completed_client_message_id == parts[-1].id


def test_manual_reader_reply_discards_pending_hybrid_and_closes_complete_turn(
    db, make_user, monkeypatch
):
    _install_db(monkeypatch, db)
    client, psychic, chat, session, _interval = _seed_reading(
        db, make_user, ResponseMode.HYBRID
    )
    first = _client_message(db, chat, session, client, "first question")
    second = _client_message(db, chat, session, client, "second detail")
    _row, draft = _pending_hybrid_draft(db, chat, session, second)
    reply = Message(
        chat_id=chat.id,
        chat_session_id=session.id,
        sender_id=psychic.id,
        content="manual reader reply",
    )
    db.add(reply)
    db.commit()
    db.refresh(reply)

    async def scenario():
        turn = await reading_burst.note_reader_message(chat.id, session.id, reply.id)
        await reading_burst.stop_burst_coordinator()
        return turn

    turn, automatic_already_recorded = asyncio.run(scenario())
    assert automatic_already_recorded is False
    assert turn == reading_burst.format_client_turn(
        [first.content, second.content]
    )
    db.expire_all()
    row = db.get(ReadingMessageBurst, session.id)
    assert row.completed_client_message_id == second.id
    assert row.status == "IDLE"
    assert db.get(AiDraft, draft.id).status == AiDraftStatus.DISCARDED


def test_mode_change_discards_pending_hybrid_draft(db, make_user, monkeypatch):
    _install_db(monkeypatch, db)
    client, _psychic, chat, session, _interval = _seed_reading(
        db, make_user, ResponseMode.HYBRID
    )
    trigger = _client_message(db, chat, session, client, "unanswered")
    _row, draft = _pending_hybrid_draft(db, chat, session, trigger)
    chat.response_mode = ResponseMode.HUMAN
    db.commit()

    async def scenario():
        await reading_burst.note_mode_change(chat.id, db=db)
        await reading_burst.stop_burst_coordinator()

    asyncio.run(scenario())
    db.expire_all()
    assert db.get(AiDraft, draft.id).status == AiDraftStatus.DISCARDED
    row = db.get(ReadingMessageBurst, session.id)
    assert row.completed_client_message_id is None
    assert row.status == "WAITING"


def test_pending_hybrid_review_survives_restart_without_duplicate_generation(
    db, make_user, monkeypatch
):
    _install_db(monkeypatch, db)
    client, _psychic, chat, session, _interval = _seed_reading(
        db, make_user, ResponseMode.HYBRID
    )
    trigger = _client_message(db, chat, session, client, "awaiting review")
    _pending_hybrid_draft(db, chat, session, trigger)
    calls = []

    async def fake_writer(*_args, **_kwargs):
        calls.append(True)
        return "duplicate"

    monkeypatch.setattr(reading_duo, "_write_valentina_turn", fake_writer)

    async def scenario():
        await reading_burst.start_burst_coordinator()
        await asyncio.sleep(0.02)
        await reading_burst.stop_burst_coordinator()

    asyncio.run(scenario())
    assert calls == []
    assert db.query(AiDraft).filter(AiDraft.chat_id == chat.id).count() == 1


def test_hybrid_send_refuses_a_draft_from_an_old_session(
    db, make_user, monkeypatch
):
    _install_db(monkeypatch, db)
    client, _psychic, chat, old_session, _interval = _seed_reading(
        db, make_user, ResponseMode.HYBRID
    )
    admin = make_user(role=Role.SUPERADMIN)
    trigger = _client_message(db, chat, old_session, client, "old session question")
    _row, draft = _pending_hybrid_draft(db, chat, old_session, trigger)
    old_session.status = ChatSessionStatus.COMPLETED
    db.add(ChatSession(chat_id=chat.id, status=ChatSessionStatus.ACTIVE))
    db.commit()

    async def no_broadcast(*_args, **_kwargs):
        raise AssertionError("an old-session draft must never be broadcast")

    monkeypatch.setattr(
        "app.services.chats.broadcast_persisted_ai_message", no_broadcast
    )
    from app.routers.reading_ai import send_draft
    from app.schemas.reading_ai import DraftSend

    response = asyncio.run(
        send_draft(
            chat.id,
            draft.id,
            DraftSend(content="old reply"),
            user=admin,
            db=db,
        )
    )
    assert response.status_code == 409
    db.expire_all()
    assert db.get(AiDraft, draft.id).status == AiDraftStatus.DISCARDED


def test_double_regeneration_request_is_durably_idempotent(
    db, make_user, monkeypatch
):
    _install_db(monkeypatch, db)
    client, _psychic, chat, session, _interval = _seed_reading(
        db, make_user, ResponseMode.HYBRID
    )
    trigger = _client_message(db, chat, session, client, "regenerate once")
    wakes = []
    monkeypatch.setattr(reading_burst, "_wake", lambda sid: wakes.append(sid))

    assert reading_burst.request_hybrid_regeneration(chat.id) is True
    db.expire_all()
    first_version = db.get(ReadingMessageBurst, session.id).generation_version
    assert reading_burst.request_hybrid_regeneration(chat.id) is True
    db.expire_all()
    row = db.get(ReadingMessageBurst, session.id)
    assert row.generation_version == first_version
    assert row.latest_client_message_id == trigger.id
    assert row.status == "WAITING"
    assert wakes == [session.id, session.id]


def test_sabri_fallback_draft_keeps_legacy_manual_send_path(
    db, make_user, monkeypatch
):
    _install_db(monkeypatch, db)
    client, psychic, chat, session, interval = _seed_reading(
        db, make_user, ResponseMode.SABRI
    )
    admin = make_user(role=Role.SUPERADMIN)
    trigger = _client_message(db, chat, session, client, "fallback question")
    draft = AiDraft(
        chat_id=chat.id,
        client_message_id=trigger.id,
        mode=ResponseMode.SABRI,
        draft_text="fallback answer",
        status=AiDraftStatus.PENDING,
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    balance_before = (client.balance, client.credit_balance, psychic.balance)
    interval_before = (interval.started_at, interval.ended_at)

    async def no_broadcast(*_args, **_kwargs):
        return None

    monkeypatch.setattr(
        "app.services.chats.broadcast_persisted_ai_message", no_broadcast
    )
    from app.routers.reading_ai import send_draft
    from app.schemas.reading_ai import DraftSend

    response = asyncio.run(
        send_draft(chat.id, draft.id, DraftSend(), user=admin, db=db)
    )
    assert response.status_code == 200
    db.expire_all()
    assert db.get(AiDraft, draft.id).status == AiDraftStatus.SENT
    delivered = (
        db.query(Message)
        .filter(
            Message.chat_session_id == session.id,
            Message.sender_id == psychic.id,
        )
        .one()
    )
    assert delivered.content == "fallback answer"
    assert (client.balance, client.credit_balance, psychic.balance) == balance_before
    assert (interval.started_at, interval.ended_at) == interval_before
    assert db.query(Transaction).filter(Transaction.related_chat_id == chat.id).count() == 0


def test_manual_reply_during_automatic_reveal_does_not_duplicate_client_memory(
    db, make_user, monkeypatch
):
    _install_db(monkeypatch, db)
    client, psychic, chat, session, _interval = _seed_reading(
        db, make_user, ResponseMode.SABRI
    )
    trigger = _client_message(db, chat, session, client, "automatic question")
    row = ReadingMessageBurst(
        chat_session_id=session.id,
        chat_id=chat.id,
        latest_client_message_id=trigger.id,
        generation_version=1,
        status="DELIVERING",
        response_bubbles='["first bubble", "second bubble"]',
        delivery_position=1,
    )
    db.add(row)
    db.commit()

    from app.services.ai.reading_session import (
        get_session_store,
        record_client_message,
        record_sent_message,
    )

    turn = reading_burst.format_client_turn([trigger.content])
    store = get_session_store()
    state = store.get_or_create(
        f"chat:{chat.id}", client_id=client.id, chat_id=chat.id
    )
    record_client_message(state, turn)
    record_sent_message(state, "first bubble")
    store.put(state)

    from app.routers.chats import manager
    from app.services.chat.handlers.message_handler import MessageHandler

    async def no_broadcast(*_args, **_kwargs):
        return None

    monkeypatch.setattr(manager, "send_to_chat", no_broadcast)

    class Socket:
        async def send_json(self, _payload):
            return None

    asyncio.run(
        MessageHandler(Socket(), db, chat.id, psychic.id).handle(
            {"content": "manual takeover reply"}
        )
    )
    state = store.get(f"chat:{chat.id}")
    assert [entry["role"] for entry in state.chat_transcript] == [
        "client",
        "logan",
        "logan",
    ]
    assert [entry["content"] for entry in state.chat_transcript] == [
        turn,
        "first bubble",
        "manual takeover reply",
    ]
    db.expire_all()
    assert db.get(ReadingMessageBurst, session.id).completed_client_message_id == trigger.id


def test_automatic_commit_notifies_before_a_concurrent_newer_client_message(
    db, make_user, monkeypatch
):
    factory = _install_db(monkeypatch, db)
    client, psychic, chat, session, _interval = _seed_reading(
        db, make_user, ResponseMode.SABRI
    )
    trigger = _client_message(db, chat, session, client, "question for Automatic")
    row = ReadingMessageBurst(
        chat_session_id=session.id,
        chat_id=chat.id,
        latest_client_message_id=trigger.id,
        generation_version=3,
        status="DELIVERING",
        lease_owner="d32-owner",
        response_bubbles='["older Automatic bubble"]',
        delivery_position=0,
    )
    db.add(row)
    db.commit()

    claim = reading_burst._Claim(
        chat_session_id=session.id,
        chat_id=chat.id,
        client_id=client.id,
        psychic_id=psychic.id,
        mode=ResponseMode.SABRI.value,
        owner="d32-owner",
        version=3,
        through_message_id=trigger.id,
        contents=[trigger.content],
        response_bubbles=["older Automatic bubble"],
    )
    automatic_committed = asyncio.Event()
    release_notification = asyncio.Event()
    notifications = []

    async def paused_automatic_notification(_db, _chat, message):
        automatic_committed.set()
        await release_notification.wait()
        notifications.append(message.content)

    async def record_client_notification(message, chat_id):
        assert chat_id == str(chat.id)
        notifications.append(message["content"])

    monkeypatch.setattr(
        "app.services.chats.broadcast_persisted_ai_message",
        paused_automatic_notification,
    )
    from app.routers.chats import manager
    from app.services import session_manager as session_manager_module
    from app.services.chat.handlers.message_handler import MessageHandler

    monkeypatch.setattr(manager, "send_to_chat", record_client_notification)
    monkeypatch.setattr(reading_burst, "_wake", lambda _session_id: None)
    prior_manager = session_manager_module.session_manager
    session_manager_module.session_manager = SimpleNamespace(
        active_sessions={chat.id: SimpleNamespace(awaiting_join=False, is_grace=False)}
    )

    class Socket:
        async def send_json(self, _payload):
            return None

    async def scenario():
        automatic = asyncio.create_task(
            reading_burst._deliver_bubble(
                claim, "older Automatic bubble", expected_position=0, total=1
            )
        )
        await automatic_committed.wait()
        client_send = asyncio.create_task(
            MessageHandler(Socket(), db, chat.id, client.id).handle(
                {"content": "newer client message"}
            )
        )
        await asyncio.sleep(0.02)
        with factory() as reader:
            client_messages = (
                reader.query(Message)
                .filter(
                    Message.chat_session_id == session.id,
                    Message.sender_id == client.id,
                )
                .order_by(Message.id)
                .all()
            )
            assert [message.content for message in client_messages] == [
                "question for Automatic"
            ]
        assert not client_send.done()
        release_notification.set()
        await asyncio.gather(automatic, client_send)

    try:
        asyncio.run(scenario())
    finally:
        session_manager_module.session_manager = prior_manager

    assert notifications == ["older Automatic bubble", "newer client message"]
    db.expire_all()
    row = db.get(ReadingMessageBurst, session.id)
    newer = (
        db.query(Message)
        .filter(
            Message.chat_session_id == session.id,
            Message.sender_id == client.id,
        )
        .order_by(Message.id.desc())
        .first()
    )
    assert newer.content == "newer client message"
    assert row.completed_client_message_id == trigger.id
    assert row.latest_client_message_id == newer.id
    assert row.status == "WAITING"


def test_newer_client_message_that_owns_flow_first_refuses_stale_automatic_bubble(
    db, make_user, monkeypatch
):
    _install_db(monkeypatch, db)
    client, psychic, chat, session, _interval = _seed_reading(
        db, make_user, ResponseMode.SABRI
    )
    trigger = _client_message(db, chat, session, client, "question before race")
    row = ReadingMessageBurst(
        chat_session_id=session.id,
        chat_id=chat.id,
        latest_client_message_id=trigger.id,
        generation_version=8,
        status="DELIVERING",
        lease_owner="d32-client-first",
        response_bubbles='["stale Automatic bubble"]',
        delivery_position=0,
    )
    db.add(row)
    db.commit()
    claim = reading_burst._Claim(
        chat_session_id=session.id,
        chat_id=chat.id,
        client_id=client.id,
        psychic_id=psychic.id,
        mode=ResponseMode.SABRI.value,
        owner="d32-client-first",
        version=8,
        through_message_id=trigger.id,
        contents=[trigger.content],
        response_bubbles=["stale Automatic bubble"],
    )

    from app.routers.chats import manager
    from app.services import session_manager as session_manager_module
    from app.services.chat.handlers.message_handler import MessageHandler

    client_owns_flow = asyncio.Event()
    release_client = asyncio.Event()
    notifications = []
    original_handle = MessageHandler._handle_serialized

    async def paused_client_handle(self, event_data):
        client_owns_flow.set()
        await release_client.wait()
        await original_handle(self, event_data)

    async def record_client_notification(message, chat_id):
        assert chat_id == str(chat.id)
        notifications.append(message["content"])

    async def reject_stale_notification(*_args, **_kwargs):
        raise AssertionError("the stale Automatic bubble must never notify")

    monkeypatch.setattr(MessageHandler, "_handle_serialized", paused_client_handle)
    monkeypatch.setattr(manager, "send_to_chat", record_client_notification)
    monkeypatch.setattr(
        "app.services.chats.broadcast_persisted_ai_message",
        reject_stale_notification,
    )
    monkeypatch.setattr(reading_burst, "_wake", lambda _session_id: None)
    prior_manager = session_manager_module.session_manager
    session_manager_module.session_manager = SimpleNamespace(
        active_sessions={chat.id: SimpleNamespace(awaiting_join=False, is_grace=False)}
    )

    class Socket:
        async def send_json(self, _payload):
            return None

    async def scenario():
        client_send = asyncio.create_task(
            MessageHandler(Socket(), db, chat.id, client.id).handle(
                {"content": "newer client message owns flow"}
            )
        )
        await client_owns_flow.wait()
        automatic = asyncio.create_task(
            reading_burst._deliver_bubble(
                claim, "stale Automatic bubble", expected_position=0, total=1
            )
        )
        await asyncio.sleep(0.02)
        assert not automatic.done()
        release_client.set()
        await client_send
        return await automatic

    try:
        result = asyncio.run(scenario())
    finally:
        session_manager_module.session_manager = prior_manager

    assert result == (None, False)
    assert notifications == ["newer client message owns flow"]
    db.expire_all()
    assert (
        db.query(Message)
        .filter(
            Message.chat_session_id == session.id,
            Message.sender_id == psychic.id,
        )
        .count()
        == 0
    )
    row = db.get(ReadingMessageBurst, session.id)
    assert row.latest_client_message_id > trigger.id
    assert row.completed_client_message_id is None
    assert row.status == "WAITING"


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
