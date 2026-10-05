"""Add push_subscriptions, the browsers that get phone notifications (ROUND57).

One row per browser that turned notifications on, in the client app or in the
owner's phone admin: the push service address it gave and the two keys the
notification is encrypted to. A new table only; no existing row is touched.
Dropping it is the way back.

Revision ID: e7a1c4b9d2f6
Revises: 3cdfc7d7d1ef
"""

from alembic import op
import sqlalchemy as sa


revision = "e7a1c4b9d2f6"
down_revision = "3cdfc7d7d1ef"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.String(length=255), nullable=False),
        sa.Column("auth", sa.String(length=255), nullable=False),
        sa.Column("app", sa.String(length=16), nullable=False),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        # Every table carries the shared Base's two timestamps (models/base.py).
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("endpoint", name="uq_push_subscriptions_endpoint"),
        # Frozen copy of models/push_subscription.py PUSH_APP_CHECK: a migration
        # keeps the schema it made, whatever the model says later.
        sa.CheckConstraint(
            "app IN ('client', 'owner')", name="ck_push_subscriptions_app"
        ),
    )
    op.create_index(
        "ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_push_subscriptions_user_id", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
