"""Add UK reader hours and hide the two test readers from the roster.

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
"""

from alembic import op
import sqlalchemy as sa


revision = "b6c7d8e9f0a1"
down_revision = "a5b6c7d8e9f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("online_from", sa.Time(), nullable=True))
        batch_op.add_column(sa.Column("online_to", sa.Time(), nullable=True))
        batch_op.add_column(
            sa.Column("is_listed", sa.Boolean(), nullable=False, server_default=sa.true())
        )
        batch_op.create_check_constraint(
            "ck_users_online_hours_pair",
            "(online_from IS NULL AND online_to IS NULL) OR "
            "(online_from IS NOT NULL AND online_to IS NOT NULL)",
        )
        batch_op.create_check_constraint(
            "ck_users_online_hours_distinct",
            "online_from IS NULL OR online_from <> online_to",
        )

    # No hours are backfilled. UPDATE is harmless when either ID is absent and
    # cannot hide a client account that happens to use one of these IDs locally.
    users = sa.table(
        "users", sa.column("id", sa.Integer()), sa.column("role", sa.String()),
        sa.column("is_listed", sa.Boolean()),
    )
    op.execute(
        users.update()
        .where(users.c.id.in_([97, 99]), users.c.role == "PSYCHIC")
        .values(is_listed=False)
    )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("ck_users_online_hours_distinct", type_="check")
        batch_op.drop_constraint("ck_users_online_hours_pair", type_="check")
        batch_op.drop_column("is_listed")
        batch_op.drop_column("online_to")
        batch_op.drop_column("online_from")
