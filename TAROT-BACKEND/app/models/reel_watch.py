"""Which reels a client has watched in the Shorts tab (ROUND69)."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ReelWatch(Base):
    """One row per client and reel she has watched to the end, or nearly.

    The Shorts tab records a reel once it has played at least 90 percent of its
    length, at most once per reel per visit. Watching it again on a later visit
    moves watched_at on; created_at (from the shared Base) keeps the first time.
    Her Shorts feed puts the reels she has not watched first, then these, the
    least recently watched first (services/library_items.py list_public_reels).
    Deleted with the account or the reel.
    """

    __tablename__ = "reel_watches"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    library_item_id: Mapped[int] = mapped_column(
        ForeignKey("library_items.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    # The last time she watched it.
    watched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
