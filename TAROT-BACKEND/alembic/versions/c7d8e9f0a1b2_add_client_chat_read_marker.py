"""Record client chat opens independently of message delivery status.

Revision ID: c7d8e9f0a1b2
Revises: b6c7d8e9f0a1
"""

from alembic import op
import sqlalchemy as sa

revision = "c7d8e9f0a1b2"
down_revision = "b6c7d8e9f0a1"
branch_labels = None
depends_on = None


def upgrade():
    # Existing READ statuses cannot establish a real client open. Leave unknown
    # markers NULL: existing reader replies remain unread until the client opens.
    op.add_column("chats", sa.Column("client_last_opened_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_messages_chat_activity", "messages", ["chat_id", "created_at", "id"])


def downgrade():
    op.drop_index("ix_messages_chat_activity", table_name="messages")
    op.drop_column("chats", "client_last_opened_at")
