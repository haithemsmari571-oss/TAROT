import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Barrier, Lock
from uuid import uuid4

import pytest


def _require_disposable_database():
    database_url = os.getenv("D31_POSTGRES_TEST_DATABASE_URL", "").strip()
    if not database_url:
        pytest.skip("D31_POSTGRES_TEST_DATABASE_URL is required")
    if os.getenv("D31_POSTGRES_TEST_CONFIRM_DISPOSABLE") != "YES":
        pytest.fail("D31 PostgreSQL tests require an explicitly disposable database")
    assert os.getenv("DATABASE_URL") == database_url
    assert database_url.rsplit("/", 1)[-1] == "tarot_d31"


def _seed_pending_hybrid():
    from app.database.client import SessionLocal
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
    from app.models.user import User

    suffix = uuid4().hex
    with SessionLocal() as db:
        client = User(
            email=f"d31-client-{suffix}@example.invalid",
            username=f"d31-client-{suffix}",
            password_hash="synthetic",
            role=Role.USER,
            balance=37,
            credit_balance=3,
            is_verified=True,
        )
        psychic = User(
            email=f"d31-reader-{suffix}@example.invalid",
            username=f"d31-reader-{suffix}",
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
            response_mode=ResponseMode.HYBRID,
            client_joined_at=datetime.now(timezone.utc),
        )
        db.add(chat)
        db.flush()
        session = ChatSession(chat_id=chat.id, status=ChatSessionStatus.ACTIVE)
        db.add(session)
        db.flush()
        interval = SessionInterval(
            session_id=session.id,
            started_at=datetime.now(timezone.utc),
            trigger_event=ChatSessionTrigger.INITIAL_START,
        )
        trigger = Message(
            chat_id=chat.id,
            chat_session_id=session.id,
            sender_id=client.id,
            content="synthetic D31 client turn",
        )
        db.add_all([interval, trigger])
        db.flush()
        row = ReadingMessageBurst(
            chat_session_id=session.id,
            chat_id=chat.id,
            latest_client_message_id=trigger.id,
            generation_version=1,
            status="PENDING_REVIEW",
        )
        draft = AiDraft(
            chat_id=chat.id,
            client_message_id=trigger.id,
            mode=ResponseMode.HYBRID,
            draft_text="synthetic D31 pending reply",
            status=AiDraftStatus.PENDING,
        )
        db.add_all([row, draft])
        db.commit()
        return {
            "client_id": client.id,
            "psychic_id": psychic.id,
            "chat_id": chat.id,
            "session_id": session.id,
            "trigger_id": trigger.id,
            "draft_id": draft.id,
            "interval_id": interval.id,
        }


@pytest.fixture(autouse=True)
def _d31_environment(monkeypatch):
    _require_disposable_database()
    from app.services.ai import reading_burst

    reading_burst._tasks.clear()
    reading_burst._wake_events.clear()
    reading_burst._generating.clear()
    reading_burst._stopping = False
    monkeypatch.setattr(reading_burst, "_engine_config", lambda: (True, "two_role"))
    yield
    if reading_burst._tasks:
        asyncio.run(reading_burst.stop_burst_coordinator())


def _billing_snapshot(ids):
    from app.database.client import SessionLocal
    from app.models.session_intervals import SessionInterval
    from app.models.transaction import Transaction
    from app.models.user import User

    with SessionLocal() as db:
        client = db.get(User, ids["client_id"])
        psychic = db.get(User, ids["psychic_id"])
        interval = db.get(SessionInterval, ids["interval_id"])
        return (
            float(client.balance),
            float(client.credit_balance),
            float(psychic.balance),
            float(psychic.credit_balance),
            interval.started_at,
            interval.ended_at,
            db.query(Transaction)
            .filter(Transaction.related_chat_id == ids["chat_id"])
            .count(),
        )

