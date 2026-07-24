"""Phase 1C loopback-only fixture for the real Valentina read-only endpoint.

This process deliberately avoids ``app.main``, the production lifespan, the
production database client, and the ``app.routers`` package initializer.  It
mounts the actual Phase 1A router file and overrides only that router's database
dependency with a disposable, schema-compatible in-memory SQLite session.

Required process environment:

* ``PHASE1C_WEBSITE_PORT`` -- an unused loopback TCP port.
* ``PHASE1C_SCENARIO`` -- ``normal`` or ``conflict_once``.
* ``SECOND_BRAIN_READONLY_ENABLED`` -- exactly ``true``.
* ``SECOND_BRAIN_READONLY_TOKEN`` -- the temporary URL-safe bearer credential.
* ``SECOND_BRAIN_VALENTINA_PSYCHIC_IDS`` -- exactly the synthetic allowlist.

The fixture never prints credentials or synthetic message bodies.  Its safe
proof route returns only counts, hashes, booleans, response status metadata,
and cursor-presence metadata.
"""

from __future__ import annotations

import hashlib
import importlib
import importlib.util
import json
import os
import socket
import sys
import threading
from collections.abc import Generator, Mapping
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import ModuleType
from typing import Any

import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.integrations.second_brain_readonly_config import (
    load_second_brain_readonly_config,
)


SNAPSHOT_PREFIX = "/api/integrations/second-brain/valentina/v1"
SNAPSHOT_PATH = f"{SNAPSHOT_PREFIX}/snapshot"
PROOF_PATH = "/__phase1c__/proof"
SHUTDOWN_PATH = "/__phase1c__/shutdown"

ALLOWED_PSYCHIC_ID = 900
EXCLUDED_PSYCHIC_ID = 901
EXPECTED_ALLOWED_MESSAGES = 62
EXPECTED_EXCLUDED_MESSAGES = 3
EXPECTED_PERSISTENT_SESSIONS = 4

_TABLES = (
    "users",
    "chats",
    "chat_sessions",
    "messages",
    "notifications",
    "ai_drafts",
)
_PROTECTED_WORKFLOW_MODULES = (
    "app.services.ai.client",
    "app.services.ai.reading_pipeline",
    "app.services.ai.reading_duo",
    "app.services.ai.reading_valentina",
    "app.services.ai.reading_sabri",
    "app.services.ai.reading_reveal",
    "app.services.ai.reading_reader",
    "app.services.ai.reading_assistant",
    "app.services.ai.sabri_check",
    "app.services.client_dossier",
)


def _scenario_from_environment() -> str:
    scenario = os.environ.get("PHASE1C_SCENARIO", "normal")
    if scenario not in {"normal", "conflict_once"}:
        raise SystemExit("PHASE1C_SCENARIO must be normal or conflict_once.")
    return scenario


SCENARIO = _scenario_from_environment()


