from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class LifePathCompatibility(Base):
    __tablename__ = "life_path_compatibility"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    life_path_id_1: Mapped[int] = mapped_column(ForeignKey("life_path_numbers.id"))
    life_path_id_2: Mapped[int] = mapped_column(ForeignKey("life_path_numbers.id"))

    compatibility_score: Mapped[int]  # 0-100
    compatibility_description: Mapped[str] = mapped_column(nullable=True)

    # Relationships
    life_path_1: Mapped["LifePathNumber"] = relationship(
        "LifePathNumber",
        foreign_keys=[life_path_id_1],
        back_populates="compatibility_as_path1",
    )

    life_path_2: Mapped["LifePathNumber"] = relationship(
        "LifePathNumber",
        foreign_keys=[life_path_id_2],
        back_populates="compatibility_as_path2",
    )
