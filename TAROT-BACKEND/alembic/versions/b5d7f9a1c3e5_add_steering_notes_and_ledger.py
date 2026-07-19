"""add reading_steering_notes + reading_session_states.commitment_ledger

Revision ID: b5d7f9a1c3e5
Revises: f4b5c6d7e8a9
Create Date: 2026-07-19 00:00:00.000000

Phase 3 memory:
  * reading_steering_notes — operator guidance for Hybrid drafting. Bound to
    the chat_sessions row that was ACTIVE when written (session-scoped: expires
    with the session), retrievable only while the chat is in HYBRID mode.
    Retired rows are kept (active=false) as the audit trail.
  * reading_session_states.commitment_ledger — JSON list of regex-extracted
    commitments (openly named tarot cards, timing windows) appended after each
    DELIVERED turn, re-injected so later turns stay consistent with them.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b5d7f9a1c3e5"
down_revision: Union[str, Sequence[str], None] = "f4b5c6d7e8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reading_steering_notes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("chat_id", sa.Integer(), nullable=False),
        sa.Column("chat_session_id", sa.Integer(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_by", sa.Integer(), nullable=False),
        sa.Column("deactivated_by", sa.Integer(), nullable=True),
        sa.Column("deactivated_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(["chat_session_id"], ["chat_sessions.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["deactivated_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_reading_steering_notes_chat_id",
        "reading_steering_notes",
        ["chat_id"],
        unique=False,
    )
    op.create_index(
        "ix_reading_steering_notes_chat_session_id",
        "reading_steering_notes",
        ["chat_session_id"],
        unique=False,
    )
    op.add_column(
        "reading_session_states",
        sa.Column("commitment_ledger", sa.Text(), server_default="[]", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("reading_session_states", "commitment_ledger")
    op.drop_index(
        "ix_reading_steering_notes_chat_session_id", table_name="reading_steering_notes"
    )
    op.drop_index("ix_reading_steering_notes_chat_id", table_name="reading_steering_notes")
    op.drop_table("reading_steering_notes")
