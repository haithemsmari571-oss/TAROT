"""Synthetic safety tests for the disabled-by-default Second Brain projection.

These tests deliberately mount only the new router.  They never import
``app.main`` or ``app.database.client``, never load application settings, and
never enter a production lifespan.
"""

from __future__ import annotations

import ast
import importlib.util
import json
import logging
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from sqlalchemy import event

from app.dependencies import second_brain_readonly_auth as readonly_auth
from app.enums.author_type import AuthorType
from app.enums.chat_session_status import ChatSessionStatus
from app.enums.chat_status import ChatStatus
from app.enums.message_status import MessageStatus
from app.enums.response_mode import ResponseMode
from app.enums.role import Role
from app.integrations.second_brain_readonly_config import (
    SecondBrainReadonlyConfig,
    load_second_brain_readonly_config,
)
from app.models.ai_draft import AiDraft
from app.models.chat import Chat
from app.models.chat_session import ChatSession
from app.models.message import Message
from app.models.notification import Notification
from app.services import second_brain_readonly as readonly_service


BACKEND_ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT_PREFIX = "/api/integrations/second-brain/valentina/v1"
SNAPSHOT_PATH = f"{SNAPSHOT_PREFIX}/snapshot"
SYNTHETIC_TOKEN = "synthetic_phase1a_token_0000000000000001"
AUTH_HEADERS = {"Authorization": f"Bearer {SYNTHETIC_TOKEN}"}


