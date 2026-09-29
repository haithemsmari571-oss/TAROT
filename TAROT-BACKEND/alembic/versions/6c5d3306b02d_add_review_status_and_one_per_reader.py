"""A review waits for the owner before any page shows it, and a client reviews a reader once.

status is pending until the owner approves or hides it. A review that exists
before this column is pending too: none of them was ever read by the owner.
The unique pair is the rule services/reviews.py already checks, now also held
by the database.

A client could review the same reader more than once before that rule, and
the unique pair cannot be added while two such reviews exist. So the upgrade
first deletes every review that has a newer one (higher id) by the same client
of the same reader, keeps the newest of each pair, and logs how many it
removed. The downgrade does not bring the removed reviews back.

Revision ID: 6c5d3306b02d
Revises: b7e2c4a91d3f
"""

import logging

from alembic import op
import sqlalchemy as sa


revision = "6c5d3306b02d"
down_revision = "b7e2c4a91d3f"
branch_labels = None
depends_on = None


log = logging.getLogger("alembic.runtime.migration")

# Every review with a newer one (higher id) by the same client of the same
# reader. Plain EXISTS, so it reads the same on PostgreSQL and SQLite.
DELETE_OLDER_DUPLICATES = sa.text(
    """
    DELETE FROM reviews
    WHERE EXISTS (
        SELECT 1 FROM reviews AS newer
        WHERE newer.user_id = reviews.user_id
          AND newer.psychic_id = reviews.psychic_id
          AND newer.id > reviews.id
    )
    """
)


def upgrade() -> None:
    removed = op.get_bind().execute(DELETE_OLDER_DUPLICATES).rowcount
    log.info(
        "Removed %s duplicate review(s), keeping the newest per client and reader", removed
    )
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
