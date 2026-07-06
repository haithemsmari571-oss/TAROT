"""add daily_content and daily_pulls tables

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-07-05 23:10:00.000000

The client-facing daily card pull (Step 4): a per-sign/per-day content table
(the shape the nightly Claude job will later fill) and a per-user/per-day pull
record that enforces one pull a day and tracks the streak.

Additive only — two brand-new tables, no existing data touched. Safe for a
server that runs `alembic upgrade head` on restart.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, Sequence[str], None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps():
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
    op.create_table(
        "daily_content",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("content_date", sa.Date(), nullable=False),
        sa.Column("zodiac_sign", sa.String(32), nullable=False),
        sa.Column("card_key", sa.Integer(), nullable=False),
        sa.Column("card_name", sa.String(64), nullable=False),
        sa.Column("interpretation", sa.Text(), nullable=False),
        sa.Column("manifestation", sa.Text(), nullable=False),
        sa.Column("ritual", sa.Text(), nullable=False),
        sa.Column("quote_line", sa.Text(), nullable=False),
        sa.Column(
            "source", sa.String(32), server_default="placeholder", nullable=False
        ),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "content_date", "zodiac_sign", name="uq_daily_content_date_sign"
        ),
    )
    op.create_index("ix_daily_content_content_date", "daily_content", ["content_date"])
    op.create_index("ix_daily_content_zodiac_sign", "daily_content", ["zodiac_sign"])

    op.create_table(
        "daily_pulls",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("pull_date", sa.Date(), nullable=False),
        sa.Column("card_key", sa.Integer(), nullable=False),
        sa.Column("reward", sa.Numeric(10, 2), nullable=False),
        sa.Column("streak_length", sa.Integer(), nullable=False),
        sa.Column("week_position", sa.Integer(), nullable=False),
        sa.Column("bonus_awarded", sa.Numeric(10, 2), server_default="0", nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "pull_date", name="uq_daily_pull_user_date"),
    )
    op.create_index("ix_daily_pulls_user_id", "daily_pulls", ["user_id"])
    op.create_index("ix_daily_pulls_pull_date", "daily_pulls", ["pull_date"])


def downgrade() -> None:
    op.drop_index("ix_daily_pulls_pull_date", table_name="daily_pulls")
    op.drop_index("ix_daily_pulls_user_id", table_name="daily_pulls")
    op.drop_table("daily_pulls")

    op.drop_index("ix_daily_content_zodiac_sign", table_name="daily_content")
    op.drop_index("ix_daily_content_content_date", table_name="daily_content")
    op.drop_table("daily_content")