def test_hybrid_send_discard_race_has_one_consistent_winner_postgresql():
    from app.database.client import SessionLocal
    from app.enums.ai_draft_status import AiDraftStatus
    from app.models.ai_draft import AiDraft
    from app.models.chat import Chat
    from app.models.message import Message
    from app.models.reading_message_burst import ReadingMessageBurst
    from app.services import chats as chats_service
    from app.services.ai import reading_burst

    ids = _seed_pending_hybrid()
    billing_before = _billing_snapshot(ids)
    barrier = Barrier(2)

    def send():
        with SessionLocal() as db:
            chat = db.get(Chat, ids["chat_id"])
            barrier.wait()
            staged = reading_burst.stage_hybrid_draft_send(
                db, chat, ids["draft_id"]
            )
            if staged is None:
                db.rollback()
                return False
            _turn, session_id = staged
            chats_service.prepare_ai_message(
                db, chat, "race-approved reply", chat_session_id=session_id
            )
            db.commit()
            return True

    def discard():
        with SessionLocal() as db:
            chat = db.get(Chat, ids["chat_id"])
            barrier.wait()
            won = reading_burst.stage_hybrid_draft_discard(
                db, chat, ids["draft_id"]
            )
            if won:
                db.commit()
            else:
                db.rollback()
            return won

    with ThreadPoolExecutor(max_workers=2) as pool:
        sent = pool.submit(send)
        discarded = pool.submit(discard)
        outcomes = (sent.result(timeout=10), discarded.result(timeout=10))
    assert sum(outcomes) == 1

    with SessionLocal() as db:
        draft = db.get(AiDraft, ids["draft_id"])
        row = db.get(ReadingMessageBurst, ids["session_id"])
        replies = (
            db.query(Message)
            .filter(
                Message.chat_session_id == ids["session_id"],
                Message.sender_id == ids["psychic_id"],
            )
            .all()
        )
        if outcomes[0]:
            assert draft.status == AiDraftStatus.SENT
            assert row.status == "IDLE"
            assert row.completed_client_message_id == ids["trigger_id"]
            assert [message.content for message in replies] == ["race-approved reply"]
        else:
            assert draft.status == AiDraftStatus.DISCARDED
            assert row.status == "AWAITING_REGEN"
            assert row.completed_client_message_id is None
            assert replies == []
    assert _billing_snapshot(ids) == billing_before


def test_client_insert_and_hybrid_approve_serialize_without_deadlock_postgresql():
    from app.database.client import SessionLocal
    from app.enums.ai_draft_status import AiDraftStatus
    from app.models.ai_draft import AiDraft
    from app.models.chat import Chat
    from app.models.message import Message
    from app.models.reading_message_burst import ReadingMessageBurst
    from app.models.user import User
    from app.services import chats as chats_service
    from app.services.ai import reading_burst

    ids = _seed_pending_hybrid()
    billing_before = _billing_snapshot(ids)
    barrier = Barrier(2)

    def insert_client_message():
        with SessionLocal() as db:
            chat = db.get(Chat, ids["chat_id"])
            client = db.get(User, ids["client_id"])
            barrier.wait()
            message = asyncio.run(
                chats_service.save_message(
                    db, {"content": "newer committed detail"}, client, chat
                )
            )
            return message.id

    def approve():
        with SessionLocal() as db:
            chat = db.get(Chat, ids["chat_id"])
            barrier.wait()
            staged = reading_burst.stage_hybrid_draft_send(
                db, chat, ids["draft_id"]
            )
            if staged is None:
                db.commit()
                return False
            _turn, session_id = staged
            chats_service.prepare_ai_message(
                db, chat, "concurrent approved reply", chat_session_id=session_id
            )
            db.commit()
            return True

    with ThreadPoolExecutor(max_workers=2) as pool:
        insert_future = pool.submit(insert_client_message)
        approve_future = pool.submit(approve)
        newer_id = insert_future.result(timeout=10)
        approved = approve_future.result(timeout=10)

    with SessionLocal() as db:
        draft = db.get(AiDraft, ids["draft_id"])
        row = db.get(ReadingMessageBurst, ids["session_id"])
        replies = (
            db.query(Message)
            .filter(
                Message.chat_session_id == ids["session_id"],
                Message.sender_id == ids["psychic_id"],
            )
            .all()
        )
        if approved:
            assert draft.status == AiDraftStatus.SENT
            assert len(replies) == 1
            assert replies[0].id < newer_id
            assert row.completed_client_message_id == ids["trigger_id"]
        else:
            assert draft.status == AiDraftStatus.DISCARDED
            assert replies == []
            assert row.status == "AWAITING_REGEN"
            assert row.completed_client_message_id is None
    assert _billing_snapshot(ids) == billing_before