def _load_router_without_package_side_effects() -> ModuleType:
    """Load the route file without executing ``app.routers.__init__``.

    That package initializer imports every website router, including production
    database and reading routes.  Phase 1A tests need only this isolated file.
    """

    path = BACKEND_ROOT / "app" / "routers" / "second_brain_readonly.py"
    spec = importlib.util.spec_from_file_location(
        "phase1a_second_brain_readonly_router_under_test", path
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


readonly_router = _load_router_without_package_side_effects()


def _config(
    *,
    enabled: bool = True,
    token: str | None = SYNTHETIC_TOKEN,
    allowed_ids: frozenset[int] = frozenset({1}),
    errors: tuple[str, ...] = (),
) -> SecondBrainReadonlyConfig:
    return SecondBrainReadonlyConfig(
        enabled=enabled,
        token=token,
        allowed_psychic_ids=allowed_ids,
        validation_errors=errors,
    )


def _build_app(
    config: SecondBrainReadonlyConfig,
    db_provider,
) -> tuple[FastAPI, TestClient]:
    app = FastAPI()
    app.include_router(readonly_router.router, prefix=SNAPSHOT_PREFIX)
    app.dependency_overrides[
        readonly_auth.get_second_brain_readonly_config
    ] = lambda: config
    app.dependency_overrides[
        readonly_router.get_second_brain_readonly_db
    ] = db_provider
    return app, TestClient(app, raise_server_exceptions=False)


def _flatten_messages(payload: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        message
        for conversation in payload["conversations"]
        for session in conversation["sessions"]
        for message in session["messages"]
    ]


def _collect_keys(value: Any) -> set[str]:
    if isinstance(value, dict):
        return set(value).union(*(_collect_keys(item) for item in value.values()))
    if isinstance(value, list):
        return set().union(*(_collect_keys(item) for item in value))
    return set()


def _sqlite_stable_datetime(value: datetime) -> datetime:
    """Normalize SQLite's timezone-naive reloads for before/after comparison."""

    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


@pytest.fixture
def projection_data(db, make_user):
    """Two synthetic psychics, with only the first intended to be allowlisted."""

    client = make_user(role=Role.USER)
    client.username = "synthetic-client-visible"
    client.email = "forbidden-client-email@example.test"
    client.password_hash = "forbidden-synthetic-password-hash"
    client.date_of_birth = date(1991, 2, 3)
    client.balance = 91.25
    client.credit_balance = 17.5

    psychic = make_user(role=Role.PSYCHIC)
    psychic.username = "synthetic-valentina-profile"
    psychic.email = "forbidden-psychic-email@example.test"

    excluded_client = make_user(role=Role.USER)
    excluded_client.username = "synthetic-excluded-client"
    excluded_psychic = make_user(role=Role.PSYCHIC)
    excluded_psychic.username = "synthetic-excluded-psychic"
    db.commit()

    t0 = datetime(2026, 7, 15, 12, 0, tzinfo=UTC)
    chat = Chat(
        user_id=client.id,
        psychic_id=psychic.id,
        status=ChatStatus.ACTIVE,
        response_mode=ResponseMode.SABRI,
        created_at=t0,
        updated_at=t0 + timedelta(minutes=40),
    )
    excluded_chat = Chat(
        user_id=excluded_client.id,
        psychic_id=excluded_psychic.id,
        status=ChatStatus.ACTIVE,
        response_mode=ResponseMode.HUMAN,
        created_at=t0,
        updated_at=t0 + timedelta(minutes=5),
    )
    db.add_all([chat, excluded_chat])
    db.flush()

    # Two durable reading sessions own linked messages. One deliberately legacy
    # row remains unassigned so the compatibility bucket is also exercised.
    sessions = [
        ChatSession(
            chat_id=chat.id,
            status=ChatSessionStatus.COMPLETED,
            created_at=t0 + timedelta(minutes=1),
            updated_at=t0 + timedelta(minutes=18),
        ),
        ChatSession(
            chat_id=chat.id,
            status=ChatSessionStatus.ACTIVE,
            created_at=t0 + timedelta(minutes=20),
            updated_at=t0 + timedelta(minutes=39),
        ),
    ]
    db.add_all(sessions)

    # Insert out of chronological order; two rows share a timestamp so ID is
    # required as the persistent tie-breaker.
    messages = [
        Message(
            chat_id=chat.id,
            chat_session=sessions[1],
            sender_id=psychic.id,
            content="synthetic-late-reader-message",
            status=MessageStatus.DELIVERED,
            author_type=AuthorType.AI_DRAFTED,
            created_at=t0 + timedelta(minutes=31),
            updated_at=t0 + timedelta(minutes=31),
        ),
        Message(
            chat_id=chat.id,
            chat_session=sessions[0],
            sender_id=client.id,
            content="synthetic-early-client-message",
            status=MessageStatus.READ,
            author_type=AuthorType.HUMAN_PSYCHIC,
            created_at=t0 + timedelta(minutes=5),
            updated_at=t0 + timedelta(minutes=6),
        ),
        Message(
            chat_id=chat.id,
            chat_session=sessions[1],
            sender_id=client.id,
            content="synthetic-tied-client-message",
            status=MessageStatus.SENT,
            author_type=AuthorType.HUMAN_PSYCHIC,
            created_at=t0 + timedelta(minutes=22),
            updated_at=t0 + timedelta(minutes=22),
        ),
        Message(
            chat_id=chat.id,
            chat_session=sessions[1],
            sender_id=psychic.id,
            content="synthetic-tied-reader-message",
            status=MessageStatus.FAILED,
            author_type=AuthorType.HUMAN_PSYCHIC,
            created_at=t0 + timedelta(minutes=22),
            updated_at=t0 + timedelta(minutes=23),
        ),
        Message(
            chat_id=chat.id,
            sender_id=None,
            content="synthetic-system-message",
            status=MessageStatus.SENT,
            is_system=True,
            author_type=AuthorType.SYSTEM,
            created_at=t0 + timedelta(minutes=35),
            updated_at=t0 + timedelta(minutes=35),
        ),
        Message(
            chat_id=excluded_chat.id,
            sender_id=excluded_client.id,
            content="forbidden-excluded-message-body",
            status=MessageStatus.SENT,
            author_type=AuthorType.HUMAN_PSYCHIC,
            created_at=t0 + timedelta(minutes=3),
            updated_at=t0 + timedelta(minutes=3),
        ),
    ]
    db.add_all(messages)
    db.commit()

    draft = AiDraft(
        chat_id=chat.id,
        client_message_id=messages[1].id,
        mode=ResponseMode.HYBRID,
        draft_text="forbidden-raw-valentina-draft",
        sabri_flags='["forbidden-raw-sabri-flag"]',
        sabri_passed=False,
        attempts=1,
    )
    db.add(draft)
    db.commit()

    allowed_messages = sorted(
        messages[:5], key=lambda message: (message.created_at, message.id)
    )
    return {
        "client": client,
        "psychic": psychic,
        "excluded_client": excluded_client,
        "excluded_psychic": excluded_psychic,
        "chat": chat,
        "excluded_chat": excluded_chat,
        "sessions": sessions,
        "messages": messages,
        "allowed_messages": allowed_messages,
        "draft": draft,
    }


def test_process_configuration_is_disabled_and_fail_closed_by_default():
    default = load_second_brain_readonly_config({})
    assert default.enabled is False
    assert default.ready is False
    assert default.allowed_psychic_ids == frozenset()

    wildcard = load_second_brain_readonly_config(
        {
            "SECOND_BRAIN_READONLY_ENABLED": "true",
            "SECOND_BRAIN_READONLY_TOKEN": SYNTHETIC_TOKEN,
            "SECOND_BRAIN_VALENTINA_PSYCHIC_IDS": "*",
        }
    )
    assert wildcard.ready is False
    assert wildcard.allowed_psychic_ids == frozenset()


@pytest.mark.parametrize(
    "config",
    [
        _config(enabled=False),
        _config(token=None, errors=("missing_token",)),
        _config(allowed_ids=frozenset(), errors=("missing_psychic_allowlist",)),
        _config(allowed_ids=frozenset(), errors=("invalid_psychic_allowlist",)),
    ],
)
def test_disabled_or_incomplete_configuration_reveals_nothing_and_skips_db(config):
    db_calls: list[bool] = []

    def forbidden_db():
        db_calls.append(True)
        raise AssertionError("database dependency must not run")

    _, client = _build_app(config, forbidden_db)
    response = client.get(SNAPSHOT_PATH, headers=AUTH_HEADERS)

    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}
    assert response.headers["cache-control"] == "no-store"
    assert db_calls == []
    assert SYNTHETIC_TOKEN not in response.text


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Authorization": "Basic synthetic"},
        {"Authorization": "Bearer"},
        {"Authorization": "Bearer wrong_synthetic_token_000000000000000"},
    ],
)
def test_missing_malformed_and_wrong_credentials_are_rejected_before_db(headers):
    db_calls: list[bool] = []

    def forbidden_db():
        db_calls.append(True)
        raise AssertionError("database dependency must not run")

    _, client = _build_app(_config(), forbidden_db)
    response = client.get(SNAPSHOT_PATH, headers=headers)

    assert response.status_code == 401
    assert response.json() == {"detail": "Unauthorized"}
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["www-authenticate"] == "Bearer"
    assert db_calls == []
    assert SYNTHETIC_TOKEN not in response.text


