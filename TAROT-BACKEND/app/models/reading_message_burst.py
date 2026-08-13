from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ReadingMessageBurst(Base):
    """Durable, session-scoped ownership of one client-message response window.

    Client messages remain canonical individual ``messages`` rows. This row stores
    only coordination state: the latest message in the open burst, the last burst
    completed by the reader, generation fencing, and restart-safe Sabri delivery
    progress.
    """

    __tablename__ = "reading_message_bursts"

    chat_session_id: Mapped[int] = mapped_column(
        ForeignKey("chat_sessions.id"), primary_key=True
    )
    chat_id: Mapped[int] = mapped_column(ForeignKey("chats.id"), index=True)
    latest_client_message_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("messages.id"), nullable=True
    )
    completed_client_message_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("messages.id"), nullable=True
    )
    generation_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(Text, default="IDLE", nullable=False)
    silence_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # JSON object: per-WebSocket opaque source id -> expiry ISO timestamp.
    typing_signals: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    lease_owner: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    lease_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # A generated Automatic response is persisted before reveal. delivery_position
    # advances in the same transaction as each individual reader Message row.
    response_bubbles: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    response_reserve: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    response_route: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    delivery_position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
