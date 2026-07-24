"""SELECT-only projection for the private Second Brain Valentina snapshot."""

from __future__ import annotations

import base64
import binascii
import json
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, aliased

from app.enums.author_type import AuthorType
from app.models.chat import Chat
from app.models.chat_session import ChatSession
from app.models.message import Message
from app.models.user import User
from app.schemas.second_brain_readonly import (
    ValentinaInternalHandler,
    ValentinaMessageAuthor,
    ValentinaMessageTimestamps,
    ValentinaPublicPsychicProfile,
    ValentinaReadonlyConversation,
    ValentinaReadonlyMessage,
    ValentinaReadonlyReadingSession,
    ValentinaReadonlySnapshotInput,
    ValentinaReadonlySourceConnection,
)

MAX_PAGE_SIZE = 50
DEFAULT_PAGE_SIZE = 25
STALE_AFTER_MS = 300_000
SCHEMA_LIMITATION_REASON = (
    "schema_limitation:messages_have_no_chat_session_id;"
    "reserved_unassigned_sessions_used"
)

_CURSOR_VERSION = 1
_MAX_CURSOR_LENGTH = 512
_MAX_PERSISTENT_ID = (2**63) - 1


class InvalidSecondBrainReadonlyCursor(ValueError):
    """Raised when an opaque projection cursor is malformed."""


class SecondBrainReadonlyProjectionInvariantError(RuntimeError):
    """Raised when persistent rows cannot be projected without guessing."""


@dataclass(frozen=True, slots=True)
class _Cursor:
    after_created_at: datetime
    after_id: int
    high_water_id: int
    snapshot_revision: int


@dataclass(frozen=True, slots=True)
class _MessageProjection:
    message_id: int
    message_chat_id: int
    sender_id: int | None
    content: str
    message_status: Any
    is_system: bool
    author_type: Any
    message_created_at: datetime
    message_updated_at: datetime
    chat_message_updated_at: datetime
    message_sequence: int
    chat_id: int
    client_id: int
    psychic_id: int
    chat_status: Any
    response_mode: Any
    chat_created_at: datetime
    chat_updated_at: datetime
    client_updated_at: datetime
    psychic_updated_at: datetime
    client_username: str
    psychic_username: str

    @classmethod
    def from_mapping(cls, row: Mapping[str, Any]) -> "_MessageProjection":
        return cls(**{field: row[field] for field in cls.__dataclass_fields__})


def project_valentina_readonly_snapshot(
    db: Session,
    *,
    allowed_psychic_ids: frozenset[int],
    page_size: int = DEFAULT_PAGE_SIZE,
    cursor: str | None = None,
    refreshed_at: datetime | None = None,
) -> ValentinaReadonlySnapshotInput:
    """Project an allowlisted message page without mutating any row.

    The v1 cursor pages the global message stream. A future connector must merge
    repeated conversation/session identities across pages before normalization.
    """

    if not allowed_psychic_ids:
        raise SecondBrainReadonlyProjectionInvariantError(
            "A nonempty psychic allowlist is required."
        )
    if page_size < 1 or page_size > MAX_PAGE_SIZE:
        raise ValueError("Page size is outside the permitted range.")

    parsed_cursor = _decode_cursor(cursor) if cursor is not None else None
    allowed_ids = tuple(sorted(allowed_psychic_ids))

    with db.no_autoflush:
        current_high_water_id = _read_high_water_id(db, allowed_ids)
        snapshot_revision = _read_snapshot_revision(db, allowed_ids)
        if parsed_cursor is not None and (
            parsed_cursor.high_water_id != current_high_water_id
            or parsed_cursor.snapshot_revision != snapshot_revision
        ):
            raise SecondBrainReadonlyProjectionInvariantError(
                "The projection changed during pagination."
            )
        high_water_id = current_high_water_id
        rows = _read_message_page(
            db,
            allowed_ids=allowed_ids,
            page_size=page_size,
            cursor=parsed_cursor,
            high_water_id=high_water_id,
        )

        deduplicated = _deduplicate_message_rows(rows)
        has_more = len(deduplicated) > page_size
        page_rows = deduplicated[:page_size]
        chat_ids = tuple(sorted({row.chat_id for row in page_rows}))
        session_rows = _read_sessions(db, chat_ids) if chat_ids else []

    now = _as_utc(refreshed_at or datetime.now(UTC))
    next_cursor = None
    if has_more and page_rows:
        last_row = page_rows[-1]
        next_cursor = _encode_cursor(
            _Cursor(
                after_created_at=_as_utc(last_row.message_created_at),
                after_id=last_row.message_id,
                high_water_id=high_water_id,
                snapshot_revision=snapshot_revision,
            )
        )

    conversations = _build_conversations(page_rows, session_rows)
    refreshed_iso = _iso(now)
    return ValentinaReadonlySnapshotInput(
        cursor=next_cursor,
        revision=snapshot_revision,
        last_refresh_at=refreshed_iso,
        stale_after_ms=STALE_AFTER_MS,
        connection=ValentinaReadonlySourceConnection(
            reported_connected=True,
            checked_at=refreshed_iso,
            reason=SCHEMA_LIMITATION_REASON,
        ),
        conversations=conversations,
    )