def test_concurrent_regeneration_requests_create_one_hybrid_generation_postgresql(
    monkeypatch,
):
    from app.database.client import SessionLocal
    from app.enums.ai_draft_status import AiDraftStatus
    from app.models.ai_draft import AiDraft
    from app.models.reading_message_burst import ReadingMessageBurst
    from app.services.ai import reading_burst, reading_duo

    ids = _seed_pending_hybrid()
    with SessionLocal() as db:
        draft = db.get(AiDraft, ids["draft_id"])
        draft.status = AiDraftStatus.DISCARDED
        row = db.get(ReadingMessageBurst, ids["session_id"])
        row.status = "AWAITING_REGEN"
        original_version = row.generation_version
        db.commit()

    real_wake = reading_burst._wake
    wakes = []
    wake_lock = Lock()

    def capture_wake(session_id):
        with wake_lock:
            wakes.append(session_id)

    monkeypatch.setattr(reading_burst, "_wake", capture_wake)
    barrier = Barrier(2)

    def request():
        barrier.wait()
        return reading_burst.request_hybrid_regeneration(ids["chat_id"])

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(request)
        second = pool.submit(request)
        assert (first.result(timeout=10), second.result(timeout=10)) == (True, True)

    with SessionLocal() as db:
        row = db.get(ReadingMessageBurst, ids["session_id"])
        assert row.status == "WAITING"
        assert row.generation_version == original_version + 1

    calls = []

    async def fake_writer(_chat_id, turn, *_args, **_kwargs):
        calls.append(turn)
        return "one regenerated draft"

    monkeypatch.setattr(reading_duo, "_write_valentina_turn", fake_writer)
    monkeypatch.setattr(reading_burst, "_wake", real_wake)

    async def finish_generation():
        reading_burst._wake(ids["session_id"])
        deadline = asyncio.get_running_loop().time() + 5
        while not calls and asyncio.get_running_loop().time() < deadline:
            await asyncio.sleep(0.02)
        await reading_burst.stop_burst_coordinator()

    asyncio.run(finish_generation())
    assert len(calls) == 1
    with SessionLocal() as db:
        pending = (
            db.query(AiDraft)
            .filter(
                AiDraft.chat_id == ids["chat_id"],
                AiDraft.status == AiDraftStatus.PENDING,
            )
            .all()
        )
        assert len(pending) == 1
        assert db.get(ReadingMessageBurst, ids["session_id"]).status == "PENDING_REVIEW"


def test_old_session_and_inactive_chat_hybrid_drafts_never_deliver_postgresql():
    from app.database.client import SessionLocal
    from app.enums.ai_draft_status import AiDraftStatus
    from app.enums.chat_session_status import ChatSessionStatus
    from app.enums.chat_status import ChatStatus
    from app.models.ai_draft import AiDraft
    from app.models.chat import Chat
    from app.models.chat_session import ChatSession
    from app.models.message import Message
    from app.services import chats as chats_service
    from app.services.ai import reading_burst

    for make_invalid in ("old_session", "paused", "ended"):
        ids = _seed_pending_hybrid()
        with SessionLocal() as db:
            chat = db.get(Chat, ids["chat_id"])
            if make_invalid == "old_session":
                db.get(ChatSession, ids["session_id"]).status = (
                    ChatSessionStatus.COMPLETED
                )
                db.add(
                    ChatSession(
                        chat_id=ids["chat_id"], status=ChatSessionStatus.ACTIVE
                    )
                )
            else:
                chat.status = (
                    ChatStatus.PAUSED if make_invalid == "paused" else ChatStatus.ENDED
                )
            db.commit()

        with SessionLocal() as db:
            chat = db.get(Chat, ids["chat_id"])
            staged = reading_burst.stage_hybrid_draft_send(
                db, chat, ids["draft_id"]
            )
            assert staged is None
            db.commit()
            assert db.get(AiDraft, ids["draft_id"]).status == AiDraftStatus.DISCARDED
            assert (
                db.query(Message)
                .filter(
                    Message.chat_id == ids["chat_id"],
                    Message.sender_id == ids["psychic_id"],
                )
                .count()
                == 0
            )


def test_sabri_fallback_double_send_creates_exactly_one_message_postgresql():
    from app.database.client import SessionLocal
    from app.enums.ai_draft_status import AiDraftStatus
    from app.enums.response_mode import ResponseMode
    from app.models.ai_draft import AiDraft
    from app.models.chat import Chat
    from app.models.message import Message
    from app.routers.reading_ai import _stage_fallback_draft_decision
    from app.services import chats as chats_service

    ids = _seed_pending_hybrid()
    with SessionLocal() as db:
        draft = db.get(AiDraft, ids["draft_id"])
        draft.mode = ResponseMode.SABRI
        db.commit()
    barrier = Barrier(2)

    def send():
        with SessionLocal() as db:
            chat = db.get(Chat, ids["chat_id"])
            barrier.wait()
            won = _stage_fallback_draft_decision(
                db, ids["chat_id"], ids["draft_id"], AiDraftStatus.SENT
            )
            if not won:
                db.rollback()
                return False
            chats_service.prepare_ai_message(
                db,
                chat,
                "single fallback reply",
                chat_session_id=ids["session_id"],
            )
            db.commit()
            return True

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(send)
        second = pool.submit(send)
        outcomes = (first.result(timeout=10), second.result(timeout=10))
    assert sum(outcomes) == 1
    with SessionLocal() as db:
        assert db.get(AiDraft, ids["draft_id"]).status == AiDraftStatus.SENT
        assert (
            db.query(Message)
            .filter(
                Message.chat_id == ids["chat_id"],
                Message.sender_id == ids["psychic_id"],
            )
            .count()
            == 1
        )
