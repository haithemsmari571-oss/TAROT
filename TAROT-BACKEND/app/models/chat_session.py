from datetime import datetime
from typing import List, Optional
from sqlalchemy import DateTime, Enum, ForeignKey, Integer
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
    # Reflection (migration d1e2f3a4b5c6). Every reflection in this reading added
    # up on each return — the closing card's "never charged" line — and the
    # start of the one in progress, NULL otherwise, so a restart keeps the meter
    # frozen. The arithmetic lives in app/services/reflect_budget.py only.
    reflection_seconds_used: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    reflecting_since: Mapped[Optional[datetime]] = mapped_column(
        DateTime, nullable=True, default=None
    )

    chat: Mapped["Chat"] = relationship(
        "Chat", foreign_keys=[chat_id], back_populates="sessions"
    )

    intervals: Mapped[List["SessionInterval"]] = relationship(
        "SessionInterval", back_populates="session"
    )

    messages: Mapped[List["Message"]] = relationship(
        "Message", back_populates="chat_session"
    )
