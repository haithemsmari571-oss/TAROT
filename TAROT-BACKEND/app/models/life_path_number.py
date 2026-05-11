from typing import List

from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class LifePathNumber(Base):
    __tablename__ = "life_path_numbers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    number: Mapped[int] = mapped_column(unique=True)  # 1-9, 11, 22, 33
    title: Mapped[str]  # e.g., "The Powerhouse", "The Visionary"
    description: Mapped[str]  # Full text description
    core_strengths: Mapped[dict] = mapped_column(JSON)  # Array of strengths
    growth_areas: Mapped[dict] = mapped_column(JSON)  # Array of growth areas

    # Relationships
    compatibility_as_path1: Mapped[List["LifePathCompatibility"]] = relationship(
        "LifePathCompatibility",
        foreign_keys="LifePathCompatibility.life_path_id_1",
        back_populates="life_path_1",
        cascade="all, delete-orphan",
    )

    compatibility_as_path2: Mapped[List["LifePathCompatibility"]] = relationship(
        "LifePathCompatibility",
        foreign_keys="LifePathCompatibility.life_path_id_2",
        back_populates="life_path_2",
        cascade="all, delete-orphan",
    )
