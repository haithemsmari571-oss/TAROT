"""add related_message_id to transactions

Revision ID: a5b6c7d8e9f0
Revises: f4a5b6c7d8e9
Create Date: 2026-09-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a5b6c7d8e9f0"
down_revision: Union[str, Sequence[str], None] = "f4a5b6c7d8e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Both directions run inside batch_alter_table. On PostgreSQL (production, and the
# CI migration lane) batch mode issues the same plain ALTER TABLE statements. On
# SQLite it rebuilds the table by copy-and-move, which is the only way that engine
# can add a foreign key or drop a column another key references.


def upgrade() -> None:
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.add_column(
            sa.Column(
                "related_message_id",
                sa.Integer(),
                sa.ForeignKey(
                    "messages.id",
                    name="fk_transactions_related_message_id_messages",
                ),
                nullable=True,
            )
        )
    # Plain, NON-unique index: this column exists for lookup. One debit per message
    # is guaranteed by the UNIQUE idempotency_key ("msg_fee:{id}"), not here.
    op.create_index(
        "ix_transactions_related_message_id",
        "transactions",
        ["related_message_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_transactions_related_message_id", table_name="transactions")
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.drop_column("related_message_id")
