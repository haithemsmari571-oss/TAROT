from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.chat_status import ChatStatus
from app.enums.role import Role
from app.models.chat import Chat
from app.routers.chats import router
from app.services.session_manager import SessionInfo


def test_join_sends_one_reader_greeting_not_one_per_mount(db, make_user, monkeypatch):
    client_user = make_user(balance=20)
    psychic = make_user(role=Role.PSYCHIC)
    chat = Chat(
        user_id=client_user.id,
        psychic_id=psychic.id,
        status=ChatStatus.ACTIVE,
    )
    db.add(chat)
    db.commit()
    db.refresh(chat)

    class FakeSessionManager:
        calls = 0

        async def mark_client_joined(self, chat_id):
            self.calls += 1
            return SessionInfo(
                chat_id=chat_id,
                elapsed_seconds=0,
                estimated_cost=1.0,
                remaining_seconds=1_140,
                client_balance=19.0,
                chat_status="ACTIVE",
                session_status="ACTIVE",
                started_at="2026-08-13T12:00:00",
                rate_per_second=1 / 60,
                client_joined_now=self.calls == 1,
            )

    session_manager = FakeSessionManager()
    delivered = []

    async def fake_broadcast(_db, target_chat, content):
        delivered.append((target_chat.id, content))

    monkeypatch.setattr(
        "app.services.session_manager.get_session_manager",
        lambda: session_manager,
    )
    monkeypatch.setattr("app.services.chats.broadcast_ai_message", fake_broadcast)

    app = FastAPI()
    app.include_router(router, prefix="/api/chat")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: client_user

    with TestClient(app, raise_server_exceptions=False) as http:
        first = http.post(f"/api/chat/{chat.id}/join")
        reconnect = http.post(f"/api/chat/{chat.id}/join")

    assert first.status_code == 200
    assert reconnect.status_code == 200
    assert delivered == [
        (chat.id, "hi lovely, i'm here and ready when you are."),
    ]


def test_join_does_not_greet_when_no_new_session_transition(
    db, make_user, monkeypatch
):
    client_user = make_user(balance=20)
    psychic = make_user(role=Role.PSYCHIC)
    chat = Chat(
        user_id=client_user.id,
        psychic_id=psychic.id,
        status=ChatStatus.ACTIVE,
    )
    db.add(chat)
    db.commit()
    db.refresh(chat)

    info = SessionInfo(
        chat_id=chat.id,
        elapsed_seconds=10,
        estimated_cost=1.0,
        remaining_seconds=1_130,
        client_balance=19.0,
        chat_status="ACTIVE",
        session_status="ACTIVE",
        started_at="2026-08-13T12:00:00",
        rate_per_second=1 / 60,
    )
    fake_manager = SimpleNamespace(mark_client_joined=lambda _chat_id: None)

    async def fake_join(_chat_id):
        return info

    fake_manager.mark_client_joined = fake_join

    async def forbidden_broadcast(*_args, **_kwargs):
        raise AssertionError("repeat join must not send another greeting")

    monkeypatch.setattr(
        "app.services.session_manager.get_session_manager",
        lambda: fake_manager,
    )
    monkeypatch.setattr(
        "app.services.chats.broadcast_ai_message",
        forbidden_broadcast,
    )

    app = FastAPI()
    app.include_router(router, prefix="/api/chat")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: client_user

    with TestClient(app, raise_server_exceptions=False) as http:
        response = http.post(f"/api/chat/{chat.id}/join")

    assert response.status_code == 200
