from datetime import datetime

from sqlalchemy import Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.enums.chat_session_triggers import ChatSessionTrigger
from app.enums.chat_termination_reason import ChatTerminationReason
from app.models.base import Base


class SessionInterval(Base):
    __tablename__ = "session_intervals"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("chat_sessions.id"))
    started_at: Mapped[datetime]
    ended_at: Mapped[datetime] = mapped_column(nullable=True)
    is_billed: Mapped[bool] = mapped_column(default=False)
    trigger_event: Mapped[ChatSessionTrigger] = mapped_column(
        Enum(ChatSessionTrigger), nullable=True
    )
    termination_reason: Mapped[ChatTerminationReason] = mapped_column(
        Enum(ChatTerminationReason), nullable=True
    )

    session: Mapped["ChatSession"] = relationship(
        "ChatSession", back_populates="intervals"
    )

    transactions: Mapped[list["Transaction"]] = relationship(
        "Transaction",
        back_populates="session_interval",
        foreign_keys="Transaction.related_session_interval_id",
    )
