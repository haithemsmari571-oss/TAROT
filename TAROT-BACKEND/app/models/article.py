from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Article(Base):
    __tablename__ = "articles"
    __table_args__ = (
        UniqueConstraint("slug", name="articles_slug_key"),
        Index("ix_articles_slug", "slug", unique=True),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(180))
    category: Mapped[str] = mapped_column(String(60), index=True)
    status: Mapped[str] = mapped_column(String(20), default="draft", index=True)
    featured: Mapped[bool] = mapped_column(Boolean, default=False)
    published_version_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    published_slug: Mapped[Optional[str]] = mapped_column(String(180), unique=True, index=True, nullable=True)
    published_category: Mapped[Optional[str]] = mapped_column(String(60), index=True, nullable=True)
    published_featured: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    versions: Mapped[list["ArticleVersion"]] = relationship(back_populates="article", cascade="all, delete-orphan")


class ArticleVersion(Base):
    __tablename__ = "article_versions"
    __table_args__ = (UniqueConstraint("article_id", "version_number", name="uq_article_version_number"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    article_id: Mapped[int] = mapped_column(ForeignKey("articles.id", ondelete="CASCADE"), index=True)
    version_number: Mapped[int] = mapped_column(Integer)
    slug: Mapped[str] = mapped_column(String(180))
    category: Mapped[str] = mapped_column(String(60))
    featured: Mapped[bool] = mapped_column(Boolean, default=False)
    title: Mapped[str] = mapped_column(String(220))
    excerpt: Mapped[str] = mapped_column(String(500))
    body: Mapped[str] = mapped_column(Text)
    body_format: Mapped[str] = mapped_column(String(12), default="markdown")
    author: Mapped[str] = mapped_column(String(120))
    seo_title: Mapped[str] = mapped_column(String(220))
    meta_description: Mapped[str] = mapped_column(String(320))
    canonical_override: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    cover_image: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    cover_alt: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    social_image: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    series_name: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)
    series_part: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    calculator_cta: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    reading_cta: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    related_slugs: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    article: Mapped[Article] = relationship(back_populates="versions")


class ArticleSlugRedirect(Base):
    __tablename__ = "article_slug_redirects"
    __table_args__ = (
        UniqueConstraint("old_slug", name="uq_article_slug_redirect_old_slug"),
        Index("ix_article_slug_redirects_old_slug", "old_slug", unique=True),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    article_id: Mapped[int] = mapped_column(ForeignKey("articles.id", ondelete="CASCADE"), index=True)
    old_slug: Mapped[str] = mapped_column(String(180))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ArticleAuditEvent(Base):
    __tablename__ = "article_audit_events"
    __table_args__ = (UniqueConstraint("idempotency_key", name="uq_article_audit_idempotency"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    article_id: Mapped[int] = mapped_column(ForeignKey("articles.id", ondelete="CASCADE"), index=True)
    version_id: Mapped[Optional[int]] = mapped_column(ForeignKey("article_versions.id", ondelete="SET NULL"), nullable=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(30), index=True)
    prior_state: Mapped[str] = mapped_column(Text)
    resulting_state: Mapped[str] = mapped_column(Text)
    idempotency_key: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
