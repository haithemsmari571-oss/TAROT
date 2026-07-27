from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ClientMemorySummary(Base):
    """ONE rolling summary per (client, psychic) — not a pile of per-session notes.

    The previous behaviour re-summarised the client's ENTIRE message history at
    every session end and appended the result beside all the earlier ones, so a
    frequent client accumulated many overlapping summaries of the same material
    and only the newest handful were ever injected into a reading.

    Here the summary is a single document that is MERGED FORWARD: at session end
    the model receives the existing summary plus only the messages that arrived
    after ``covers_through``, and returns one replacement summary.

    Two consequences worth stating explicitly, because they are the point:

    * Raw history is never re-read. Once messages are folded in, the summary is
      the memory; the transcript is not consulted again.
    * That makes deletion durable without touching production-locked code.
      Clearing ``summary`` and stamping ``cleared_at`` means the next merge
      starts from nothing and only sees messages after the purge. There is no
      path by which pre-deletion history can be summarised back into existence.
    """

    __tablename__ = "client_memory_summaries"
    __table_args__ = (
        UniqueConstraint("client_id", "psychic_id", name="uq_client_memory_client_psychic"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    client_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    psychic_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # The single current summary. NULL means "no memory": either nothing has been
    # folded in yet, or the owner purged it.
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Everything at or before this instant is already reflected in `summary`.
    # The next merge reads only messages created strictly after it.
    covers_through: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Set when the owner purges. Kept deliberately: a bare row delete would lose
    # the watermark, and the next merge would have no floor to resume from and
    # would sweep the pre-deletion transcript back in.
    cleared_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
