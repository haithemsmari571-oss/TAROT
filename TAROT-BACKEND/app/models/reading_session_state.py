from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, ForeignKey, Integer, Text
from sqlalchemy import DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ReadingSessionStateRow(Base):
    """Durable snapshot of the reading engine's per-chat working state (the in-memory
    ``ReadingSessionState``), keyed by chat_id, so a backend restart can rehydrate a
    reading mid-conversation instead of starting empty. The persisted messages/chats
    tables are the source of truth for delivered content; this table holds only the
    ephemeral engine state layered on top (reserve, held-back buffer, delivery queue +
    position, working transcript, counters). List fields are stored as JSON text."""

    __tablename__ = "reading_session_states"

    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"), primary_key=True)
    session_id: Mapped[str] = mapped_column(Text, nullable=False)
    client_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_first_session: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    reserve: Mapped[str] = mapped_column(Text, default="", nullable=False)
    held_back_buffer: Mapped[str] = mapped_column(Text, default="[]", nullable=False)  # JSON
    delivery_queue: Mapped[str] = mapped_column(Text, default="[]", nullable=False)  # JSON
    queue_position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    chat_transcript: Mapped[str] = mapped_column(Text, default="[]", nullable=False)  # JSON
    messages_sent_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    client_response_lengths: Mapped[str] = mapped_column(Text, default="[]", nullable=False)  # JSON
    client_response_times: Mapped[str] = mapped_column(Text, default="[]", nullable=False)  # JSON
    sabri_correction_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    waiting_for_response: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    session_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_activity_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
