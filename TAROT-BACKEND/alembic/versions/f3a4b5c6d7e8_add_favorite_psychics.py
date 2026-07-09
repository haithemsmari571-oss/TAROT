"""add favorite_psychics (client's favourited readers)

Revision ID: f3a4b5c6d7e8
Revises: a8b9c0d1e2f3
Create Date: 2026-07-09 00:00:00.000000

One row per (user, psychic) pair, unique together so re-adding is a no-op.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f3a4b5c6d7e8"
down_revision: Union[str, Sequence[str], None] = "a8b9c0d1e2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "favorite_psychics",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("psychic_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["psychic_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "psychic_id", name="uq_favorite_user_psychic"
        ),
    )
    op.create_index(
        "ix_favorite_psychics_user_id", "favorite_psychics", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_favorite_psychics_user_id", table_name="favorite_psychics")
    op.drop_table("favorite_psychics")
