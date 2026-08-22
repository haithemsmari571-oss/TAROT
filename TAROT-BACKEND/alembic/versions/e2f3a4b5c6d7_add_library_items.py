"""Add the owner-managed Sanctuary content library.

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
"""

from alembic import op
import sqlalchemy as sa


revision = "e2f3a4b5c6d7"
down_revision = "d1e2f3a4b5c6"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    if "library_items" in _tables():
        return
    op.create_table(
        "library_items",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("type", sa.String(length=80), nullable=False),
        sa.Column("title", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("audio_file_path", sa.String(length=255), nullable=False),
        sa.Column("audio_content_type", sa.String(length=32), nullable=False),
        sa.Column("audio_size_bytes", sa.Integer(), nullable=False),
        sa.Column("audio_sha256", sa.String(length=64), nullable=False),
        sa.Column("duration_seconds", sa.Float(), nullable=False),
        sa.Column("cover_image_path", sa.String(length=255), nullable=True),
        sa.Column("cover_content_type", sa.String(length=32), nullable=True),
        sa.Column("cover_size_bytes", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "duration_seconds > 0",
            name="ck_library_items_duration_positive",
        ),
        sa.CheckConstraint(
            "(cover_image_path IS NULL AND cover_content_type IS NULL AND cover_size_bytes IS NULL) "
            "OR (cover_image_path IS NOT NULL AND cover_content_type IS NOT NULL "
            "AND cover_size_bytes IS NOT NULL)",
            name="ck_library_items_cover_metadata_paired",
        ),
        sa.UniqueConstraint("key", name="uq_library_items_key"),
        sa.UniqueConstraint("audio_file_path", name="uq_library_items_audio_file_path"),
        sa.UniqueConstraint("cover_image_path", name="uq_library_items_cover_image_path"),
    )
    op.create_index(
        "ix_library_items_public_sort",
        "library_items",
        ["enabled", "published_at", "sort_order"],
    )


def downgrade() -> None:
    if "library_items" not in _tables():
        return
    op.drop_index("ix_library_items_public_sort", table_name="library_items")
    op.drop_table("library_items")
