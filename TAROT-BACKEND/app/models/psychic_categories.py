from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class PsychicCategory(Base):
    __tablename__ = "psychic_categories"
    psychic_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    category_id: Mapped[str] = mapped_column(
        ForeignKey("categories.id"), primary_key=True
    )

    psychics: Mapped["User"] = relationship("User", back_populates="categories")
    category: Mapped["Category"] = relationship("Category", back_populates="psychics")
