"""Integration coverage for run_reading_pipeline's single-agent branch — the
orchestration seam the adversarial review flagged (finding #3: record BEFORE compute,
without double-including the current message in the transcript). Boundaries (DB,
settings, executor, client-file) are faked; the metadata/transcript wiring is real."""

import asyncio
import json
from types import SimpleNamespace

from app.config import get_app_settings
from app.enums.chat_status import ChatStatus
from app.enums.response_mode import ResponseMode
from app.services.ai import reading_pipeline as rp
from app.services.ai import reading_assistant, reading_executor, reading_session


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


def _run_single_agent_turn(monkeypatch, *, chat_id, client_message):
    """Drive one single-agent pipeline turn and return the reader_input that would be
    streamed (captured off start_reader_delivery)."""
    chat = SimpleNamespace(
        id=chat_id, status=ChatStatus.ACTIVE, response_mode=ResponseMode.SABRI,
        user_id=1, psychic_id=2,
    )
    real = get_app_settings()
    fake_settings = SimpleNamespace(
        AI_DRAFTING_ENABLED=True, READING_ENGINE="single_agent",
        READING_HOLD_MESSAGE_DELAY_SEC=real.READING_HOLD_MESSAGE_DELAY_SEC,
    )
    monkeypatch.setattr(rp, "get_app_settings", lambda: fake_settings)
    monkeypatch.setattr("app.services.ai.client.is_configured", lambda: True)
    monkeypatch.setattr("app.database.client.SessionLocal", lambda: _FakeDB(chat))
    monkeypatch.setattr(reading_assistant, "build_client_file", lambda db, uid: None)

    async def _noop_cancel(cid):
        pass

    async def _noop_typing(cid, on, sid):
        pass

    captured = {}

    def _capture(cid, state, reader_input):
        captured["chat_id"] = cid
        captured["state"] = state
        captured["reader_input"] = reader_input
        return None

    monkeypatch.setattr(reading_executor, "cancel_delivery", _noop_cancel)
    monkeypatch.setattr(reading_executor, "broadcast_typing", _noop_typing)
    monkeypatch.setattr(reading_executor, "start_reader_delivery", _capture)

    reading_session.get_session_store().delete(f"chat:{chat_id}")
    result = asyncio.run(rp.run_reading_pipeline(chat_id, None, client_message))
    assert result is None            # single-agent branch returns None (delivery is async)
    return captured


def test_single_agent_metadata_reflects_this_turn_not_empty_state(monkeypatch):
    # A long opener from a "talker": once recorded, the buckets must read long/fast —
    # not the pre-record empty-state default of short/silent.
    opener = ("hi valentina, ive been thinking about my ex for months and i really need "
              "to know if hes ever going to come back to me or if im wasting my time here")
    cap = _run_single_agent_turn(monkeypatch, chat_id=90001, client_message=opener)
    ri = cap["reader_input"]

    meta_line = ri.split("SESSION METADATA:\n", 1)[1].split("\n\n", 1)[0]
    meta = json.loads(meta_line)
    assert meta["client_avg_response_length"] == "long"     # was "short" before the fix
    assert meta["client_response_speed"] != "silent"        # was "silent" before the fix


def test_single_agent_does_not_duplicate_current_message_into_transcript(monkeypatch):
    opener = "hi there this is my very first message to you tonight and it is a long one"
    cap = _run_single_agent_turn(monkeypatch, chat_id=90002, client_message=opener)
    ri = cap["reader_input"]

    # Present once, as the CLIENT MESSAGE — never echoed into a RECENT CONVERSATION block.
    assert ri.count(opener) == 1
    assert "RECENT CONVERSATION:" not in ri
    # State recorded the message exactly once.
    assert [m["content"] for m in cap["state"].chat_transcript] == [opener]
