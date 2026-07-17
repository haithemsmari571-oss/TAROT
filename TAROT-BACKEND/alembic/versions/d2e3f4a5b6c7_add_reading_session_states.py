"""add reading_session_states (durable reading-engine working state)

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-07-17 00:00:00.000000

Persists the reading engine's per-chat working state (reserve, held-back buffer,
delivery queue + position, working transcript, counters) keyed by chat_id, so a
backend restart can rehydrate a reading mid-conversation instead of starting empty
and silently no-op-ing resume_delivery. Delivered content still lives in the
messages/chats tables; this holds only the ephemeral engine state on top of them.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d2e3f4a5b6c7"
down_revision: Union[str, Sequence[str], None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reading_session_states",
        sa.Column("chat_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Text(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=True),
        sa.Column("is_first_session", sa.Boolean(), nullable=False),
        sa.Column("reserve", sa.Text(), server_default="", nullable=False),
        sa.Column("held_back_buffer", sa.Text(), server_default="[]", nullable=False),
        sa.Column("delivery_queue", sa.Text(), server_default="[]", nullable=False),
        sa.Column("queue_position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("chat_transcript", sa.Text(), server_default="[]", nullable=False),
        sa.Column("messages_sent_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("client_response_lengths", sa.Text(), server_default="[]", nullable=False),
        sa.Column("client_response_times", sa.Text(), server_default="[]", nullable=False),
        sa.Column("sabri_correction_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("waiting_for_response", sa.Boolean(), nullable=False),
        sa.Column("session_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.PrimaryKeyConstraint("chat_id"),
    )


def downgrade() -> None:
    op.drop_table("reading_session_states")
