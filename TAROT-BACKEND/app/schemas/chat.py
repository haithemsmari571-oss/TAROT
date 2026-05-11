from datetime import datetime
from pydantic import BaseModel

from app.enums.chat_status import ChatStatus


class ChatBase(BaseModel):
    status: ChatStatus
    psychic_id: int
    user_id: int


class ChatStart(BaseModel):
    psychic_id: int
    message: str


class ChatUpdate(BaseModel):
    status: ChatStatus


class ChatOut(BaseModel):
    id: int
    status: ChatStatus
    user_profile_pic_url: str
    user_name: str
    last_message: str
    psychic_id: int


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
    sender_id: int | None = None
    content: str
    is_system: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


class TopUpResponse(BaseModel):
    url: str
    points_amount: int
    estimated_minutes: int