def _load_actual_router() -> ModuleType:
    """Load the real route file without importing ``app.routers``."""

    route_path = BACKEND_ROOT / "app" / "routers" / "second_brain_readonly.py"
    spec = importlib.util.spec_from_file_location(
        "phase1c_actual_second_brain_readonly_router",
        route_path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("The Phase 1A router could not be loaded safely.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


actual_router = _load_actual_router()
readonly_service = importlib.import_module("app.services.second_brain_readonly")


def _create_engine() -> Engine:
    return create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


engine = _create_engine()
TestingSession = sessionmaker(bind=engine, expire_on_commit=False)


_SCHEMA = """
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    is_online INTEGER NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

CREATE TABLE chats (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    psychic_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    response_mode TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

CREATE TABLE chat_sessions (
    id INTEGER PRIMARY KEY,
    chat_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

CREATE TABLE messages (
    id INTEGER PRIMARY KEY,
    chat_id INTEGER NOT NULL,
    sender_id INTEGER,
    content TEXT NOT NULL,
    status TEXT NOT NULL,
    is_system INTEGER NOT NULL,
    author_type TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

CREATE TABLE notifications (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER NOT NULL,
    data TEXT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

CREATE TABLE ai_drafts (
    id INTEGER PRIMARY KEY,
    chat_id INTEGER NOT NULL,
    client_message_id INTEGER,
    mode TEXT NOT NULL,
    draft_text TEXT NOT NULL,
    sabri_flags TEXT,
    sabri_passed INTEGER NOT NULL,
    attempts INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);
"""


def _iso_sql(value: datetime) -> str:
    return value.astimezone(UTC).replace(tzinfo=None).isoformat(
        sep=" ",
        timespec="microseconds",
    )


def _seed_database(target: Engine) -> tuple[str, ...]:
    """Create unmistakably synthetic rows and return sensitive body sentinels."""

    t0 = datetime(2026, 7, 16, 10, 0, tzinfo=UTC)
    synthetic_bodies: list[str] = []

    with target.begin() as connection:
        for statement in _SCHEMA.split(";"):
            if statement.strip():
                connection.exec_driver_sql(statement)

        users = (
            (101, "Synthetic Same Name", 1, t0, t0 + timedelta(minutes=2)),
            (102, "Synthetic Same Name", 0, t0, t0 + timedelta(minutes=3)),
            (103, "Synthetic Excluded Client", 1, t0, t0 + timedelta(minutes=4)),
            (ALLOWED_PSYCHIC_ID, "Synthetic Valentina", 1, t0, t0 + timedelta(minutes=5)),
            (EXCLUDED_PSYCHIC_ID, "Synthetic Excluded Psychic", 1, t0, t0 + timedelta(minutes=6)),
        )
        connection.exec_driver_sql(
            """
            INSERT INTO users (id, username, is_online, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                (user_id, username, is_online, _iso_sql(created), _iso_sql(updated))
                for user_id, username, is_online, created, updated in users
            ],
        )

        chats = (
            (1001, 101, ALLOWED_PSYCHIC_ID, "ACTIVE", "SABRI", t0, t0 + timedelta(minutes=59)),
            (1002, 102, ALLOWED_PSYCHIC_ID, "PAUSED", "HYBRID", t0 + timedelta(hours=1), t0 + timedelta(minutes=69)),
            (1003, 103, EXCLUDED_PSYCHIC_ID, "ACTIVE", "HUMAN", t0, t0 + timedelta(minutes=9)),
        )
        connection.exec_driver_sql(
            """
            INSERT INTO chats (
                id, user_id, psychic_id, status, response_mode, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    chat_id,
                    client_id,
                    psychic_id,
                    status,
                    mode,
                    _iso_sql(created),
                    _iso_sql(updated),
                )
                for chat_id, client_id, psychic_id, status, mode, created, updated in chats
            ],
        )

        sessions = (
            (2001, 1001, "COMPLETED", t0 + timedelta(minutes=1), t0 + timedelta(minutes=20)),
            (2002, 1001, "ACTIVE", t0 + timedelta(minutes=21), t0 + timedelta(minutes=58)),
            (2003, 1002, "DISCONNECTED", t0 + timedelta(minutes=60), t0 + timedelta(minutes=64)),
            (2004, 1002, "COMPLETED", t0 + timedelta(minutes=65), t0 + timedelta(minutes=68)),
        )
        connection.exec_driver_sql(
            """
            INSERT INTO chat_sessions (id, chat_id, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                (
                    session_id,
                    chat_id,
                    status,
                    _iso_sql(created),
                    _iso_sql(updated),
                )
                for session_id, chat_id, status, created, updated in sessions
            ],
        )

        statuses = ("SENDING", "SENT", "DELIVERED", "READ", "FAILED")
        allowed_rows: list[tuple[Any, ...]] = []
        for index in range(55):
            message_id = 3001 + index
            body = f"PHASE1C_SYNTHETIC_ALLOWED_CHAT_1001_MESSAGE_{index + 1:02d}"
            synthetic_bodies.append(body)
            created_at = t0 + timedelta(minutes=index, seconds=index % 3)
            is_system = index in {16, 33, 50}
            sender_id = None if is_system else (101 if index % 2 == 0 else ALLOWED_PSYCHIC_ID)
            author_type = "SYSTEM" if is_system else ("HUMAN_PSYCHIC" if index % 2 == 0 else "AI_DRAFTED")
            allowed_rows.append(
                (
                    message_id,
                    1001,
                    sender_id,
                    body,
                    statuses[index % len(statuses)],
                    int(is_system),
                    author_type,
                    _iso_sql(created_at),
                    _iso_sql(created_at + timedelta(seconds=(index % 5) + 1)),
                )
            )

        for index in range(7):
            message_id = 4001 + index
            body = f"PHASE1C_SYNTHETIC_ALLOWED_CHAT_1002_MESSAGE_{index + 1:02d}"
            synthetic_bodies.append(body)
            created_at = t0 + timedelta(minutes=60 + index, seconds=index % 2)
            is_system = index == 5
            sender_id = None if is_system else (102 if index % 2 == 0 else ALLOWED_PSYCHIC_ID)
            author_type = "SYSTEM" if is_system else ("HUMAN_PSYCHIC" if index % 2 == 0 else "AI_DRAFTED")
            allowed_rows.append(
                (
                    message_id,
                    1002,
                    sender_id,
                    body,
                    statuses[(index + 2) % len(statuses)],
                    int(is_system),
                    author_type,
                    _iso_sql(created_at),
                    _iso_sql(created_at + timedelta(seconds=(index % 4) + 1)),
                )
            )

        excluded_rows: list[tuple[Any, ...]] = []
        for index in range(EXPECTED_EXCLUDED_MESSAGES):
            body = f"PHASE1C_SYNTHETIC_EXCLUDED_MESSAGE_{index + 1:02d}"
            synthetic_bodies.append(body)
            created_at = t0 + timedelta(minutes=2 + index)
            excluded_rows.append(
                (
                    5001 + index,
                    1003,
                    103 if index % 2 == 0 else EXCLUDED_PSYCHIC_ID,
                    body,
                    statuses[index],
                    0,
                    "HUMAN_PSYCHIC",
                    _iso_sql(created_at),
                    _iso_sql(created_at + timedelta(seconds=1)),
                )
            )

        connection.exec_driver_sql(
            """
            INSERT INTO messages (
                id, chat_id, sender_id, content, status, is_system, author_type,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            allowed_rows + excluded_rows,
        )

        notification_body = "PHASE1C_NOTIFICATION_SENTINEL_MUST_REMAIN_PRIVATE"
        draft_body = "PHASE1C_AI_DRAFT_SENTINEL_MUST_REMAIN_PRIVATE"
        draft_flags = "PHASE1C_AI_DRAFT_FLAGS_MUST_REMAIN_PRIVATE"
        synthetic_bodies.extend((notification_body, draft_body, draft_flags))
        connection.exec_driver_sql(
            """
            INSERT INTO notifications (
                id, user_id, type, title, message, is_read, data, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                6001,
                101,
                "MESSAGE",
                "Synthetic notification sentinel",
                notification_body,
                0,
                None,
                _iso_sql(t0),
                _iso_sql(t0),
            ),
        )
        connection.exec_driver_sql(
            """
            INSERT INTO ai_drafts (
                id, chat_id, client_message_id, mode, draft_text, sabri_flags,
                sabri_passed, attempts, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                7001,
                1001,
                3001,
                "HYBRID",
                draft_body,
                draft_flags,
                0,
                1,
                "PENDING",
                _iso_sql(t0),
                _iso_sql(t0),
            ),
        )

    return tuple(synthetic_bodies)


_SYNTHETIC_PRIVATE_VALUES = _seed_database(engine)


def _canonical_rows(connection: Connection, statement: str) -> list[dict[str, Any]]:
    rows = connection.exec_driver_sql(statement).mappings().all()
    return [
        {key: row[key] for key in sorted(row)}
        for row in rows
    ]


def _digest(value: Any) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
        default=str,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _database_proof(target: Engine) -> dict[str, Any]:
    with target.connect() as connection:
        table_rows = {
            table: _canonical_rows(connection, f'SELECT * FROM "{table}" ORDER BY id')
            for table in _TABLES
        }
        evidence = {
            "allRows": table_rows,
            "messageStatuses": _canonical_rows(
                connection,
                "SELECT id, status FROM messages ORDER BY id",
            ),
            "userPresence": _canonical_rows(
                connection,
                "SELECT id, is_online FROM users ORDER BY id",
            ),
            "responseModes": _canonical_rows(
                connection,
                "SELECT id, response_mode FROM chats ORDER BY id",
            ),
            "notifications": table_rows["notifications"],
            "aiDrafts": table_rows["ai_drafts"],
        }
        return {
            "allRowsDigest": _digest(evidence["allRows"]),
            "messageStatusDigest": _digest(evidence["messageStatuses"]),
            "userPresenceDigest": _digest(evidence["userPresence"]),
            "responseModeDigest": _digest(evidence["responseModes"]),
            "notificationDigest": _digest(evidence["notifications"]),
            "aiDraftDigest": _digest(evidence["aiDrafts"]),
            "rowCounts": {
                table: len(rows)
                for table, rows in table_rows.items()
            },
        }


_BASELINE_DATABASE = _database_proof(engine)


_proof_lock = threading.Lock()
_request_trace: list[dict[str, Any]] = []
_sql_select_count = 0
_sql_non_select_count = 0
_revision_read_count = 0
_non_loopback_connect_count = 0


def _record_sql(
    _connection,
    _cursor,
    statement: str,
    _parameters,
    _context,
    _many,
) -> None:
    global _sql_non_select_count, _sql_select_count
    keyword = statement.lstrip().split(None, 1)[0].upper() if statement.strip() else ""
    with _proof_lock:
        if keyword in {"SELECT", "WITH"}:
            _sql_select_count += 1
        else:
            _sql_non_select_count += 1


event.listen(engine, "before_cursor_execute", _record_sql)


def _audit_socket_connect(event_name: str, arguments: tuple[Any, ...]) -> None:
    """Count, but never reveal, non-loopback outbound socket attempts."""

    global _non_loopback_connect_count
    if event_name != "socket.connect" or len(arguments) < 2:
        return
    address = arguments[1]
    if not isinstance(address, tuple) or not address:
        return
    host = str(address[0]).casefold()
    if host in {"127.0.0.1", "::1", "localhost"}:
        return
    with _proof_lock:
        _non_loopback_connect_count += 1


sys.addaudithook(_audit_socket_connect)


if SCENARIO == "conflict_once":
    _actual_read_snapshot_revision = readonly_service._read_snapshot_revision

    def _read_snapshot_revision_with_one_conflict(
        db: Session,
        allowed_ids: tuple[int, ...],
    ) -> int:
        global _revision_read_count
        actual_revision = _actual_read_snapshot_revision(db, allowed_ids)
        with _proof_lock:
            call_index = _revision_read_count
            _revision_read_count += 1
        if call_index == 0:
            return max(0, actual_revision - 1)
        return actual_revision

    readonly_service._read_snapshot_revision = _read_snapshot_revision_with_one_conflict
else:
    _actual_read_snapshot_revision = readonly_service._read_snapshot_revision

    def _read_snapshot_revision_counted(
        db: Session,
        allowed_ids: tuple[int, ...],
    ) -> int:
        global _revision_read_count
        actual_revision = _actual_read_snapshot_revision(db, allowed_ids)
        with _proof_lock:
            _revision_read_count += 1
        return actual_revision

    readonly_service._read_snapshot_revision = _read_snapshot_revision_counted


def _test_database_dependency() -> Generator[Session, None, None]:
    db = TestingSession()
    try:
        yield db
    finally:
        db.rollback()
        db.close()


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.include_router(actual_router.router, prefix=SNAPSHOT_PREFIX)
app.dependency_overrides[actual_router.get_second_brain_readonly_db] = (
    _test_database_dependency
)


@app.middleware("http")
async def _record_snapshot_response(request: Request, call_next):
    should_record = request.url.path == SNAPSHOT_PATH
    cursor_present = "cursor" in request.query_params if should_record else False
    response = await call_next(request)
    if should_record:
        with _proof_lock:
            _request_trace.append(
                {
                    "cursorPresent": cursor_present,
                    "methodIsGet": request.method == "GET",
                    "status": response.status_code,
                    "noStore": response.headers.get("cache-control") == "no-store",
                }
            )
    return response


def _data_shape_proof() -> dict[str, Any]:
    with engine.connect() as connection:
        allowed_conversation_count = connection.exec_driver_sql(
            "SELECT COUNT(*) FROM chats WHERE psychic_id = ?",
            (ALLOWED_PSYCHIC_ID,),
        ).scalar_one()
        same_label_clients = connection.exec_driver_sql(
            """
            SELECT COUNT(*)
            FROM users
            WHERE id IN (101, 102) AND username = 'Synthetic Same Name'
            """
        ).scalar_one()
        distinct_client_ids = connection.exec_driver_sql(
            "SELECT COUNT(DISTINCT id) FROM users WHERE id IN (101, 102)"
        ).scalar_one()
        distinct_conversation_ids = connection.exec_driver_sql(
            "SELECT COUNT(DISTINCT id) FROM chats WHERE id IN (1001, 1002)"
        ).scalar_one()
        allowed_message_count = connection.exec_driver_sql(
            """
            SELECT COUNT(*)
            FROM messages AS m
            JOIN chats AS c ON c.id = m.chat_id
            WHERE c.psychic_id = ?
            """,
            (ALLOWED_PSYCHIC_ID,),
        ).scalar_one()
        excluded_message_count = connection.exec_driver_sql(
            """
            SELECT COUNT(*)
            FROM messages AS m
            JOIN chats AS c ON c.id = m.chat_id
            WHERE c.psychic_id = ?
            """,
            (EXCLUDED_PSYCHIC_ID,),
        ).scalar_one()
        persistent_session_count = connection.exec_driver_sql(
            "SELECT COUNT(*) FROM chat_sessions WHERE chat_id IN (1001, 1002)"
        ).scalar_one()
        delivery_state_count = connection.exec_driver_sql(
            """
            SELECT COUNT(DISTINCT m.status)
            FROM messages AS m
            JOIN chats AS c ON c.id = m.chat_id
            WHERE c.psychic_id = ?
            """,
            (ALLOWED_PSYCHIC_ID,),
        ).scalar_one()
        notification_count = connection.exec_driver_sql(
            "SELECT COUNT(*) FROM notifications"
        ).scalar_one()
        ai_draft_count = connection.exec_driver_sql(
            "SELECT COUNT(*) FROM ai_drafts"
        ).scalar_one()
        return {
            "allowedConversationCount": int(allowed_conversation_count),
            "sameDisplayLabel": same_label_clients == 2,
            "distinctClientIds": distinct_client_ids == 2,
            "distinctConversationIds": distinct_conversation_ids == 2,
            "allowedMessageCount": int(allowed_message_count),
            "excludedMessageCount": int(excluded_message_count),
            "persistentSessionCount": int(persistent_session_count),
            "deliveryStateCount": int(delivery_state_count),
            "notificationCount": int(notification_count),
            "aiDraftCount": int(ai_draft_count),
        }


def _database_comparison() -> dict[str, Any]:
    current = _database_proof(engine)
    keys = (
        "allRowsDigest",
        "messageStatusDigest",
        "userPresenceDigest",
        "responseModeDigest",
        "notificationDigest",
        "aiDraftDigest",
    )
    return {
        "before": _BASELINE_DATABASE,
        "after": current,
        "allRowsUnchanged": all(
            _BASELINE_DATABASE[key] == current[key]
            for key in keys
        ),
    }


def _configuration_proof() -> dict[str, Any]:
    config = load_second_brain_readonly_config()
    return {
        "ready": config.ready,
        "enabled": config.enabled,
        "allowlistMatchesExpected": (
            config.allowed_psychic_ids == frozenset({ALLOWED_PSYCHIC_ID})
        ),
        "validationErrorCount": len(config.validation_errors),
    }


def _module_safety_proof() -> dict[str, Any]:
    return {
        "appMainImported": "app.main" in sys.modules,
        "appRoutersPackageImported": "app.routers" in sys.modules,
        "productionDatabaseClientImported": "app.database.client" in sys.modules,
        "protectedWorkflowModuleImported": any(
            module_name in sys.modules
            for module_name in _PROTECTED_WORKFLOW_MODULES
        ),
    }


def _safe_proof_payload() -> dict[str, Any]:
    database = _database_comparison()
    data_shape = _data_shape_proof()
    with _proof_lock:
        request_trace = [dict(item) for item in _request_trace]
        select_count = _sql_select_count
        non_select_count = _sql_non_select_count
        revision_read_count = _revision_read_count
        non_loopback_connect_count = _non_loopback_connect_count

    status_counts: dict[str, int] = {}
    for item in request_trace:
        status_key = str(item["status"])
        status_counts[status_key] = status_counts.get(status_key, 0) + 1

    return {
        "schemaVersion": 1,
        "scenario": SCENARIO,
        "configuration": _configuration_proof(),
        "data": data_shape,
        "database": database,
        "requests": {
            "snapshotRequestCount": len(request_trace),
            "cursorPresenceTrace": [
                item["cursorPresent"]
                for item in request_trace
            ],
            "responses": request_trace,
            "statusCounts": status_counts,
            "allMethodsGet": all(item["methodIsGet"] for item in request_trace),
            "allNoStore": all(item["noStore"] for item in request_trace),
        },
        "sql": {
            "selectStatementCount": select_count,
            "nonSelectStatementCount": non_select_count,
            "selectOnly": non_select_count == 0,
        },
        "conflict": {
            "enabled": SCENARIO == "conflict_once",
            "revisionReadCount": revision_read_count,
            "singleConflictObserved": (
                sum(1 for item in request_trace if item["status"] == 409) == 1
            ),
        },
        "runtime": {
            **_module_safety_proof(),
            "nonLoopbackConnectCount": non_loopback_connect_count,
            "nonLoopbackConnectFree": non_loopback_connect_count == 0,
        },
        "expected": {
            "allowedMessageCount": EXPECTED_ALLOWED_MESSAGES,
            "excludedMessageCount": EXPECTED_EXCLUDED_MESSAGES,
            "persistentSessionCount": EXPECTED_PERSISTENT_SESSIONS,
        },
    }


def _payload_is_safe(payload: Mapping[str, Any]) -> bool:
    serialized = json.dumps(payload, ensure_ascii=True, sort_keys=True)
    temporary_token = os.environ.get("SECOND_BRAIN_READONLY_TOKEN")
    forbidden_values = list(_SYNTHETIC_PRIVATE_VALUES)
    if temporary_token:
        forbidden_values.append(temporary_token)
    return all(value not in serialized for value in forbidden_values)


@app.get(PROOF_PATH, include_in_schema=False)
def get_phase1c_proof() -> Response:
    payload = _safe_proof_payload()
    headers = {
        "Cache-Control": "no-store",
        "Pragma": "no-cache",
    }
    if not _payload_is_safe(payload):
        return JSONResponse(
            status_code=500,
            content={"safe": False},
            headers=headers,
        )
    return JSONResponse(content=payload, headers=headers)


@app.post(SHUTDOWN_PATH, include_in_schema=False)
def stop_phase1c_fixture() -> Response:
    headers = {"Cache-Control": "no-store", "Pragma": "no-cache"}
    server = getattr(app.state, "phase1c_server", None)
    if server is None:
        return JSONResponse(
            status_code=503,
            content={"stopping": False},
            headers=headers,
        )
    server.should_exit = True
    return JSONResponse(content={"stopping": True}, headers=headers)


def _port_from_environment() -> int:
    raw_value = os.environ.get("PHASE1C_WEBSITE_PORT", "")
    if not raw_value.isascii() or not raw_value.isdecimal():
        raise SystemExit("PHASE1C_WEBSITE_PORT must be a decimal loopback port.")
    port = int(raw_value)
    if port < 1 or port > 65_535:
        raise SystemExit("PHASE1C_WEBSITE_PORT is outside the valid port range.")
    return port


def main() -> None:
    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=_port_from_environment(),
        access_log=False,
        lifespan="off",
        log_config=None,
        log_level="critical",
        ws="none",
    )
    server = uvicorn.Server(config)
    app.state.phase1c_server = server
    server.run()


if __name__ == "__main__":
    main()
