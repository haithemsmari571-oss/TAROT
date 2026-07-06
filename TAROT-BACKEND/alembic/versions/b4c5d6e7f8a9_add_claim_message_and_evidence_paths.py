"""add message and evidence_paths to claims

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-07-06 02:00:00.000000

Richer claim submission: an optional short client message and up to 4 images
(stored as a JSON list of paths). Additive columns only; existing single-image
claims keep working via ``evidence_path`` (the first image).
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b4c5d6e7f8a9"
down_revision: Union[str, Sequence[str], None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("claims", sa.Column("evidence_paths", sa.JSON(), nullable=True))
    op.add_column("claims", sa.Column("message", sa.String(300), nullable=True))


def downgrade() -> None:
    op.drop_column("claims", "message")
    op.drop_column("claims", "evidence_paths")
