"""Start existing chats with a clean unread baseline.

Revision ID: d9e0f1a2b3c4
Revises: c7d8e9f0a1b2
"""

from alembic import op
import sqlalchemy as sa


revision = "d9e0f1a2b3c4"
down_revision = "c7d8e9f0a1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    chats = sa.table(
        "chats",
        sa.column("client_last_opened_at", sa.DateTime(timezone=True)),
    )
    # Preserve known opens and leave the column's NULL default unchanged so
    # reader messages in chats created after this backfill still start unread.
    op.execute(
        chats.update()
        .where(chats.c.client_last_opened_at.is_(None))
        .values(client_last_opened_at=sa.func.current_timestamp())
    )


def downgrade() -> None:
    # This data backfill cannot identify the original NULL rows afterwards.
    # Keep read markers rather than erasing real client opens on downgrade.
    pass