def test_query_string_token_is_never_accepted():
    db_calls: list[bool] = []
    _, client = _build_app(_config(), lambda: db_calls.append(True))

    response = client.get(SNAPSHOT_PATH, params={"token": SYNTHETIC_TOKEN})

    assert response.status_code == 401
    assert db_calls == []


def test_bearer_credential_is_compared_with_compare_digest(monkeypatch):
    calls: list[tuple[bytes, bytes]] = []
    real_compare_digest = readonly_auth.secrets.compare_digest

    def recording_compare_digest(left: bytes, right: bytes) -> bool:
        calls.append((left, right))
        return real_compare_digest(left, right)

    monkeypatch.setattr(
        readonly_auth.secrets, "compare_digest", recording_compare_digest
    )
    credentials = HTTPAuthorizationCredentials(
        scheme="Bearer", credentials=SYNTHETIC_TOKEN
    )

    scope = readonly_auth.require_second_brain_readonly_access(
        credentials, _config(allowed_ids=frozenset({7, 11}))
    )

    assert scope.allowed_psychic_ids == frozenset({7, 11})
    assert calls == [(SYNTHETIC_TOKEN.encode(), SYNTHETIC_TOKEN.encode())]
    assert "token" not in repr(scope).casefold()


def test_valid_get_matches_locked_v1_source_shape_and_keeps_clients_isolated(
    db, projection_data
):
    allowed_id = projection_data["psychic"].id
    app, client = _build_app(
        _config(allowed_ids=frozenset({allowed_id})), lambda: db
    )

    response = client.get(SNAPSHOT_PATH, headers=AUTH_HEADERS, params={"limit": "50"})

    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    payload = response.json()
    assert set(payload) == {
        "contractVersion",
        "cursor",
        "revision",
        "lastRefreshAt",
        "staleAfterMs",
        "connection",
        "conversations",
    }
    assert payload["contractVersion"] == "askvalentina.readonly.v1"
    assert payload["staleAfterMs"] == 300_000
    assert set(payload["connection"]) == {
        "reportedConnected",
        "checkedAt",
        "reason",
    }
    assert payload["connection"]["reportedConnected"] is True
    assert payload["connection"]["reason"] == "legacy_messages_without_reading_session"

    assert len(payload["conversations"]) == 1
    conversation = payload["conversations"][0]
    assert conversation["externalConversationId"] == f"chat:{projection_data['chat'].id}"
    assert conversation["reportedMode"] == "automatic"
    assert conversation["chatStatus"] == "active"
    assert conversation["internalHandler"] == {
        "kind": "unassigned",
        "internalHandlerId": None,
        "displayName": None,
    }
    assert conversation["publicPsychicProfile"]["externalPsychicId"] == (
        f"psychic:{allowed_id}"
    )

    persistent_sessions = [
        session
        for session in conversation["sessions"]
        if session["externalReadingSessionId"].startswith("chat-session:")
    ]
    unassigned_sessions = [
        session
        for session in conversation["sessions"]
        if session["externalReadingSessionId"].startswith("unassigned:chat:")
    ]
    assert len(persistent_sessions) == 2
    assert [len(session["messages"]) for session in persistent_sessions] == [1, 3]
    assert len(unassigned_sessions) == 1
    assert unassigned_sessions[0]["startedAt"] is None
    assert unassigned_sessions[0]["endedAt"] is None
    assert len(unassigned_sessions[0]["messages"]) == 1
    assert all(
        message["externalReadingSessionId"]
        == unassigned_sessions[0]["externalReadingSessionId"]
        for message in unassigned_sessions[0]["messages"]
    )

    flattened = _flatten_messages(payload)
    assert [message["externalMessageId"] for message in flattened] == [
        f"message:{message.id}" for message in projection_data["allowed_messages"]
    ]
    assert [message["sequence"] for message in flattened] == [1, 1, 2, 3, 1]
    assert [message["direction"] for message in flattened] == [
        "inbound",
        "inbound",
        "outbound",
        "outbound",
        "system",
    ]
    assert [message["delivery"] for message in flattened] == [
        "read",
        "sent",
        "failed",
        "delivered",
        "not_applicable",
    ]

    response_text = response.text
    for forbidden_value in (
        "forbidden-client-email@example.test",
        "forbidden-psychic-email@example.test",
        "forbidden-synthetic-password-hash",
        "forbidden-excluded-message-body",
        "synthetic-excluded-client",
        "synthetic-excluded-psychic",
        "forbidden-raw-valentina-draft",
        "forbidden-raw-sabri-flag",
    ):
        assert forbidden_value not in response_text

    forbidden_keys = {
        "email",
        "phone",
        "dateOfBirth",
        "passwordHash",
        "balance",
        "creditBalance",
        "psychicToken",
        "token",
        "draftText",
        "sabriFlags",
        "dossier",
        "clientNotes",
        "prompt",
        "modelContext",
    }
    assert _collect_keys(payload).isdisjoint(forbidden_keys)

    route = next(route for route in app.routes if route.path == SNAPSHOT_PATH)
    assert route.methods == {"GET"}
    assert route.include_in_schema is False
    assert SNAPSHOT_PATH not in app.openapi()["paths"]


