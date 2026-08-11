"""Atlas dossier handoff into the live single-agent Reader.

All HTTP, database, and model boundaries are synthetic fakes. No service or
environment file is used by this suite.
"""

import asyncio
import sys
import time
import types
from datetime import datetime
from types import SimpleNamespace

import httpx

from app.services.ai import reading_reader, reading_reveal
from app.services.ai.reading_session import create_session_state, record_client_message


_BASE_URL = "http://127.0.0.1:4317"
_SYNTHETIC_KEY = "SYNTHETIC_ATLAS_KEY"


class _FakeResponse:
    def __init__(self, status_code=200, payload=None, json_error=None):
        self.status_code = status_code
        self._payload = payload
        self._json_error = json_error

    def json(self):
        if self._json_error is not None:
            raise self._json_error
        return self._payload


def _settings(*, base_url=_BASE_URL, key=_SYNTHETIC_KEY):
    return SimpleNamespace(
        ATLAS_DOSSIER_BASE_URL=base_url,
        ATLAS_INTERNAL_KEY=key,
    )


def _install_http_client(monkeypatch, responder, calls):
    class _FakeAsyncClient:
        def __init__(self, *, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def get(self, url, *, headers):
            calls.append({"url": url, "headers": headers, "timeout": self.timeout})
            result = responder(url, headers)
            if hasattr(result, "__await__"):
                return await result
            return result

    monkeypatch.setattr(reading_reveal.httpx, "AsyncClient", _FakeAsyncClient)


def _capture_warnings(monkeypatch):
    warnings = []

    class _Logger:
        def warning(self, event, **fields):
            warnings.append((event, fields))

    monkeypatch.setattr(reading_reveal, "logger", _Logger())
    return warnings


def _reader_input(state, message, trigger, memory):
    return reading_reveal._reader_input_for(
        message,
        trigger,
        state,
        client_file=None,
        dob=None,
        now=datetime(2032, 1, 1, 12, 0, 0),
        atlas_memory_text=memory,
    )


def test_first_generation_includes_atlas_text_and_second_turn_reuses_cache(
    monkeypatch,
):
    calls = []
    model_inputs = []
    memory_text = (
        "ATLAS CLIENT MEMORY DOSSIER\n"
        "FACTS\n- Synthetic preference [current]\n"
        "SITUATIONAL TIMELINE\n- Synthetic move [current]"
    )
    payload = {
        "dossier": {
            "client": {"clientId": "synthetic-client", "clientCode": "AV-SYN"},
            "facts": [{"content": {"value": "Synthetic preference"}}],
            "situationalTimeline": [
                {"content": {"value": "Synthetic move"}}
            ],
        },
        "text": memory_text,
    }
    monkeypatch.setattr(reading_reveal, "get_app_settings", lambda: _settings())
    _install_http_client(
        monkeypatch,
        lambda _url, _headers: _FakeResponse(payload=payload),
        calls,
    )

    fake_database_client = types.ModuleType("app.database.client")

    class _DbContext:
        def __enter__(self):
            return object()

        def __exit__(self, exc_type, exc, tb):
            return False

    fake_database_client.SessionLocal = _DbContext
    monkeypatch.setitem(sys.modules, "app.database.client", fake_database_client)

    from app.services.ai import reading_assistant
    from app.services import client_dossier

    monkeypatch.setattr(
        reading_assistant, "build_client_file", lambda _db, _user_id: None
    )
    monkeypatch.setattr(client_dossier, "get_client_dob", lambda _db, _user_id: None)

    def fake_reader_turn(reader_input, **_kwargs):
        model_inputs.append(reader_input)
        return ["synthetic reader bubble"], []

    monkeypatch.setattr(reading_reader, "run_reader_turn", fake_reader_turn)

    state = create_session_state("chat:91001", client_id=91, chat_id=91001)
    record_client_message(state, "first synthetic question")
    first_trigger = state.chat_transcript[-1]
    asyncio.run(
        reading_reveal._generate_turn(
            91001, "first synthetic question", first_trigger, state, 91
        )
    )

    record_client_message(state, "second synthetic question")
    second_trigger = state.chat_transcript[-1]
    asyncio.run(
        reading_reveal._generate_turn(
            91001, "second synthetic question", second_trigger, state, 91
        )
    )

    assert len(calls) == 1
    assert calls[0] == {
        "url": f"{_BASE_URL}/internal/atlas/dossier/91",
        "headers": {"X-Atlas-Internal-Key": _SYNTHETIC_KEY},
        "timeout": 2.0,
    }
    assert len(model_inputs) == 2
    assert all(memory_text in reader_input for reader_input in model_inputs)
    assert all(
        "ATLAS CLIENT MEMORY (load silently, never cite):" in reader_input
        for reader_input in model_inputs
    )


def test_empty_dossier_text_proceeds_without_memory_section(monkeypatch):
    calls = []
    monkeypatch.setattr(reading_reveal, "get_app_settings", lambda: _settings())
    _install_http_client(
        monkeypatch,
        lambda _url, _headers: _FakeResponse(
            payload={
                "dossier": {
                    "client": None,
                    "snapshot": None,
                    "facts": [],
                    "situationalTimeline": [],
                    "contradictions": [],
                    "sourceIndex": [],
                    "buildAttempt": None,
                },
                "text": "",
            }
        ),
        calls,
    )
    state = create_session_state("chat:91002", client_id=92, chat_id=91002)
    record_client_message(state, "new synthetic client question")
    trigger = state.chat_transcript[-1]

    memory = asyncio.run(reading_reveal._atlas_memory_for_session(state, 92))
    reader_input = _reader_input(state, "new synthetic client question", trigger, memory)

    assert memory == ""
    assert "CLIENT MESSAGE:\nnew synthetic client question" in reader_input
    assert "ATLAS CLIENT MEMORY (load silently, never cite):" not in reader_input
    assert len(calls) == 1


def test_atlas_timeout_is_bounded_warns_and_proceeds(monkeypatch):
    calls = []
    warnings = _capture_warnings(monkeypatch)
    monkeypatch.setattr(reading_reveal, "get_app_settings", lambda: _settings())
    assert reading_reveal._ATLAS_DOSSIER_TIMEOUT_SECONDS == 2.0
    monkeypatch.setattr(reading_reveal, "_ATLAS_DOSSIER_TIMEOUT_SECONDS", 0.01)

    async def never_returns(_url, _headers):
        await asyncio.sleep(60)
        return _FakeResponse(payload={"dossier": {}, "text": "unreachable"})

    _install_http_client(monkeypatch, never_returns, calls)
    state = create_session_state("chat:91003", client_id=93, chat_id=91003)

    started = time.monotonic()
    memory = asyncio.run(reading_reveal._atlas_memory_for_session(state, 93))
    elapsed = time.monotonic() - started

    assert memory == ""
    assert elapsed < 0.25
    assert len(calls) == 1
    assert warnings == [("atlas_dossier_fetch_failed", {"reason": "timeout"})]


def test_non_200_warns_and_proceeds(monkeypatch):
    calls = []
    warnings = _capture_warnings(monkeypatch)
    monkeypatch.setattr(reading_reveal, "get_app_settings", lambda: _settings())
    _install_http_client(
        monkeypatch,
        lambda _url, _headers: _FakeResponse(status_code=503, payload={}),
        calls,
    )
    state = create_session_state("chat:91004", client_id=94, chat_id=91004)

    memory = asyncio.run(reading_reveal._atlas_memory_for_session(state, 94))

    assert memory == ""
    assert len(calls) == 1
    assert warnings == [
        (
            "atlas_dossier_fetch_failed",
            {"reason": "status", "status_code": 503},
        )
    ]


def test_unconfigured_base_url_or_key_skips_http_and_caches_empty(monkeypatch):
    for base_url, key in (("", _SYNTHETIC_KEY), (_BASE_URL, "")):
        warnings = _capture_warnings(monkeypatch)
        monkeypatch.setattr(
            reading_reveal,
            "get_app_settings",
            lambda base_url=base_url, key=key: _settings(base_url=base_url, key=key),
        )

        def forbidden_client(*_args, **_kwargs):
            raise AssertionError("HTTP must not be constructed when Atlas is unconfigured")

        monkeypatch.setattr(reading_reveal.httpx, "AsyncClient", forbidden_client)
        state = create_session_state("chat:91005", client_id=95, chat_id=91005)

        assert asyncio.run(reading_reveal._atlas_memory_for_session(state, 95)) == ""
        assert asyncio.run(reading_reveal._atlas_memory_for_session(state, 95)) == ""
        assert warnings == [
            ("atlas_dossier_fetch_skipped", {"reason": "configuration_missing"})
        ]


def test_connection_failure_warns_and_proceeds(monkeypatch):
    calls = []
    warnings = _capture_warnings(monkeypatch)
    monkeypatch.setattr(reading_reveal, "get_app_settings", lambda: _settings())

    def connection_error(url, _headers):
        request = httpx.Request("GET", url)
        raise httpx.ConnectError("synthetic connection failure", request=request)

    _install_http_client(monkeypatch, connection_error, calls)
    state = create_session_state("chat:91006", client_id=96, chat_id=91006)

    memory = asyncio.run(reading_reveal._atlas_memory_for_session(state, 96))

    assert memory == ""
    assert len(calls) == 1
    assert warnings == [
        (
            "atlas_dossier_fetch_failed",
            {"reason": "connection", "error_type": "ConnectError"},
        )
    ]


def test_unparseable_response_warns_and_proceeds(monkeypatch):
    calls = []
    warnings = _capture_warnings(monkeypatch)
    monkeypatch.setattr(reading_reveal, "get_app_settings", lambda: _settings())
    _install_http_client(
        monkeypatch,
        lambda _url, _headers: _FakeResponse(
            json_error=ValueError("synthetic invalid JSON")
        ),
        calls,
    )
    state = create_session_state("chat:91007", client_id=97, chat_id=91007)

    memory = asyncio.run(reading_reveal._atlas_memory_for_session(state, 97))

    assert memory == ""
    assert len(calls) == 1
    assert warnings == [
        (
            "atlas_dossier_fetch_failed",
            {"reason": "invalid_response", "error_type": "ValueError"},
        )
    ]
