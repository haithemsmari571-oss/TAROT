"""Locked v1 response models for the Second Brain Valentina projection."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict


def _to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class _ContractModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=_to_camel,
        populate_by_name=True,
        extra="forbid",
    )


class ValentinaPublicPsychicProfile(_ContractModel):
    external_psychic_id: str
    display_name: str
    public_slug: str
    avatar_url: str | None = None
    public_profile_url: str | None = None


class ValentinaInternalHandler(_ContractModel):
    kind: Literal["unassigned"] = "unassigned"
    internal_handler_id: None = None
    display_name: None = None


class ValentinaMessageAuthor(_ContractModel):
    type: Literal["client", "psychic", "system"]
    external_author_id: str | None
    display_name: str


class ValentinaMessageTimestamps(_ContractModel):
    created_at: str
    updated_at: str | None
    sent_at: str | None = None
    delivered_at: str | None = None
    read_at: str | None = None


class ValentinaReadonlyMessage(_ContractModel):
    external_conversation_id: str
    external_reading_session_id: str
    external_message_id: str
    revision: int
    sequence: int
    author: ValentinaMessageAuthor
    direction: Literal["inbound", "outbound", "system"]
    delivery: Literal[
        "pending",
        "sent",
        "delivered",
        "read",
        "failed",
        "not_applicable",
    ]
    body: str
    timestamps: ValentinaMessageTimestamps


class ValentinaReadonlyReadingSession(_ContractModel):
    external_conversation_id: str
    external_reading_session_id: str
    revision: int
    status: Literal["pending", "active", "paused", "completed", "cancelled"]
    started_at: str | None
    ended_at: str | None
    messages: list[ValentinaReadonlyMessage]


class ValentinaReadonlyConversation(_ContractModel):
    external_conversation_id: str
    display_label: str
    revision: int
    reported_mode: Literal["manual", "hybrid", "automatic"]
    chat_status: Literal[
        "requested",
        "queued",
        "active",
        "paused",
        "ended",
        "blocked",
    ]
    public_psychic_profile: ValentinaPublicPsychicProfile
    internal_handler: ValentinaInternalHandler
    created_at: str
    updated_at: str
    sessions: list[ValentinaReadonlyReadingSession]


class ValentinaReadonlySourceConnection(_ContractModel):
    reported_connected: bool
    checked_at: str
    reason: str | None


class ValentinaReadonlySnapshotInput(_ContractModel):
    contract_version: Literal["askvalentina.readonly.v1"] = (
        "askvalentina.readonly.v1"
    )
    cursor: str | None
    revision: int
    last_refresh_at: str
    stale_after_ms: int
    connection: ValentinaReadonlySourceConnection
    conversations: list[ValentinaReadonlyConversation]
