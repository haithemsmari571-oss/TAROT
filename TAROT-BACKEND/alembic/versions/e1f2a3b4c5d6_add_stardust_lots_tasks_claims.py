"""add stardust_lots, tasks and claims tables

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-07-05 22:05:00.000000

The gamification backbone (Sections 5-6): the earned-Stardust lot ledger, the
admin-managed task pool, and the claim records that connect them.

Purely additive — three brand-new tables and their enum types. No existing
table, column or row is modified, so a server that runs `alembic upgrade head`
on restart loses nothing and every current balance stays "purchased".
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = "d0e1f2a3b4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps():
    """Base created_at / updated_at columns, matching app.models.base.Base."""
    return (
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
    )


def upgrade() -> None:
    # ── Earned-Stardust lots ────────────────────────────────────────────────
    op.create_table(
        "stardust_lots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("remaining", sa.Numeric(10, 2), nullable=False),
        sa.Column("source", sa.String(255), nullable=True),
        sa.Column("credited_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "is_expired",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("transaction_id", sa.Integer(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stardust_lots_user_id", "stardust_lots", ["user_id"])
    op.create_index("ix_stardust_lots_credited_at", "stardust_lots", ["credited_at"])
    op.create_index("ix_stardust_lots_expires_at", "stardust_lots", ["expires_at"])

    # ── Admin-managed task pool ─────────────────────────────────────────────
    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon", sa.String(64), nullable=True),
        sa.Column("reward", sa.Numeric(10, 2), server_default="0", nullable=False),
        sa.Column(
            "verification_type",
            sa.Enum("AUTO", "SCREENSHOT", "HANDLE", name="verificationtype"),
            nullable=False,
        ),
        sa.Column(
            "trigger_event",
            sa.Enum(
                "DAILY_PULL",
                "READING_RATED",
                "FAVOURITES_PICKED",
                "FIRST_PURCHASE",
                "PURCHASE_DISTINCT_READER",
                "REFERRAL_FIRST_PAYMENT",
                "STREAK_MILESTONE",
                name="tasktriggerevent",
            ),
            nullable=True,
        ),
        sa.Column(
            "frequency",
            sa.Enum(
                "ONCE_PER_ACCOUNT",
                "ONCE_PER_DAY",
                "ONCE_PER_WINDOW",
                "UNLIMITED",
                name="taskfrequency",
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("ACTIVE", "INACTIVE", name="taskstatus"),
            nullable=False,
        ),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "rotation_weight", sa.Integer(), server_default="1", nullable=False
        ),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── Claims (the backbone) ───────────────────────────────────────────────
    op.create_table(
        "claims",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("PENDING", "APPROVED", "REJECTED", name="claimstatus"),
            nullable=False,
        ),
        sa.Column("evidence_path", sa.String(512), nullable=True),
        sa.Column("evidence_handle", sa.String(255), nullable=True),
        sa.Column("reward_amount", sa.Numeric(10, 2), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("approved_by", sa.Integer(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("transaction_id", sa.Integer(), nullable=True),
        sa.Column("idempotency_key", sa.String(255), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key", name="uq_claims_idempotency_key"),
    )
    op.create_index("ix_claims_user_id", "claims", ["user_id"])
    op.create_index("ix_claims_task_id", "claims", ["task_id"])


def downgrade() -> None:
    op.drop_index("ix_claims_task_id", table_name="claims")
    op.drop_index("ix_claims_user_id", table_name="claims")
    op.drop_table("claims")

    op.drop_table("tasks")

    op.drop_index("ix_stardust_lots_expires_at", table_name="stardust_lots")
    op.drop_index("ix_stardust_lots_credited_at", table_name="stardust_lots")
    op.drop_index("ix_stardust_lots_user_id", table_name="stardust_lots")
    op.drop_table("stardust_lots")

    # Drop the enum types created for the tables above (Postgres).
    bind = op.get_bind()
    for enum_name in (
        "claimstatus",
        "taskstatus",
        "taskfrequency",
        "tasktriggerevent",
        "verificationtype",
    ):
        sa.Enum(name=enum_name).drop(bind, checkfirst=True)
