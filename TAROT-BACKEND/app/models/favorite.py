from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class FavoritePsychic(Base):
    """
    A client's favourited reader. One row per (user, psychic) pair — adding is
    idempotent (upsert), removing deletes the row. Kept as its own table (not a
    flag) so favourites survive independently of either profile's edits.

    created_at/updated_at come from Base (which maps them onto EVERY model —
    the table MUST have both columns or inserts fail with UndefinedColumn).
    """

    __tablename__ = "favorite_psychics"
    __table_args__ = (
        UniqueConstraint("user_id", "psychic_id", name="uq_favorite_user_psychic"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True, nullable=False
    )
    psychic_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    psychic: Mapped["User"] = relationship("User", foreign_keys=[psychic_id])