def _read_high_water_id(db: Session, allowed_ids: tuple[int, ...]) -> int:
    statement = (
        select(func.max(Message.id))
        .join(Chat, Chat.id == Message.chat_id)
        .where(Chat.psychic_id.in_(allowed_ids))
    )
    value = db.execute(statement).scalar_one_or_none()
    return int(value or 0)


def _read_snapshot_revision(db: Session, allowed_ids: tuple[int, ...]) -> int:
    """Return an update revision independent of the pagination high-water ID."""

    chat_updated_at = (
        select(func.max(Chat.updated_at))
        .where(Chat.psychic_id.in_(allowed_ids))
        .scalar_subquery()
    )
    message_updated_at = (
        select(func.max(Message.updated_at))
        .join(Chat, Chat.id == Message.chat_id)
        .where(Chat.psychic_id.in_(allowed_ids))
        .scalar_subquery()
    )
    session_updated_at = (
        select(func.max(ChatSession.updated_at))
        .join(Chat, Chat.id == ChatSession.chat_id)
        .where(Chat.psychic_id.in_(allowed_ids))
        .scalar_subquery()
    )
    identity = aliased(User, name="second_brain_revision_identity")
    identity_updated_at = (
        select(func.max(identity.updated_at))
        .join(
            Chat,
            or_(identity.id == Chat.user_id, identity.id == Chat.psychic_id),
        )
        .where(Chat.psychic_id.in_(allowed_ids))
        .scalar_subquery()
    )
    row = db.execute(
        select(
            chat_updated_at.label("chat_updated_at"),
            message_updated_at.label("message_updated_at"),
            session_updated_at.label("session_updated_at"),
            identity_updated_at.label("identity_updated_at"),
        )
    ).one()
    timestamps = [value for value in row if value is not None]
    return max((_revision(value) for value in timestamps), default=0)


