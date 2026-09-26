"""Reply emails: her switch, and when a conversation last emailed her.

users.reply_emails is on for every client, those who exist now included; she
turns it off in the You tab. chats.client_reply_emailed_at is when the reply
sweep (services/reply_emails.py) last emailed her about the conversation; NULL
until it does.

Revision ID: 55f95ef6d418
Revises: 6c5d3306b02d
"""

from alembic import op
import sqlalchemy as sa


revision = "55f95ef6d418"
down_revision = "6c5d3306b02d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("reply_emails", sa.Boolean(), nullable=False, server_default=sa.true())
        )
    with op.batch_alter_table("chats") as batch_op:
        batch_op.add_column(
            sa.Column("client_reply_emailed_at", sa.DateTime(timezone=True), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("chats") as batch_op:
        batch_op.drop_column("client_reply_emailed_at")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("reply_emails")
