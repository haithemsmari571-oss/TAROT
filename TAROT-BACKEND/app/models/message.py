from typing import Optional

from sqlalchemy import Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.enums.author_type import AuthorType
from app.enums.message_status import MessageStatus
from app.models.base import Base


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"))
    chat_session_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("chat_sessions.id"), nullable=True, index=True
    )
    sender_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    content: Mapped[str]
    status: Mapped[MessageStatus] = mapped_column(
        Enum(MessageStatus), default=MessageStatus.SENDING
    )
    is_system: Mapped[bool] = mapped_column(default=False)
    # How this message was produced. Existing rows backfill to HUMAN_PSYCHIC.
    # AI_DRAFTED marks a reply that came from the Valentina/Sabri pipeline.
    author_type: Mapped[AuthorType] = mapped_column(
        Enum(AuthorType), default=AuthorType.HUMAN_PSYCHIC, nullable=False
    )

    sender: Mapped[Optional["User"]] = relationship("User", back_populates="messages")
    chat_session: Mapped[Optional["ChatSession"]] = relationship(
        "ChatSession", back_populates="messages"
    )
