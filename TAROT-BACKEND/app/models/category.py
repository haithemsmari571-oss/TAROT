from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(unique=True)

    psychics: Mapped["PsychicCategory"] = relationship(
        "PsychicCategory", back_populates="category", cascade="all, delete-orphan"
    )
