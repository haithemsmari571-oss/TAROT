"""Record when a client agreed to the Terms and the Privacy Policy at sign-up.

Revision ID: b7e2c4a91d3f
Revises: f0a1b2c3d4e5
"""

from alembic import op
import sqlalchemy as sa


revision = "b7e2c4a91d3f"
down_revision = "f0a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable: every account made before the tick box has no such moment.
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("terms_accepted_at")
