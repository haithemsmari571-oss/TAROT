"""add missing updated_at to favorite_psychics

Revision ID: b0c1d2e3f4a5
Revises: f3a4b5c6d7e8
Create Date: 2026-07-09 00:00:00.000000

The declarative Base maps created_at AND updated_at onto every model, so the
ORM INSERT for FavoritePsychic references updated_at — but f3a4b5c6d7e8 never
created that column, making every insert 500 (UndefinedColumn). Adds it with
the same definition every other table uses.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b0c1d2e3f4a5"
down_revision: Union[str, Sequence[str], None] = "f3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "favorite_psychics",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("favorite_psychics", "updated_at")