def _read_message_page(
    db: Session,
    *,
    allowed_ids: tuple[int, ...],
    page_size: int,
    cursor: _Cursor | None,
    high_water_id: int,
) -> list[Mapping[str, Any]]:
    if high_water_id == 0:
        return []

    client = aliased(User, name="second_brain_client_identity")
    psychic = aliased(User, name="second_brain_psychic_identity")
    ranked = (
        select(
            Message.id.label("message_id"),
            Message.chat_id.label("message_chat_id"),
            Message.sender_id.label("sender_id"),
            Message.content.label("content"),
            Message.status.label("message_status"),
            Message.is_system.label("is_system"),
            Message.author_type.label("author_type"),
            Message.created_at.label("message_created_at"),
            Message.updated_at.label("message_updated_at"),
            func.max(Message.updated_at)
            .over(partition_by=Message.chat_id)
            .label("chat_message_updated_at"),
            func.row_number()
            .over(order_by=(Message.created_at.asc(), Message.id.asc()))
            .label("message_sequence"),
            Chat.id.label("chat_id"),
            Chat.user_id.label("client_id"),
            Chat.psychic_id.label("psychic_id"),
            Chat.status.label("chat_status"),
            Chat.response_mode.label("response_mode"),
            Chat.created_at.label("chat_created_at"),
            Chat.updated_at.label("chat_updated_at"),
            client.updated_at.label("client_updated_at"),
            psychic.updated_at.label("psychic_updated_at"),
            client.username.label("client_username"),
            psychic.username.label("psychic_username"),
        )
        .join(Chat, Chat.id == Message.chat_id)
        .join(client, client.id == Chat.user_id)
        .join(psychic, psychic.id == Chat.psychic_id)
        .where(
            Chat.psychic_id.in_(allowed_ids),
            Message.id <= high_water_id,
        )
        .subquery("second_brain_ranked_messages")
    )
    statement = (
        select(*(ranked.c[field] for field in _MessageProjection.__dataclass_fields__))
        .order_by(
            ranked.c.message_created_at.asc(),
            ranked.c.message_id.asc(),
        )
        .limit(page_size + 1)
    )
    if cursor is not None:
        statement = statement.where(
            or_(
                ranked.c.message_created_at > cursor.after_created_at,
                (
                    (ranked.c.message_created_at == cursor.after_created_at)
                    & (ranked.c.message_id > cursor.after_id)
                ),
            )
        )

    return list(db.execute(statement).mappings().all())


def _read_sessions(
    db: Session,
    chat_ids: tuple[int, ...],
) -> list[Mapping[str, Any]]:
    statement = (
        select(
            ChatSession.id.label("session_id"),
            ChatSession.chat_id.label("chat_id"),
            ChatSession.status.label("session_status"),
            ChatSession.created_at.label("session_created_at"),
            ChatSession.updated_at.label("session_updated_at"),
        )
        .where(ChatSession.chat_id.in_(chat_ids))
        .order_by(
            ChatSession.chat_id.asc(),
            ChatSession.created_at.asc(),
            ChatSession.id.asc(),
        )
    )
    return list(db.execute(statement).mappings().all())


def _deduplicate_message_rows(
    rows: Iterable[Mapping[str, Any]],
) -> list[_MessageProjection]:
    """Remove identical joins and reject conflicting reuse of a message ID."""

    seen: dict[int, _MessageProjection] = {}
    ordered: list[_MessageProjection] = []
    for raw_row in rows:
        row = _MessageProjection.from_mapping(raw_row)
        previous = seen.get(row.message_id)
        if previous is None:
            seen[row.message_id] = row
            ordered.append(row)
            continue
        if previous != row:
            raise SecondBrainReadonlyProjectionInvariantError(
                "A projected message identifier was inconsistent."
            )
    return ordered


