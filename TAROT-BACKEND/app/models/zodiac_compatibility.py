from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class ZodiacCompatibility(Base):
    __tablename__ = "zodiac_compatibility"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    sign_id_1: Mapped[int] = mapped_column(ForeignKey("zodiac_signs.id"))
    sign_id_2: Mapped[int] = mapped_column(ForeignKey("zodiac_signs.id"))

    # Percentage scores (0-100)
    love_percentage: Mapped[int]
    communication_percentage: Mapped[int]
    emotional_bond_percentage: Mapped[int]
    overall_harmony_percentage: Mapped[int]

    # Text descriptions
    elemental_insight: Mapped[str]
    compatibility_description: Mapped[str] = mapped_column(nullable=True)

    # Relationships
    sign_1: Mapped["ZodiacSign"] = relationship(
        "ZodiacSign",
        foreign_keys=[sign_id_1],
        back_populates="compatibility_as_sign1",
    )

    sign_2: Mapped["ZodiacSign"] = relationship(
        "ZodiacSign",
        foreign_keys=[sign_id_2],
        back_populates="compatibility_as_sign2",
    )
