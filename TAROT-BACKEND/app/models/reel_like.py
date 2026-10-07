"""Which reels a client has liked in the Shorts tab (ROUND71)."""

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ReelLike(Base):
    """One row per client and reel she has liked: the reel is in her Favourites.

    The heart on a reel, or a double tap on it, adds the row; the heart again
    removes it. created_at (from the shared Base) is when she liked it, and her
    Favourites list the newest like first (services/library_items.py
    list_liked_reels). Deleted with the account or the reel. Liking does not
    change the order of her Shorts feed.
    """

    __tablename__ = "reel_likes"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    library_item_id: Mapped[int] = mapped_column(
        ForeignKey("library_items.id", ondelete="CASCADE"), primary_key=True, index=True
    )
