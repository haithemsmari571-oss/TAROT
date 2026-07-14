"""run_reading_pipeline's single-agent branch now delegates straight to the reveal
coordinator (reading_reveal.handle_client_message) BEFORE the two-agent
cancel_delivery/typing setup — so an in-flight paced reveal is never cut off by a new
message. Boundaries (DB, settings, is_configured, coordinator) are faked."""

import asyncio
from types import SimpleNamespace

from app.config import get_app_settings
from app.enums.chat_status import ChatStatus
from app.enums.response_mode import ResponseMode
from app.services.ai import reading_pipeline as rp
from app.services.ai import reading_executor, reading_reveal


class _FakeQuery:
    def __init__(self, chat):
        self._chat = chat

    def filter(self, *a, **k):
        return self

    def first(self):
        return self._chat


class _FakeDB:
    def __init__(self, chat):
        self._chat = chat

    def query(self, *a, **k):
        return _FakeQuery(self._chat)

    def close(self):
        pass


def test_single_agent_delegates_to_reveal_coordinator(monkeypatch):
    chat = SimpleNamespace(
        id=4242, status=ChatStatus.ACTIVE, response_mode=ResponseMode.SABRI,
        user_id=7, psychic_id=9,
    )
    real = get_app_settings()
    fake_settings = SimpleNamespace(
        AI_DRAFTING_ENABLED=True, READING_ENGINE="single_agent",
        READING_HOLD_MESSAGE_DELAY_SEC=real.READING_HOLD_MESSAGE_DELAY_SEC,
    )
    monkeypatch.setattr(rp, "get_app_settings", lambda: fake_settings)
    monkeypatch.setattr("app.services.ai.client.is_configured", lambda: True)
    monkeypatch.setattr("app.database.client.SessionLocal", lambda: _FakeDB(chat))

    captured = {}

    async def fake_handle(chat_id, client_message, *, psychic_id=None, user_id=None):
        captured.update(chat_id=chat_id, client_message=client_message,
                        psychic_id=psychic_id, user_id=user_id)

    # The two-agent setup must NOT run for single_agent (it would cut off a reveal).
    async def _boom_cancel(_cid):
        raise AssertionError("cancel_delivery must not run on the single-agent path")

    monkeypatch.setattr(reading_reveal, "handle_client_message", fake_handle)
    monkeypatch.setattr(reading_executor, "cancel_delivery", _boom_cancel)

    result = asyncio.run(rp.run_reading_pipeline(4242, None, "will he come back to me?"))

    assert result is None                       # single-agent returns None (reveal is async)
    assert captured == {
        "chat_id": 4242, "client_message": "will he come back to me?",
        "psychic_id": 9, "user_id": 7,
    }
