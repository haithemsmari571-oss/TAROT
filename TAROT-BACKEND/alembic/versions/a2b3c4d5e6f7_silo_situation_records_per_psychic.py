"""silo client_situation_records per (client, psychic)

Atlas Track A correction. The table shipped with a UNIQUE index on client_id
alone, i.e. ONE rolling document per client merged across every reader. That is
wrong for briefing: a client who sees two psychics would have both readers'
themes, predictions, sensitive flags and key people in one array, so briefing
one reader would leak the other's conversations.

This adds psychic_id (NOT NULL, FK -> users.id, the same target chats.psychic_id
uses since a psychic is a users row with role=PSYCHIC) and moves uniqueness to
(client_id, psychic_id), mirroring the natural key of `chats`.

Existing rows are DELETED first. Verified 0 rows in production before writing
this, so it is a no-op there; the delete is kept so the migration is also safe
on any dev database that does have rows. Those rows cannot be retro-attributed
— their content is already merged across readers — and nothing reads the table
yet, so discarding is lossless in practice: the writer rebuilds records from
live traffic. The delete must also precede the NOT NULL column for the obvious
reason that there is no correct value to backfill.

Revision ID: a2b3c4d5e6f7
Revises: a9b8c7d6e5f4
Create Date: 2026-07-26

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "a9b8c7d6e5f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TABLE = "client_situation_records"
UQ = "uq_client_situation_records_client_psychic"
FK = "fk_client_situation_records_psychic_id_users"
IX_CLIENT = "ix_client_situation_records_client_id"
IX_PSYCHIC = "ix_client_situation_records_psychic_id"

# SQLite cannot ALTER in a constraint, so alembic's batch mode copies the table.
# Giving it a naming convention is what lets it find these constraints by name
# on a backend that does not store them.
NAMING = {
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
}


def upgrade() -> None:
    # Unattributable under the new shape — see module docstring.
    op.execute(sa.text(f"DELETE FROM {TABLE}"))

    # Drop the old UNIQUE-on-client_id index BEFORE the table copy, or batch
    # mode faithfully recreates it and client_id stays wrongly unique.
    op.drop_index(IX_CLIENT, table_name=TABLE)

    with op.batch_alter_table(TABLE, naming_convention=NAMING) as batch:
        batch.add_column(sa.Column("psychic_id", sa.Integer(), nullable=False))
        batch.create_foreign_key(FK, "users", ["psychic_id"], ["id"])
        batch.create_unique_constraint(UQ, ["client_id", "psychic_id"])

    # client_id stays indexed for by-client lookups, just no longer unique.
    op.create_index(IX_CLIENT, TABLE, ["client_id"], unique=False)
    op.create_index(IX_PSYCHIC, TABLE, ["psychic_id"], unique=False)


def downgrade() -> None:
    # Going back to one-record-per-client cannot preserve per-reader rows: the
    # old shape allows only one row per client. Drop them rather than silently
    # collapsing two readers' memories into one document.
    op.execute(sa.text(f"DELETE FROM {TABLE}"))

    op.drop_index(IX_PSYCHIC, table_name=TABLE)
    op.drop_index(IX_CLIENT, table_name=TABLE)

    with op.batch_alter_table(TABLE, naming_convention=NAMING) as batch:
        batch.drop_constraint(UQ, type_="unique")
        # Dropping the column removes its foreign key with it.
        batch.drop_column("psychic_id")

    op.create_index(IX_CLIENT, TABLE, ["client_id"], unique=True)
