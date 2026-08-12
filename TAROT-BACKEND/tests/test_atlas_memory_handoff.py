"""Atlas dossier handoff into the single-agent and live two-role Readers.

All HTTP, database, and model boundaries are synthetic fakes. No service or
environment file is used by this suite.
"""

import asyncio
import sys
import time
import types
from datetime import date, datetime
from types import SimpleNamespace

import httpx

from app.services.ai import reading_duo, reading_reader, reading_reveal
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


def _install_duo_writer(
    monkeypatch, model_inputs, output="synthetic Valentina draft", account_dob=None
):
    from app.database import client as database_client
    from app.services import client_dossier
    from app.services.ai import (
        reading_assistant,
        reading_draft_log,
        reading_steering,
        reading_valentina,
    )

    class _DbContext:
        def __enter__(self):
            return object()

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(database_client, "SessionLocal", _DbContext)
    monkeypatch.setattr(
        reading_assistant, "build_client_file", lambda _db, _user_id: "LEGACY CLIENT FILE"
    )
    monkeypatch.setattr(
        client_dossier, "get_client_dob", lambda _db, _user_id: account_dob
    )
    monkeypatch.setattr(
        reading_steering, "get_active_notes", lambda _db, _chat_id: []
    )
    monkeypatch.setattr(
        reading_draft_log,
        "get_draft_log",
        lambda: SimpleNamespace(log=lambda **_fields: None),
    )

    def fake_write(valentina_input, **_kwargs):
        model_inputs.append(valentina_input)
        return output

    monkeypatch.setattr(reading_valentina, "write_valentina", fake_write)


