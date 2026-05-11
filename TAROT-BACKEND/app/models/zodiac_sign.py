from typing import List

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ZodiacSign(Base):
    __tablename__ = "zodiac_signs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(unique=True)  # e.g., "Aries", "Gemini"
    element: Mapped[str]  # Fire, Earth, Air, Water
    modality: Mapped[str]  # Cardinal, Fixed, Mutable
    ruling_planet: Mapped[str]  # e.g., "Mercury", "Mars"
    date_range_start: Mapped[str]  # e.g., "05-21" (MM-DD format)
    date_range_end: Mapped[str]  # e.g., "06-20"
    core_trait: Mapped[str]  # e.g., "Witty"
    signature_trait: Mapped[str]  # Full description
    description: Mapped[str] = mapped_column(nullable=True)

    # Relationships
    compatibility_as_sign1: Mapped[List["ZodiacCompatibility"]] = relationship(
        "ZodiacCompatibility",
        foreign_keys="ZodiacCompatibility.sign_id_1",
        back_populates="sign_1",
        cascade="all, delete-orphan",
    )

    compatibility_as_sign2: Mapped[List["ZodiacCompatibility"]] = relationship(
        "ZodiacCompatibility",
        foreign_keys="ZodiacCompatibility.sign_id_2",
        back_populates="sign_2",
        cascade="all, delete-orphan",
    )
