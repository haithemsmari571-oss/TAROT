"""add reading_draft_attempts (append-only pipeline audit log)

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-07-17 00:00:00.000000

Logs one row per reading-pipeline generation attempt (Valentina's raw draft, Sabri's
curated delivery + advisory notes, or the single-agent Reader's raw output + holds) so a
human can later review what actually happened during a reading, not just the delivered
bubbles. Append-only: every attempt is kept, never overwritten. Backend only; the live
review screen belongs with the cockpit redesign and is not built here.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e3f4a5b6c7d8"
down_revision: Union[str, Sequence[str], None] = "d2e3f4a5b6c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reading_draft_attempts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("chat_id", sa.Integer(), nullable=False),
        sa.Column("turn_number", sa.Integer(), nullable=False),
        sa.Column("attempt_number", sa.Integer(), server_default="1", nullable=False),
        sa.Column("engine", sa.Text(), nullable=False),
        sa.Column("stage", sa.Text(), nullable=False),
        sa.Column("raw_content", sa.Text(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_delivered", sa.Boolean(), server_default=sa.false(), nullable=False),
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
        sa.ForeignKeyConstraint(["chat_id"], ["chats.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_reading_draft_attempts_chat_id", "reading_draft_attempts", ["chat_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_reading_draft_attempts_chat_id", table_name="reading_draft_attempts")
    op.drop_table("reading_draft_attempts")
