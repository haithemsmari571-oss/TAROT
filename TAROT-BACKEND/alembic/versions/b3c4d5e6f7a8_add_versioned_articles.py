"""add versioned articles

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
"""
from alembic import op
import sqlalchemy as sa

revision = "b3c4d5e6f7a8"
down_revision = "a2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "articles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("slug", sa.String(180), nullable=False, unique=True),
        sa.Column("category", sa.String(60), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("published_version_id", sa.Integer(), nullable=True),
        sa.Column("published_slug", sa.String(180), nullable=True),
        sa.Column("published_category", sa.String(60), nullable=True),
        sa.Column("published_featured", sa.Boolean(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_articles_slug", "articles", ["slug"], unique=True)
    op.create_index("ix_articles_category", "articles", ["category"])
    op.create_index("ix_articles_status", "articles", ["status"])
    op.create_index("ix_articles_published_slug", "articles", ["published_slug"], unique=True)
    op.create_index("ix_articles_published_category", "articles", ["published_category"])
    op.create_table(
        "article_versions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("article_id", sa.Integer(), sa.ForeignKey("articles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(180), nullable=False),
        sa.Column("category", sa.String(60), nullable=False),
        sa.Column("featured", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("title", sa.String(220), nullable=False),
        sa.Column("excerpt", sa.String(500), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("body_format", sa.String(12), nullable=False, server_default="markdown"),
        sa.Column("author", sa.String(120), nullable=False),
        sa.Column("seo_title", sa.String(220), nullable=False),
        sa.Column("meta_description", sa.String(320), nullable=False),
        sa.Column("canonical_override", sa.String(500), nullable=True),
        sa.Column("cover_image", sa.String(500), nullable=True),
        sa.Column("cover_alt", sa.String(300), nullable=True),
        sa.Column("social_image", sa.String(500), nullable=True),
        sa.Column("series_name", sa.String(180), nullable=True),
        sa.Column("series_part", sa.Integer(), nullable=True),
        sa.Column("calculator_cta", sa.String(80), nullable=True),
        sa.Column("reading_cta", sa.String(80), nullable=True),
        sa.Column("related_slugs", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("article_id", "version_number", name="uq_article_version_number"),
    )
    op.create_index("ix_article_versions_article_id", "article_versions", ["article_id"])
    op.create_table(
        "article_slug_redirects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("article_id", sa.Integer(), sa.ForeignKey("articles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("old_slug", sa.String(180), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("old_slug", name="uq_article_slug_redirect_old_slug"),
    )
    op.create_index("ix_article_slug_redirects_article_id", "article_slug_redirects", ["article_id"])
    op.create_index("ix_article_slug_redirects_old_slug", "article_slug_redirects", ["old_slug"], unique=True)
    op.create_table(
        "article_audit_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("article_id", sa.Integer(), sa.ForeignKey("articles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_id", sa.Integer(), sa.ForeignKey("article_versions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(30), nullable=False),
        sa.Column("prior_state", sa.Text(), nullable=False),
        sa.Column("resulting_state", sa.Text(), nullable=False),
        sa.Column("idempotency_key", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("idempotency_key", name="uq_article_audit_idempotency"),
    )
    op.create_index("ix_article_audit_events_article_id", "article_audit_events", ["article_id"])
    op.create_index("ix_article_audit_events_actor_id", "article_audit_events", ["actor_id"])
    op.create_index("ix_article_audit_events_action", "article_audit_events", ["action"])


def downgrade():
    op.drop_table("article_audit_events")
    op.drop_table("article_slug_redirects")
    op.drop_table("article_versions")
    op.drop_table("articles")
