"""Add reel_watches, the reels each client has watched in the Shorts tab (ROUND69).

One row per client and reel she has played to at least 90 percent, with the
last time she did. Her Shorts feed puts the reels she has not watched first.
A new table only; no existing row is touched. Dropping it is the way back.

Revision ID: ff5f7d74d8a9
Revises: eb861e419d14
"""

from alembic import op
import sqlalchemy as sa


revision = "ff5f7d74d8a9"
down_revision = "eb861e419d14"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reel_watches",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("library_item_id", sa.Integer(), nullable=False),
        sa.Column("watched_at", sa.DateTime(timezone=True), nullable=False),
        # Every table carries the shared Base's two timestamps (models/base.py).
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["library_item_id"], ["library_items.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", "library_item_id"),
    )
    # Deleting a reel finds its rows without reading the whole table.
    op.create_index(
        "ix_reel_watches_library_item_id", "reel_watches", ["library_item_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_reel_watches_library_item_id", table_name="reel_watches")
    op.drop_table("reel_watches")
