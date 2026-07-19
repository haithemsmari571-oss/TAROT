from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ReadingSteeringNote(Base):
    """Operator guidance for Valentina's Hybrid drafting — one short note.

    HYBRID-ONLY and SESSION-SCOPED, both hard requirements:
      * A note binds to the chat_sessions row that was ACTIVE when it was
        written. Retrieval only ever returns notes of the chat's CURRENT
        ACTIVE session, so when that session completes the notes expire
        naturally — nothing carries to a later session with the same client.
      * Retrieval additionally refuses to return anything unless the chat is
        in HYBRID mode right now (see reading_steering.get_active_notes), so
        switching to Automatic mid-session severs any influence immediately.

    Notes are guidance the model weighs against the live moment, never rigid
    commands — the injection block's wording enforces that tone. Rows are kept
    after retirement (active=False) as the operator-action audit trail.
    """

    __tablename__ = "reading_steering_notes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"), index=True)
    chat_session_id: Mapped[int] = mapped_column(
        ForeignKey("chat_sessions.id"), index=True
    )
    note: Mapped[str] = mapped_column(Text, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    deactivated_by: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    deactivated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # created_at / updated_at come from Base.
