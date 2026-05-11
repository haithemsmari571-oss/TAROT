from typing import List
from sqlalchemy import Enum, ForeignKey, UniqueConstraint
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.enums.chat_status import ChatStatus
from app.models.base import Base


class Chat(Base):
    __tablename__ = "chats"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    psychic_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[ChatStatus] = mapped_column(Enum(ChatStatus))
    paused_at: Mapped[datetime | None] = mapped_column(default=None, nullable=True)

    psychic: Mapped["User"] = relationship(
        "User", foreign_keys=[psychic_id], back_populates="psychic_chats"
    )
    user: Mapped["User"] = relationship(
        "User", foreign_keys=[user_id], back_populates="client_chats"
    )
    sessions: Mapped[List["ChatSession"]] = relationship(
        "ChatSession", back_populates="chat"
    )

    transactions: Mapped[List["Transaction"]] = relationship(
        "Transaction", back_populates="chat", foreign_keys="Transaction.related_chat_id"
    )

    UniqueConstraint(user_id, psychic_id)