def _build_conversations(
    message_rows: list[_MessageProjection],
    session_rows: list[Mapping[str, Any]],
) -> list[ValentinaReadonlyConversation]:
    sessions_by_chat: dict[int, list[Mapping[str, Any]]] = {}
    for session_row in session_rows:
        sessions_by_chat.setdefault(int(session_row["chat_id"]), []).append(session_row)

    rows_by_chat: dict[int, list[_MessageProjection]] = {}
    chat_order: list[int] = []
    for row in message_rows:
        if row.chat_id not in rows_by_chat:
            rows_by_chat[row.chat_id] = []
            chat_order.append(row.chat_id)
        elif rows_by_chat[row.chat_id][0].client_id != row.client_id:
            raise SecondBrainReadonlyProjectionInvariantError(
                "A conversation projection was inconsistent."
            )
        rows_by_chat[row.chat_id].append(row)

    conversations: list[ValentinaReadonlyConversation] = []
    for chat_id in chat_order:
        rows = rows_by_chat[chat_id]
        first = rows[0]
        conversation_id = f"chat:{chat_id}"
        sessions = [
            _build_persistent_session(conversation_id, row)
            for row in sessions_by_chat.get(chat_id, [])
        ]
        messages = [
            _build_unassigned_message(conversation_id, row) for row in rows
        ]
        sessions.append(
            ValentinaReadonlyReadingSession(
                external_conversation_id=conversation_id,
                external_reading_session_id=_unassigned_session_id(chat_id),
                revision=_revision(first.chat_message_updated_at),
                status="pending",
                started_at=None,
                ended_at=None,
                messages=messages,
            )
        )
        session_revisions = [session.revision for session in sessions]
        conversation_updated_at = max(
            [first.chat_updated_at]
            + [first.chat_message_updated_at]
            + [first.client_updated_at, first.psychic_updated_at]
            + [
                row["session_updated_at"]
                for row in sessions_by_chat.get(chat_id, [])
            ],
            key=_as_utc,
        )
        conversations.append(
            ValentinaReadonlyConversation(
                external_conversation_id=conversation_id,
                display_label=first.client_username,
                revision=max(_revision(conversation_updated_at), *session_revisions),
                reported_mode=_reported_mode(first.response_mode),
                chat_status=_chat_status(first.chat_status),
                public_psychic_profile=ValentinaPublicPsychicProfile(
                    external_psychic_id=f"psychic:{first.psychic_id}",
                    display_name=first.psychic_username,
                    public_slug=str(first.psychic_id),
                    avatar_url=None,
                    public_profile_url=None,
                ),
                internal_handler=ValentinaInternalHandler(),
                created_at=_iso(first.chat_created_at),
                updated_at=_iso(conversation_updated_at),
                sessions=sessions,
            )
        )
    return conversations


def _build_persistent_session(
    conversation_id: str,
    row: Mapping[str, Any],
) -> ValentinaReadonlyReadingSession:
    return ValentinaReadonlyReadingSession(
        external_conversation_id=conversation_id,
        external_reading_session_id=f"chat-session:{int(row['session_id'])}",
        revision=_revision(row["session_updated_at"]),
        status=_session_status(row["session_status"]),
        started_at=_iso(row["session_created_at"]),
        ended_at=None,
        messages=[],
    )


def _build_unassigned_message(
    conversation_id: str,
    row: _MessageProjection,
) -> ValentinaReadonlyMessage:
    author, direction = _message_author(row)
    return ValentinaReadonlyMessage(
        external_conversation_id=conversation_id,
        external_reading_session_id=_unassigned_session_id(row.chat_id),
        external_message_id=f"message:{row.message_id}",
        revision=_revision(row.message_updated_at),
        sequence=row.message_sequence,
        author=author,
        direction=direction,
        delivery=(
            "not_applicable" if direction == "system" else _delivery(row.message_status)
        ),
        body=row.content,
        timestamps=ValentinaMessageTimestamps(
            created_at=_iso(row.message_created_at),
            updated_at=_iso(row.message_updated_at),
            sent_at=None,
            delivered_at=None,
            read_at=None,
        ),
    )


def _message_author(
    row: _MessageProjection,
) -> tuple[ValentinaMessageAuthor, str]:
    if row.is_system or _enum_value(row.author_type) == AuthorType.SYSTEM.value:
        return (
            ValentinaMessageAuthor(
                type="system",
                external_author_id=None,
                display_name="System",
            ),
            "system",
        )
    if row.sender_id == row.client_id:
        return (
            ValentinaMessageAuthor(
                type="client",
                external_author_id=f"user:{row.client_id}",
                display_name=row.client_username,
            ),
            "inbound",
        )
    if row.sender_id == row.psychic_id:
        return (
            ValentinaMessageAuthor(
                type="psychic",
                external_author_id=f"user:{row.psychic_id}",
                display_name=row.psychic_username,
            ),
            "outbound",
        )
    raise SecondBrainReadonlyProjectionInvariantError(
        "A message author could not be projected without guessing."
    )


def _reported_mode(value: Any) -> str:
    return _map_enum(
        value,
        {"HUMAN": "manual", "HYBRID": "hybrid", "SABRI": "automatic"},
        "response mode",
    )


