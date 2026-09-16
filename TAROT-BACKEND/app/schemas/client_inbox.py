from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class InboxReader(BaseModel):
    id: int
    display_name: str
    profile_picture_url: str | None
    is_online: bool
    next_online_at: datetime | None
    price_per_message: float | None


class InboxMessage(BaseModel):
    id: int
    text: str
    sender_id: int | None
    sent_by: Literal["client", "reader", "system"]
    created_at: datetime


class InboxItem(BaseModel):
    chat_id: int
    chat_status: str
    reader: InboxReader
    last_message: InboxMessage | None
    last_activity_at: datetime
    unread_count: int
    client_last_message_id: int | None
    client_last_message_state: Literal["sent", "delivered", "seen"] | None
    client_last_opened_at: datetime | None


class ClientInbox(BaseModel):
    items: list[InboxItem]
    total: int
    offset: int
    limit: int
    has_more: bool


class ChatOpened(BaseModel):
    chat_id: int
    client_last_opened_at: datetime
