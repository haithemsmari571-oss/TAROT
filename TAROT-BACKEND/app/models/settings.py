from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Settings(Base):
    __tablename__ = "settings"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(unique=True)
    value: Mapped[str] = mapped_column()