def test_projection_uses_select_only_and_changes_no_fields_or_side_effect_tables(
    db, projection_data
):
    chat = projection_data["chat"]
    messages = projection_data["messages"]
    sessions = projection_data["sessions"]
    client_user = projection_data["client"]
    before = {
        "chat": (
            chat.status,
            chat.response_mode,
            _sqlite_stable_datetime(chat.updated_at),
        ),
        "sessions": [
            (item.id, item.status, _sqlite_stable_datetime(item.updated_at))
            for item in sessions
        ],
        "messages": [
            (
                item.id,
                item.status,
                item.content,
                _sqlite_stable_datetime(item.created_at),
                _sqlite_stable_datetime(item.updated_at),
            )
            for item in messages
        ],
        "client_online": client_user.is_online,
        "notifications": db.query(Notification).count(),
        "drafts": db.query(AiDraft).count(),
    }
    statements: list[str] = []

    def record_statement(_conn, _cursor, statement, _parameters, _context, _many):
        statements.append(statement)

    engine = db.get_bind()
    event.listen(engine, "before_cursor_execute", record_statement)
    try:
        _, client = _build_app(
            _config(allowed_ids=frozenset({projection_data["psychic"].id})),
            lambda: db,
        )
        response = client.get(
            SNAPSHOT_PATH, headers=AUTH_HEADERS, params={"limit": "50"}
        )
    finally:
        event.remove(engine, "before_cursor_execute", record_statement)

    assert response.status_code == 200, response.text
    assert statements
    assert all(
        statement.lstrip().upper().startswith(("SELECT", "WITH"))
        for statement in statements
    )
    sql = "\n".join(statements).casefold()
    for forbidden_sql in (
        " insert ",
        " update ",
        " delete ",
        "ai_drafts",
        "client_notes",
        "notifications",
        ".email",
        "date_of_birth",
        "password_hash",
        "credit_balance",
    ):
        assert forbidden_sql not in sql

    assert not db.new
    assert not db.dirty
    assert not db.deleted
    db.expire_all()
    refreshed_chat = db.get(Chat, chat.id)
    refreshed_client = db.get(type(client_user), client_user.id)
    refreshed_sessions = [db.get(ChatSession, item.id) for item in sessions]
    refreshed_messages = [db.get(Message, item.id) for item in messages]
    assert refreshed_chat is not None and refreshed_client is not None
    assert (
        refreshed_chat.status,
        refreshed_chat.response_mode,
        _sqlite_stable_datetime(refreshed_chat.updated_at),
    ) == before["chat"]
    assert [
        (item.id, item.status, _sqlite_stable_datetime(item.updated_at))
        for item in refreshed_sessions
        if item
    ] == before["sessions"]
    assert [
        (
            item.id,
            item.status,
            item.content,
            _sqlite_stable_datetime(item.created_at),
            _sqlite_stable_datetime(item.updated_at),
        )
        for item in refreshed_messages
        if item
    ] == before["messages"]
    assert refreshed_client.is_online == before["client_online"]
    assert db.query(Notification).count() == before["notifications"]
    assert db.query(AiDraft).count() == before["drafts"]


