"""Link messages to exact durable reading sessions.

Revision ID: 1a2b3c4d5e6f
Revises: 1b2c3d4e5f6
"""

from alembic import context, op
import sqlalchemy as sa


revision = "1a2b3c4d5e6f"
down_revision = "1b2c3d4e5f6"
branch_labels = None
depends_on = None


FK_NAME = "fk_messages_chat_session_id_chat_sessions"
INDEX_NAME = "ix_messages_chat_session_id"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    tables = _tables()
    if "messages" not in tables or "chat_sessions" not in tables:
        return

    if op.get_bind().dialect.name == "postgresql":
        with context.get_context().autocommit_block():
            op.execute(
                "ALTER TYPE chatsessionstatus ADD VALUE IF NOT EXISTS 'REQUESTED'"
            )
            op.execute(
                "ALTER TYPE chatsessionstatus ADD VALUE IF NOT EXISTS 'CANCELLED'"
            )

    with op.batch_alter_table("messages") as batch:
        batch.add_column(sa.Column("chat_session_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            FK_NAME,
            "chat_sessions",
            ["chat_session_id"],
            ["id"],
        )
        batch.create_index(INDEX_NAME, ["chat_session_id"], unique=False)


def downgrade() -> None:
    tables = _tables()
    if "messages" not in tables or "chat_sessions" not in tables:
        return

    with op.batch_alter_table("messages") as batch:
        batch.drop_index(INDEX_NAME)
        batch.drop_constraint(FK_NAME, type_="foreignkey")
        batch.drop_column("chat_session_id")

    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "UPDATE chat_sessions SET status = 'ACTIVE' WHERE status = 'REQUESTED'"
        )
        op.execute(
            "UPDATE chat_sessions SET status = 'COMPLETED' WHERE status = 'CANCELLED'"
        )
        op.execute("ALTER TYPE chatsessionstatus RENAME TO chatsessionstatus_d4_old")
        op.execute(
            "CREATE TYPE chatsessionstatus AS ENUM "
            "('ACTIVE', 'DISCONNECTED', 'COMPLETED')"
        )
        op.execute(
            "ALTER TABLE chat_sessions ALTER COLUMN status TYPE chatsessionstatus "
            "USING status::text::chatsessionstatus"
        )
        op.execute("DROP TYPE chatsessionstatus_d4_old")
