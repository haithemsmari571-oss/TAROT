from typing import List
from sqlalchemy import Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.enums.chat_session_status import ChatSessionStatus
from app.enums.chat_status import ChatStatus
from app.models.base import Base
from app.models.session_intervals import SessionInterval


class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"))
    status: Mapped[ChatSessionStatus] = mapped_column(Enum(ChatSessionStatus))

    chat: Mapped["Chat"] = relationship(
        "Chat", foreign_keys=[chat_id], back_populates="sessions"
    )

    intervals: Mapped[List["SessionInterval"]] = relationship(
        "SessionInterval", back_populates="session"
    )
