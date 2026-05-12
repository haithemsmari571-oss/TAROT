from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LandingContent(Base):
    __tablename__ = "landing_content"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    section: Mapped[str] = mapped_column(unique=True)
    content: Mapped[dict] = mapped_column(JSON)
