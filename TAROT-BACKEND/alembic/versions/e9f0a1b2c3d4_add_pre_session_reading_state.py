"""Where the pre-session reading got to, so acceptance can wait on it.

The reading is now written from the client's request text while she waits to be accepted,
before any session exists and before anything is billed. These four columns record that:
whether it is pending, ready or failed, when it became ready, and which message she wrote.

The CRM's auto-accept reads them through /api/chat/{id}/pre-reading so it can wait on the
reading instead of on a random five-to-twenty-second timer.

All nullable. Every existing row stays NULL, which the acceptance signal reads as "no
pre-reading was ever started, so there is nothing to wait for" — exactly today's behaviour.

Revision ID: e9f0a1b2c3d4
Revises: d8e9f0a1b2c3
Create Date: 2026-08-16
"""

from alembic import op
import sqlalchemy as sa

revision = "e9f0a1b2c3d4"
down_revision = "d8e9f0a1b2c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reading_session_states",
        sa.Column("pre_reading_status", sa.Text(), nullable=True),
    )
    op.add_column(
        "reading_session_states",
        sa.Column("pre_reading_requested_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "reading_session_states",
        sa.Column("pre_reading_ready_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "reading_session_states",
        sa.Column("pre_reading_message_id", sa.Integer(), nullable=True),
    )
    # The one global stop, seeded ON so nothing changes until somebody turns it off. It
    # lives in the existing key/value settings table, so it is reachable through the admin
    # settings route the owner already has, and stopping acceptance never needs a deploy.
    op.execute(
        "INSERT INTO settings (key, value) "
        "SELECT 'reading_auto_accept_enabled', 'true' "
        "WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'reading_auto_accept_enabled')"
    )


def downgrade() -> None:
    op.execute("DELETE FROM settings WHERE key = 'reading_auto_accept_enabled'")
    op.drop_column("reading_session_states", "pre_reading_message_id")
    op.drop_column("reading_session_states", "pre_reading_ready_at")
    op.drop_column("reading_session_states", "pre_reading_requested_at")
    op.drop_column("reading_session_states", "pre_reading_status")
