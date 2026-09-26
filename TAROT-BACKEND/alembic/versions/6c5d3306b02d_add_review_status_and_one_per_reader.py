"""A review waits for the owner before any page shows it, and a client reviews a reader once.

status is pending until the owner approves or hides it. A review that exists
before this column is pending too: none of them was ever read by the owner.
The unique pair is the rule services/reviews.py already checks, now also held
by the database.

Revision ID: 6c5d3306b02d
Revises: b7e2c4a91d3f
"""

from alembic import op
import sqlalchemy as sa


revision = "6c5d3306b02d"
down_revision = "b7e2c4a91d3f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("reviews") as batch_op:
        batch_op.add_column(
            sa.Column("status", sa.String(16), nullable=False, server_default="pending")
        )
        batch_op.create_check_constraint(
            "check_review_status", "status IN ('pending', 'approved', 'hidden')"
        )
        batch_op.create_unique_constraint(
            "unique_user_psychic_review", ["user_id", "psychic_id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("reviews") as batch_op:
        batch_op.drop_constraint("unique_user_psychic_review", type_="unique")
        batch_op.drop_constraint("check_review_status", type_="check")
        batch_op.drop_column("status")