def _write_duo_turn(state, message, user_id, psychic_id=301):
    record_client_message(state, message)
    trigger = state.chat_transcript[-1]
    return asyncio.run(
        reading_duo._write_valentina_turn(
            state.chat_id, message, trigger, state, user_id, psychic_id
        )
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
            91001, "first synthetic question", first_trigger, state, 91, 301
        )
    )

    record_client_message(state, "second synthetic question")
    second_trigger = state.chat_transcript[-1]
    asyncio.run(
        reading_reveal._generate_turn(
            91001, "second synthetic question", second_trigger, state, 91, 301
        )
    )

    assert len(calls) == 1
    assert calls[0] == {
        "url": f"{_BASE_URL}/internal/atlas/dossier/91/301",
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

    memory = asyncio.run(reading_reveal._atlas_memory_for_session(state, 92, 302))
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
    memory = asyncio.run(reading_reveal._atlas_memory_for_session(state, 93, 303))
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

    memory = asyncio.run(reading_reveal._atlas_memory_for_session(state, 94, 304))

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

        assert asyncio.run(reading_reveal._atlas_memory_for_session(state, 95, 305)) == ""
        assert asyncio.run(reading_reveal._atlas_memory_for_session(state, 95, 305)) == ""
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

    memory = asyncio.run(reading_reveal._atlas_memory_for_session(state, 96, 306))

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

    memory = asyncio.run(reading_reveal._atlas_memory_for_session(state, 97, 307))

    assert memory == ""
    assert len(calls) == 1
    assert warnings == [
        (
            "atlas_dossier_fetch_failed",
            {"reason": "invalid_response", "error_type": "ValueError"},
        )
    ]


def test_two_role_valentina_receives_atlas_text_once_across_messages(monkeypatch):
    calls = []
    model_inputs = []
    memory_text = "ATLAS CLIENT MEMORY DOSSIER\n- Synthetic two-role memory"
    monkeypatch.setattr(reading_reveal, "get_app_settings", lambda: _settings())
    _install_http_client(
        monkeypatch,
        lambda _url, _headers: _FakeResponse(
            payload={"dossier": {"client": {"clientCode": "AV-DUO"}}, "text": memory_text}
        ),
        calls,
    )
    _install_duo_writer(monkeypatch, model_inputs)
    state = create_session_state("chat:92001", client_id=201, chat_id=92001)

    assert _write_duo_turn(state, "first two-role question", 201) == "synthetic Valentina draft"
    assert _write_duo_turn(state, "second two-role question", 201) == "synthetic Valentina draft"

    assert len(calls) == 1
    assert len(model_inputs) == 2
    assert all(memory_text in model_input for model_input in model_inputs)
    assert all(
        model_input.startswith("ATLAS CLIENT MEMORY (load silently, never cite):\n")
        for model_input in model_inputs
    )


def test_single_agent_and_two_role_share_the_same_session_cache(monkeypatch):
    calls = []
    duo_inputs = []
    reader_inputs = []
    memory_text = "ATLAS CLIENT MEMORY DOSSIER\n- Shared synthetic memory"
    monkeypatch.setattr(reading_reveal, "get_app_settings", lambda: _settings())
    _install_http_client(
        monkeypatch,
        lambda _url, _headers: _FakeResponse(
            payload={"dossier": {"client": {"clientCode": "AV-SHARED"}}, "text": memory_text}
        ),
        calls,
    )
    _install_duo_writer(monkeypatch, duo_inputs)

    def fake_reader_turn(reader_input, **_kwargs):
        reader_inputs.append(reader_input)
        return ["synthetic reader bubble"], []

    monkeypatch.setattr(reading_reader, "run_reader_turn", fake_reader_turn)

    single_first = create_session_state("chat:92002", client_id=202, chat_id=92002)
    record_client_message(single_first, "single first")
    trigger = single_first.chat_transcript[-1]
    asyncio.run(
        reading_reveal._generate_turn(92002, "single first", trigger, single_first, 202, 301)
    )
    assert _write_duo_turn(single_first, "duo second", 202) == "synthetic Valentina draft"

    duo_first = create_session_state("chat:92003", client_id=203, chat_id=92003)
    assert _write_duo_turn(duo_first, "duo first", 203) == "synthetic Valentina draft"
    record_client_message(duo_first, "single second")
    trigger = duo_first.chat_transcript[-1]
    asyncio.run(
        reading_reveal._generate_turn(92003, "single second", trigger, duo_first, 203, 301)
    )

    assert len(calls) == 2
    assert len(duo_inputs) == 2
    assert len(reader_inputs) == 2
    assert all(memory_text in model_input for model_input in duo_inputs + reader_inputs)


def test_two_role_atlas_connection_failure_warns_and_still_completes(monkeypatch):
    calls = []
    model_inputs = []
    sabri_sources = []
    warnings = _capture_warnings(monkeypatch)
    monkeypatch.setattr(reading_reveal, "get_app_settings", lambda: _settings())

    def connection_error(url, _headers):
        raise httpx.ConnectError(
            "synthetic Atlas unavailable", request=httpx.Request("GET", url)
        )

    _install_http_client(monkeypatch, connection_error, calls)
    _install_duo_writer(monkeypatch, model_inputs)

    async def fake_sabri(_chat_id, _message, _entry, _state, source_content, is_new):
        assert is_new is True
        sabri_sources.append(source_content)
        return ["synthetic delivered bubble"], ""

    monkeypatch.setattr(reading_duo, "_sabri_turn", fake_sabri)
    state = create_session_state("chat:92004", client_id=204, chat_id=92004)
    record_client_message(state, "question while Atlas is down")
    trigger = state.chat_transcript[-1]

    bubbles, _reserve, route = asyncio.run(
        reading_duo._duo_generate(
            92004,
            "question while Atlas is down",
            trigger,
            state,
            204,
            forced_route="new",
            psychic_id=301,
        )
    )

    assert bubbles == ["synthetic delivered bubble"]
    assert route == "new"
    assert sabri_sources == ["synthetic Valentina draft"]
    assert "ATLAS CLIENT MEMORY" not in model_inputs[0]
    assert warnings == [
        (
            "atlas_dossier_fetch_failed",
            {"reason": "connection", "error_type": "ConnectError"},
        )
    ]


def test_two_role_atlas_401_warns_and_valentina_still_writes(monkeypatch):
    calls = []
    model_inputs = []
    warnings = _capture_warnings(monkeypatch)
    monkeypatch.setattr(reading_reveal, "get_app_settings", lambda: _settings())
    _install_http_client(
        monkeypatch,
        lambda _url, _headers: _FakeResponse(status_code=401, payload={}),
        calls,
    )
    _install_duo_writer(monkeypatch, model_inputs)
    state = create_session_state("chat:92005", client_id=205, chat_id=92005)

    assert _write_duo_turn(state, "question with rejected Atlas key", 205) == "synthetic Valentina draft"
    assert "ATLAS CLIENT MEMORY" not in model_inputs[0]
    assert warnings == [
        ("atlas_dossier_fetch_failed", {"reason": "status", "status_code": 401})
    ]


def test_two_role_malformed_atlas_body_warns_and_valentina_still_writes(monkeypatch):
    calls = []
    model_inputs = []
    warnings = _capture_warnings(monkeypatch)
    monkeypatch.setattr(reading_reveal, "get_app_settings", lambda: _settings())
    _install_http_client(
        monkeypatch,
        lambda _url, _headers: _FakeResponse(
            json_error=ValueError("synthetic malformed Atlas body")
        ),
        calls,
    )
    _install_duo_writer(monkeypatch, model_inputs)
    state = create_session_state("chat:92006", client_id=206, chat_id=92006)

    assert _write_duo_turn(state, "question with malformed Atlas response", 206) == "synthetic Valentina draft"
    assert "ATLAS CLIENT MEMORY" not in model_inputs[0]
    assert warnings == [
        (
            "atlas_dossier_fetch_failed",
            {"reason": "invalid_response", "error_type": "ValueError"},
        )
    ]


def test_two_role_unmapped_client_is_a_normal_stranger(monkeypatch):
    calls = []
    model_inputs = []
    warnings = _capture_warnings(monkeypatch)
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
                },
                "text": "",
            }
        ),
        calls,
    )
    _install_duo_writer(monkeypatch, model_inputs)
    state = create_session_state("chat:92007", client_id=207, chat_id=92007)

    assert _write_duo_turn(state, "first question from an unmapped client", 207) == "synthetic Valentina draft"
    assert "CLIENT MESSAGE:\nfirst question from an unmapped client" in model_inputs[0]
    assert "ATLAS CLIENT MEMORY" not in model_inputs[0]
    assert len(calls) == 1
    assert warnings == []


