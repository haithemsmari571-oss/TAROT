"""add title to client_notes

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-07-05 00:00:00.000000

Dossier notes get a short title for the file-card view. Nullable — existing
notes auto-title from the first words of the body on the client.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "client_notes",
        sa.Column("title", sa.String(length=200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("client_notes", "title")
