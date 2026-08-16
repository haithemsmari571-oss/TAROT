from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

from app.enums.chat_status import ChatStatus
from app.enums.message_status import MessageStatus


class ChatBase(BaseModel):
    status: ChatStatus
    psychic_id: int
    user_id: int


class ChatStart(BaseModel):
    psychic_id: int
    # Mandatory, and the only thing she is asked for. No minimum length and no shape:
    # "will he come back" is a complete answer. It is what the reading is written from
    # while she waits, and it becomes her first message in the thread, so a blank one
    # would mean an empty reading and an empty bubble.
    message: str

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        if not (v or "").strip():
            raise ValueError("Please tell your reader what is going on before you begin.")
        return v.strip()


class ChatUpdate(BaseModel):
    status: ChatStatus


class ChatOut(BaseModel):
    id: int
    status: ChatStatus
    user_profile_pic_url: str
    user_name: str
    last_message: str
    psychic_id: int
    # ISO string of the chat's last activity — used to order the admin Chats
    # list newest-first (chat rows are reused across repeat readings, so id is
    # not a reliable recency signal).
    updated_at: Optional[str] = None


class SocketBase(BaseModel):
    type: str


class SocketAuthData(SocketBase):
    token: str


class SocketMessageData(SocketBase):
    content: str
    user_id: int


class MessageOut(BaseModel):
    id: int
    chat_id: int
    chat_session_id: int | None = None
    sender_id: int | None = None
    content: str
    is_system: bool = False
    status: Optional[MessageStatus] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TopUpResponse(BaseModel):
    url: str
    points_amount: int
    estimated_minutes: int
