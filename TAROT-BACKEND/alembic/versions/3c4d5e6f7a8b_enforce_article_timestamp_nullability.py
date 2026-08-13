"""Enforce the shared non-null timestamp contract on article tables.

Revision ID: 3c4d5e6f7a8b
Revises: 2b3c4d5e6f7a
"""

from alembic import op
import sqlalchemy as sa


revision = "3c4d5e6f7a8b"
down_revision = "2b3c4d5e6f7a"
branch_labels = None
depends_on = None


_COLUMNS = (
    ("articles", "created_at"),
    ("articles", "updated_at"),
    ("article_versions", "created_at"),
    ("article_slug_redirects", "created_at"),
    ("article_audit_events", "created_at"),
)


def upgrade() -> None:
    for table_name, column_name in _COLUMNS:
        op.execute(
            sa.text(
                f'UPDATE "{table_name}" SET "{column_name}" = CURRENT_TIMESTAMP '
                f'WHERE "{column_name}" IS NULL'
            )
        )
        op.alter_column(
            table_name,
            column_name,
            existing_type=sa.DateTime(timezone=True),
            nullable=False,
        )


def downgrade() -> None:
    for table_name, column_name in reversed(_COLUMNS):
        op.alter_column(
            table_name,
            column_name,
            existing_type=sa.DateTime(timezone=True),
            nullable=True,
        )
