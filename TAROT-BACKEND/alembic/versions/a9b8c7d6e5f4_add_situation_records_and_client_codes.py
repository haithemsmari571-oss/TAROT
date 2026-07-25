"""add client_situation_records + human-readable users.client_code

Revision ID: a9b8c7d6e5f4
Revises: f7a8b9c0d1e2
Create Date: 2026-07-25 00:00:00.000000

Atlas Track A, phase A0 (memory/disk layer):
- client_situation_records: ONE rolling structured situation document per
  client (mirrors client_notes' per-client keying). Nothing in the reading
  pipeline reads it yet — writes are flag-gated and side-effect-only.
- users.client_code: the visible, non-enumerable identifier the CRM shows
  (AV-XXXXXX). Backfilled for every existing user here; new ORM-created users
  get one from the model default.
"""
from typing import Sequence, Union

import secrets

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a9b8c7d6e5f4"
down_revision: Union[str, Sequence[str], None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"


def _generate_code() -> str:
    return "AV-" + "".join(secrets.choice(_ALPHABET) for _ in range(6))


def upgrade() -> None:
    op.create_table(
        "client_situation_records",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("chat_id", sa.Integer(), nullable=True),
        sa.Column("situation", sa.JSON(), nullable=False),
        sa.Column(
            "source",
            sa.Enum("DETERMINISTIC", "AI_DELTA", "HUMAN", name="situationsource"),
            nullable=False,
        ),
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
        sa.ForeignKeyConstraint(["client_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["chat_id"], ["chats.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_client_situation_records_client_id",
        "client_situation_records",
        ["client_id"],
        unique=True,
    )

    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("client_code", sa.String(length=12), nullable=True))
    op.create_index("ix_users_client_code", "users", ["client_code"], unique=True)

    # Backfill: every existing account gets a code, collision-checked in-memory
    # against the codes assigned in this same run (the unique index guards the
    # rest). Kept as plain SQL so the migration never imports application code.
    connection = op.get_bind()
    rows = connection.execute(
        sa.text("SELECT id FROM users WHERE client_code IS NULL ORDER BY id")
    ).fetchall()
    assigned: set[str] = set()
    for (user_id,) in rows:
        code = _generate_code()
        while code in assigned:
            code = _generate_code()
        assigned.add(code)
        connection.execute(
            sa.text("UPDATE users SET client_code = :code WHERE id = :id"),
            {"code": code, "id": user_id},
        )


def downgrade() -> None:
    op.drop_index("ix_users_client_code", table_name="users")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("client_code")
    op.drop_index(
        "ix_client_situation_records_client_id",
        table_name="client_situation_records",
    )
    op.drop_table("client_situation_records")
    sa.Enum(name="situationsource").drop(op.get_bind(), checkfirst=True)