def test_pagination_order_cursor_and_deduplication_are_deterministic(
    db, projection_data
):
    allowed_id = projection_data["psychic"].id
    _, client = _build_app(
        _config(allowed_ids=frozenset({allowed_id})), lambda: db
    )

    first = client.get(
        SNAPSHOT_PATH, headers=AUTH_HEADERS, params={"limit": "2"}
    )
    repeated_first = client.get(
        SNAPSHOT_PATH, headers=AUTH_HEADERS, params={"limit": "2"}
    )
    assert first.status_code == repeated_first.status_code == 200
    assert first.json()["cursor"] == repeated_first.json()["cursor"]
    assert first.json()["cursor"] is not None
    assert "{" not in first.json()["cursor"]

    cursor = None
    seen_ids: list[str] = []
    revisions: set[int] = set()
    while True:
        params = {"limit": "2"}
        if cursor is not None:
            params["cursor"] = cursor
        response = client.get(SNAPSHOT_PATH, headers=AUTH_HEADERS, params=params)
        assert response.status_code == 200, response.text
        payload = response.json()
        revisions.add(payload["revision"])
        seen_ids.extend(
            message["externalMessageId"] for message in _flatten_messages(payload)
        )
        cursor = payload["cursor"]
        if cursor is None:
            break

    expected_ids = [
        f"message:{message.id}" for message in projection_data["allowed_messages"]
    ]
    assert seen_ids == expected_ids
    assert len(seen_ids) == len(set(seen_ids))
    assert len(revisions) == 1

    high_water_id = readonly_service._read_high_water_id(db, (allowed_id,))
    rows = readonly_service._read_message_page(
        db,
        allowed_ids=(allowed_id,),
        page_size=50,
        cursor=None,
        high_water_id=high_water_id,
    )
    duplicated = readonly_service._deduplicate_message_rows(
        [dict(rows[0]), dict(rows[0])]
    )
    assert len(duplicated) == 1
    conflicting = dict(rows[0])
    conflicting["content"] = "conflicting-synthetic-body"
    with pytest.raises(
        readonly_service.SecondBrainReadonlyProjectionInvariantError
    ):
        readonly_service._deduplicate_message_rows(
            [dict(rows[0]), conflicting]
        )