def _chat_status(value: Any) -> str:
    # Locked v1 has no "archived" value; archived chats are terminal/ended.
    return _map_enum(
        value,
        {
            "REQUESTED": "requested",
            "ACTIVE": "active",
            "ENDED": "ended",
            "PAUSED": "paused",
            "ARCHIVED": "ended",
            "BLOCKED": "blocked",
        },
        "chat status",
    )


def _session_status(value: Any) -> str:
    # Locked v1 has no "disconnected" value; it is represented as inactive/paused.
    return _map_enum(
        value,
        {"ACTIVE": "active", "DISCONNECTED": "paused", "COMPLETED": "completed"},
        "session status",
    )


def _delivery(value: Any) -> str:
    return _map_enum(
        value,
        {
            "SENDING": "pending",
            "SENT": "sent",
            "DELIVERED": "delivered",
            "READ": "read",
            "FAILED": "failed",
        },
        "message delivery",
    )


def _map_enum(value: Any, mapping: dict[str, str], label: str) -> str:
    mapped = mapping.get(_enum_value(value))
    if mapped is None:
        raise SecondBrainReadonlyProjectionInvariantError(
            f"An unsupported {label} prevented projection."
        )
    return mapped


def _enum_value(value: Any) -> str:
    raw_value = getattr(value, "value", value)
    return str(raw_value)


def _unassigned_session_id(chat_id: int) -> str:
    # Message has no ChatSession foreign key. This reserved, nonpersistent bucket
    # keeps v1 syntactically valid without claiming a real reading-session match.
    return f"unassigned:chat:{chat_id}"


def _revision(value: datetime) -> int:
    return max(0, int(_as_utc(value).timestamp() * 1_000_000))


def _iso(value: datetime) -> str:
    return _as_utc(value).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _encode_cursor(cursor: _Cursor) -> str:
    payload = json.dumps(
        {
            "afterCreatedAt": _as_utc(cursor.after_created_at).isoformat(
                timespec="microseconds"
            ),
            "afterId": cursor.after_id,
            "highWaterId": cursor.high_water_id,
            "snapshotRevision": cursor.snapshot_revision,
            "version": _CURSOR_VERSION,
        },
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def _decode_cursor(value: str) -> _Cursor:
    try:
        if not value or len(value) > _MAX_CURSOR_LENGTH or not value.isascii():
            raise InvalidSecondBrainReadonlyCursor
        padding = "=" * (-len(value) % 4)
        decoded = base64.b64decode(
            value + padding,
            altchars=b"-_",
            validate=True,
        )
        payload = json.loads(decoded.decode("utf-8"))
        if not isinstance(payload, dict) or set(payload) != {
            "afterCreatedAt",
            "afterId",
            "highWaterId",
            "snapshotRevision",
            "version",
        }:
            raise InvalidSecondBrainReadonlyCursor
        if type(payload["version"]) is not int or payload["version"] != _CURSOR_VERSION:
            raise InvalidSecondBrainReadonlyCursor
        after_id = payload["afterId"]
        high_water_id = payload["highWaterId"]
        snapshot_revision = payload["snapshotRevision"]
        if (
            type(after_id) is not int
            or after_id <= 0
            or type(high_water_id) is not int
            or high_water_id < after_id
            or high_water_id > _MAX_PERSISTENT_ID
            or type(snapshot_revision) is not int
            or snapshot_revision < 0
            or snapshot_revision > _MAX_PERSISTENT_ID
        ):
            raise InvalidSecondBrainReadonlyCursor
        timestamp = datetime.fromisoformat(payload["afterCreatedAt"])
        if timestamp.tzinfo is None:
            raise InvalidSecondBrainReadonlyCursor
    except (
        InvalidSecondBrainReadonlyCursor,
        binascii.Error,
        UnicodeDecodeError,
        json.JSONDecodeError,
        TypeError,
        ValueError,
    ) as error:
        raise InvalidSecondBrainReadonlyCursor("Invalid cursor.") from error

    return _Cursor(
        after_created_at=timestamp.astimezone(UTC),
        after_id=after_id,
        high_water_id=high_water_id,
        snapshot_revision=snapshot_revision,
    )
