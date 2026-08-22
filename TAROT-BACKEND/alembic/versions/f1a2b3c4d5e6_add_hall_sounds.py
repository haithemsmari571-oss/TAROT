"""Add hall_sounds — the owner's ambient loops for the entry form and the room.

Revision ID: f1a2b3c4d5e6
Revises: e9f0a1b2c3d4
"""

from alembic import op
import sqlalchemy as sa


revision = "f1a2b3c4d5e6"
down_revision = "e9f0a1b2c3d4"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    if "hall_sounds" in _tables():
        return
    op.create_table(
        "hall_sounds",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("file_path", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=32), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("duration_seconds", sa.Float(), nullable=False),
        sa.Column("level", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("original_filename", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("level >= 0 AND level <= 1", name="ck_hall_sounds_level_0_1"),
        sa.CheckConstraint("duration_seconds > 0", name="ck_hall_sounds_duration_positive"),
        sa.UniqueConstraint("key", name="uq_hall_sounds_key"),
        sa.UniqueConstraint("file_path", name="uq_hall_sounds_file_path"),
    )
    op.create_index("ix_hall_sounds_enabled_sort", "hall_sounds", ["enabled", "sort_order"])


def downgrade() -> None:
    if "hall_sounds" not in _tables():
        return
    op.drop_index("ix_hall_sounds_enabled_sort", table_name="hall_sounds")
    op.drop_table("hall_sounds")
