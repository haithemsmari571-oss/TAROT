from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class BuyOption(Base):
    __tablename__ = "buy_options"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    label: Mapped[str] = mapped_column(nullable=False)
    points: Mapped[int] = mapped_column(nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    sort_order: Mapped[int] = mapped_column(default=0)
