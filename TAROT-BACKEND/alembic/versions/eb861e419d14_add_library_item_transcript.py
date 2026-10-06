"""Library items keep the words spoken in a video (ROUND67).

library_items.transcript holds what is said in a reel, printed under it on the
public reels page (routers/public_seo.py). It is optional text: every existing
row gets NULL and an item without one simply shows no transcript. Dropping the
column is the way back.

Revision ID: eb861e419d14
Revises: f7f439445b4b
"""

from alembic import op
import sqlalchemy as sa


revision = "eb861e419d14"
down_revision = "f7f439445b4b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("library_items") as batch_op:
        batch_op.add_column(sa.Column("transcript", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("library_items") as batch_op:
        batch_op.drop_column("transcript")
