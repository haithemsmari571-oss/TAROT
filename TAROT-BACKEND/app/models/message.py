from typing import Optional

from sqlalchemy import Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.enums.message_status import MessageStatus
from app.models.base import Base


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"))
    sender_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    content: Mapped[str]
    status: Mapped[MessageStatus] = mapped_column(
        Enum(MessageStatus), default=MessageStatus.SENDING
    )
    is_system: Mapped[bool] = mapped_column(default=False)

    sender: Mapped[Optional["User"]] = relationship("User", back_populates="messages")