def test_sabri_receives_only_valentina_prose_never_raw_atlas_memory(monkeypatch):
    calls = []
    model_inputs = []
    sabri_sources = []
    memory_text = "RAW_SYNTHETIC_ATLAS_MEMORY_MUST_NOT_REACH_SABRI"
    valentina_output = "Valentina prose derived from her complete private context."
    monkeypatch.setattr(reading_reveal, "get_app_settings", lambda: _settings())
    _install_http_client(
        monkeypatch,
        lambda _url, _headers: _FakeResponse(
            payload={"dossier": {"client": {"clientCode": "AV-SABRI"}}, "text": memory_text}
        ),
        calls,
    )
    _install_duo_writer(monkeypatch, model_inputs, output=valentina_output)

    async def fake_sabri(_chat_id, _message, _entry, _state, source_content, is_new):
        assert is_new is True
        sabri_sources.append(source_content)
        return ["humanized bubble"], ""

    monkeypatch.setattr(reading_duo, "_sabri_turn", fake_sabri)
    state = create_session_state("chat:92008", client_id=208, chat_id=92008)
    record_client_message(state, "question for Sabri boundary proof")
    trigger = state.chat_transcript[-1]

    asyncio.run(
        reading_duo._duo_generate(
            92008,
            "question for Sabri boundary proof",
            trigger,
            state,
            208,
            forced_route="new",
            psychic_id=301,
        )
    )

    assert memory_text in model_inputs[0]
    assert sabri_sources == [valentina_output]
    assert memory_text not in sabri_sources[0]


def test_pair_siloing_keeps_account_dob_numerology_shared(monkeypatch):
    calls = []
    model_inputs = []
    pair_memory = "VALENTINA_ONLY_PAIR_MEMORY"
    monkeypatch.setattr(reading_reveal, "get_app_settings", lambda: _settings())

    def pair_response(url, _headers):
        text = pair_memory if url.endswith("/301") else ""
        return _FakeResponse(payload={"dossier": {}, "text": text})

    _install_http_client(monkeypatch, pair_response, calls)
    _install_duo_writer(
        monkeypatch,
        model_inputs,
        account_dob=date(1990, 5, 14),
    )

    valentina_state = create_session_state("chat:92009", client_id=209, chat_id=92009)
    stranger_state = create_session_state("chat:92010", client_id=209, chat_id=92010)
    _write_duo_turn(valentina_state, "same client with Valentina", 209, psychic_id=301)
    _write_duo_turn(stranger_state, "same client with Sophie", 209, psychic_id=302)

    assert [call["url"] for call in calls] == [
        f"{_BASE_URL}/internal/atlas/dossier/209/301",
        f"{_BASE_URL}/internal/atlas/dossier/209/302",
    ]
    assert pair_memory in model_inputs[0]
    assert pair_memory not in model_inputs[1]
    assert "KNOWN NUMEROLOGY" in model_inputs[0]
    assert "Life Path: 11" in model_inputs[0]
    assert "KNOWN NUMEROLOGY" in model_inputs[1]
    assert "Life Path: 11" in model_inputs[1]