def test_repeated_conversation_and_session_shells_are_stable_across_large_pages(
    db, projection_data
):
    chat = projection_data["chat"]
    client = projection_data["client"]
    psychic = projection_data["psychic"]
    later = datetime(2026, 8, 1, 9, 0, tzinfo=UTC)
    extra_messages = [
        Message(
            chat_id=chat.id,
            sender_id=client.id if index % 2 == 0 else psychic.id,
            content=f"synthetic-pagination-message-{index:02d}",
            status=MessageStatus.SENT,
            author_type=AuthorType.HUMAN_PSYCHIC,
            created_at=later + timedelta(seconds=index),
            updated_at=later + timedelta(seconds=index, microseconds=index),
        )
        for index in range(56)
    ]
    db.add_all(extra_messages)
    db.commit()

    _, client_api = _build_app(
        _config(allowed_ids=frozenset({psychic.id})), lambda: db
    )
    conversation_shells: dict[str, dict[str, Any]] = {}
    session_shells: dict[str, dict[str, Any]] = {}
    repeated_conversations: set[str] = set()
    repeated_sessions: set[str] = set()
    seen_message_ids: list[str] = []
    cursor = None
    page_count = 0

    while True:
        params = {"limit": "50"}
        if cursor is not None:
            params["cursor"] = cursor
        response = client_api.get(
            SNAPSHOT_PATH,
            headers=AUTH_HEADERS,
            params=params,
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        page_count += 1

        for conversation in payload["conversations"]:
            conversation_id = conversation["externalConversationId"]
            conversation_shell = {
                key: value
                for key, value in conversation.items()
                if key != "sessions"
            }
            if conversation_id in conversation_shells:
                repeated_conversations.add(conversation_id)
                assert conversation_shell == conversation_shells[conversation_id]
            else:
                conversation_shells[conversation_id] = conversation_shell

            for session in conversation["sessions"]:
                session_id = session["externalReadingSessionId"]
                session_shell = {
                    key: value
                    for key, value in session.items()
                    if key != "messages"
                }
                if session_id in session_shells:
                    repeated_sessions.add(session_id)
                    assert session_shell == session_shells[session_id]
                else:
                    session_shells[session_id] = session_shell
                seen_message_ids.extend(
                    message["externalMessageId"]
                    for message in session["messages"]
                )

        cursor = payload["cursor"]
        if cursor is None:
            break

    assert page_count == 2
    assert repeated_conversations == {f"chat:{chat.id}"}
    assert repeated_sessions == {
        *(f"chat-session:{session.id}" for session in projection_data["sessions"]),
        f"unassigned:chat:{chat.id}",
    }
    assert len(seen_message_ids) == 61
    assert len(seen_message_ids) == len(set(seen_message_ids))


@pytest.mark.parametrize("limit", ["0", "51", "-1", "1.5", "１２"])
def test_invalid_page_sizes_fail_closed_with_no_store(db, projection_data, limit):
    _, client = _build_app(
        _config(allowed_ids=frozenset({projection_data["psychic"].id})),
        lambda: db,
    )
    response = client.get(
        SNAPSHOT_PATH, headers=AUTH_HEADERS, params={"limit": limit}
    )
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid page size"}
    assert response.headers["cache-control"] == "no-store"


def test_invalid_cursor_fails_closed_instead_of_restarting_page_one(
    db, projection_data
):
    _, client = _build_app(
        _config(allowed_ids=frozenset({projection_data["psychic"].id})),
        lambda: db,
    )
    response = client.get(
        SNAPSHOT_PATH,
        headers=AUTH_HEADERS,
        params={"cursor": "not-valid-%%"},
    )
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid cursor"}
    assert response.headers["cache-control"] == "no-store"
    assert "synthetic-early-client-message" not in response.text


def test_cursor_rejects_ids_outside_the_persistent_integer_range(
    db, projection_data
):
    _, client = _build_app(
        _config(allowed_ids=frozenset({projection_data["psychic"].id})),
        lambda: db,
    )
    cursor = readonly_service._encode_cursor(
        readonly_service._Cursor(
            after_created_at=datetime(2026, 7, 15, tzinfo=UTC),
            after_id=1,
            high_water_id=2**63,
            snapshot_revision=1,
        )
    )

    response = client.get(
        SNAPSHOT_PATH,
        headers=AUTH_HEADERS,
        params={"cursor": cursor},
    )

    assert response.status_code == 400
    assert response.headers["cache-control"] == "no-store"


def test_cursor_walk_fails_closed_if_the_projection_changes(db, projection_data):
    _, client = _build_app(
        _config(allowed_ids=frozenset({projection_data["psychic"].id})),
        lambda: db,
    )
    first = client.get(
        SNAPSHOT_PATH,
        headers=AUTH_HEADERS,
        params={"limit": "2"},
    )
    assert first.status_code == 200
    cursor = first.json()["cursor"]
    assert cursor is not None

    changed = projection_data["allowed_messages"][0]
    changed.status = MessageStatus.DELIVERED
    changed.updated_at = datetime(2099, 1, 1, tzinfo=UTC)
    db.commit()

    continued = client.get(
        SNAPSHOT_PATH,
        headers=AUTH_HEADERS,
        params={"limit": "2", "cursor": cursor},
    )

    assert continued.status_code == 409
    assert continued.json() == {"detail": "Projection unavailable"}
    assert continued.headers["cache-control"] == "no-store"


def test_non_get_methods_are_inert_and_never_resolve_dependencies():
    db_calls: list[bool] = []
    _, client = _build_app(_config(), lambda: db_calls.append(True))
    for method in ("post", "put", "patch", "delete"):
        response = getattr(client, method)(SNAPSHOT_PATH, headers=AUTH_HEADERS)
        assert response.status_code == 405
    assert db_calls == []


def test_no_secret_identity_or_message_body_enters_logs(
    db, projection_data, caplog, capsys
):
    _, client = _build_app(
        _config(allowed_ids=frozenset({projection_data["psychic"].id})),
        lambda: db,
    )
    caplog.clear()
    with caplog.at_level(logging.DEBUG):
        success = client.get(SNAPSHOT_PATH, headers=AUTH_HEADERS)
        rejected = client.get(
            SNAPSHOT_PATH,
            headers={
                "Authorization": "Bearer wrong_synthetic_token_000000000000000"
            },
        )
    captured = capsys.readouterr()
    rendered_logs = caplog.text + captured.out + captured.err

    assert success.status_code == 200
    assert rejected.status_code == 401
    for forbidden_value in (
        SYNTHETIC_TOKEN,
        "wrong_synthetic_token_000000000000000",
        "synthetic-client-visible",
        "synthetic-early-client-message",
        "forbidden-client-email@example.test",
    ):
        assert forbidden_value not in rendered_logs


def test_new_modules_have_no_workflow_side_effect_or_logging_imports():
    files = [
        BACKEND_ROOT / "app" / "integrations" / "second_brain_readonly_config.py",
        BACKEND_ROOT / "app" / "dependencies" / "second_brain_readonly_auth.py",
        BACKEND_ROOT / "app" / "schemas" / "second_brain_readonly.py",
        BACKEND_ROOT / "app" / "services" / "second_brain_readonly.py",
        BACKEND_ROOT / "app" / "routers" / "second_brain_readonly.py",
    ]
    forbidden_import_prefixes = (
        "app.services.ai",
        "app.services.chats",
        "app.services.session_manager",
        "app.manager",
        "app.notification_manager",
        "httpx",
        "websockets",
        "anthropic",
        "stripe",
        "logging",
        "structlog",
        "importlib",
    )

    for path in files:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imported = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom):
                imported = [node.module or ""]
            else:
                imported = []
            assert not any(
                name.startswith(forbidden_import_prefixes) for name in imported
            ), (path.name, imported)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                assert node.func.id not in {"__import__", "print"}

    service_tree = ast.parse(
        (BACKEND_ROOT / "app" / "services" / "second_brain_readonly.py").read_text(
            encoding="utf-8"
        )
    )
    mutating_methods = {
        node.func.attr
        for node in ast.walk(service_tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
    }
    assert mutating_methods.isdisjoint({"add", "add_all", "commit", "flush", "delete"})

    router_tree = ast.parse(
        (BACKEND_ROOT / "app" / "routers" / "second_brain_readonly.py").read_text(
            encoding="utf-8"
        )
    )
    database_imports = [
        node
        for node in ast.walk(router_tree)
        if isinstance(node, ast.ImportFrom) and node.module == "app.database.client"
    ]
    assert len(database_imports) == 1
    assert database_imports[0].col_offset > 0  # lazy, inside the authenticated dependency


def test_production_registration_is_present_without_importing_main():
    router_init_path = BACKEND_ROOT / "app" / "routers" / "__init__.py"
    main_path = BACKEND_ROOT / "app" / "main.py"
    router_init_text = router_init_path.read_text(encoding="utf-8")
    main_text = main_path.read_text(encoding="utf-8")

    assert (
        "from .second_brain_readonly import router as second_brain_readonly_router"
        in router_init_text
    )
    assert '"second_brain_readonly_router"' in router_init_text

    tree = ast.parse(main_text, filename=str(main_path))
    registrations = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        if node.func.attr != "include_router" or not node.args:
            continue
        first_arg = node.args[0]
        if not isinstance(first_arg, ast.Name):
            continue
        if first_arg.id != "second_brain_readonly_router":
            continue
        prefix = next(
            (
                keyword.value.value
                for keyword in node.keywords
                if keyword.arg == "prefix"
                and isinstance(keyword.value, ast.Constant)
                and isinstance(keyword.value.value, str)
            ),
            None,
        )
        registrations.append(prefix)
    assert registrations == [SNAPSHOT_PREFIX]
