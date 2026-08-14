"""add durable session-scoped reading message bursts

Revision ID: 4d5e6f7a8b9c
Revises: 3c4d5e6f7a8b
"""

import sqlalchemy as sa

from alembic import op

revision = "4d5e6f7a8b9c"
down_revision = "3c4d5e6f7a8b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reading_message_bursts",
        sa.Column("chat_session_id", sa.Integer(), nullable=False),
        sa.Column("chat_id", sa.Integer(), nullable=False),
        sa.Column("latest_client_message_id", sa.Integer(), nullable=True),
        sa.Column("completed_client_message_id", sa.Integer(), nullable=True),
        sa.Column(
            "generation_version", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("status", sa.Text(), nullable=False, server_default="IDLE"),
        sa.Column("silence_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("typing_signals", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("lease_owner", sa.Text(), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("response_bubbles", sa.Text(), nullable=True),
        sa.Column("response_reserve", sa.Text(), nullable=True),
        sa.Column("response_route", sa.Text(), nullable=True),
        sa.Column(
            "delivery_position", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["chat_id"], ["chats.id"]),
        sa.ForeignKeyConstraint(["chat_session_id"], ["chat_sessions.id"]),
        sa.ForeignKeyConstraint(["completed_client_message_id"], ["messages.id"]),
        sa.ForeignKeyConstraint(["latest_client_message_id"], ["messages.id"]),
        sa.PrimaryKeyConstraint("chat_session_id"),
    )
    op.create_index(
        "ix_reading_message_bursts_chat_id",
        "reading_message_bursts",
        ["chat_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_reading_message_bursts_chat_id",
        table_name="reading_message_bursts",
    )
    op.drop_table("reading_message_bursts")
