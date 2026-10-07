"""Add reel_likes, the reels each client has liked in the Shorts tab (ROUND71).

One row per client and reel she has liked; created_at is when. Her Favourites
list them, the newest like first. A new table only; no existing row is touched.
Dropping it is the way back.

Revision ID: 0009ab288b88
Revises: ff5f7d74d8a9
"""

from alembic import op
import sqlalchemy as sa


revision = "0009ab288b88"
down_revision = "ff5f7d74d8a9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reel_likes",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("library_item_id", sa.Integer(), nullable=False),
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
    op.create_index("ix_reel_likes_library_item_id", "reel_likes", ["library_item_id"])


def downgrade() -> None:
    op.drop_index("ix_reel_likes_library_item_id", table_name="reel_likes")
    op.drop_table("reel_likes")
