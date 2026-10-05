"""Shapes of the owner's phone routes for per-message conversations
(routers/owner_messaging.py)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator

Mode = Literal["automatic", "hybrid"]


class OwnerModeUpdate(BaseModel):
    mode: Mode


class OwnerReply(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Write a reply first.")
        return value


class OwnerInboxItem(BaseModel):
    chat_id: int
    client_id: int
    client_name: str
    reader_id: int
    reader_name: str
    reader_picture_url: str | None
    mode: Mode
    last_message_text: str | None
    last_sender: Literal["client", "reader"] | None
    last_activity_at: datetime
    waiting: bool
    has_suggestion: bool
    oldest_unanswered_at: datetime | None
    refund_at: datetime | None


class OwnerInbox(BaseModel):
    items: list[OwnerInboxItem]
    total: int
    offset: int
    limit: int
    has_more: bool


class OwnerSuggestion(BaseModel):
    id: int
    text: str
    through_message_id: int
    created_at: datetime


class OwnerThreadMessage(BaseModel):
    id: int
    side: Literal["client", "reader", "system"]
    text: str
    created_at: datetime
    status: Literal["sent", "delivered", "seen"] | None


class OwnerThread(BaseModel):
    chat_id: int
    mode: Mode
    client_id: int
    client_name: str
    reader_id: int
    reader_name: str
    reader_picture_url: str | None
    waiting: bool
    unanswered_message_ids: list[int]
    oldest_unanswered_at: datetime | None
    refund_at: datetime | None
    suggestion: OwnerSuggestion | None
    suggestion_generating: bool
    messages: list[OwnerThreadMessage]
    has_more: bool


class OwnerModeResult(BaseModel):
    chat_id: int
    mode: Mode
    closed_as_answered: list[int]
    unanswered_message_ids: list[int]


class OwnerReplySent(BaseModel):
    chat_id: int
    message_id: int
    suggestion_id: int | None
    closed_as_answered: list[int]


class OwnerSuggestionDiscarded(BaseModel):
    chat_id: int
    suggestion_id: int


class OwnerSuggestionRequested(BaseModel):
    chat_id: int
    status: Literal["generating"]
    unanswered_message_ids: list[int]


class OwnerTyping(BaseModel):
    chat_id: int
    typing: bool
