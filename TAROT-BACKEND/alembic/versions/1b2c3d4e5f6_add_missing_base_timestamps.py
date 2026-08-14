"""Add missing shared-Base timestamps to article support tables.

Revision ID: 1b2c3d4e5f6
Revises: 0a1b2c3d4e5f
"""

import logging

from alembic import op
import sqlalchemy as sa


revision = "1b2c3d4e5f6"
down_revision = "0a1b2c3d4e5f"
branch_labels = None
depends_on = None


logger = logging.getLogger('alembic.runtime.migration')


_TABLES = (
    "article_versions",
    "article_slug_redirects",
    "article_audit_events",
)


def _existing_tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    existing_tables = _existing_tables()
    for table_name in _TABLES:
        if table_name not in existing_tables:
            logger.warning(
                'Skipping updated_at upgrade for missing table %s',
                table_name,
            )
            continue
        op.add_column(
            table_name,
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
        )


def downgrade() -> None:
    existing_tables = _existing_tables()
    for table_name in reversed(_TABLES):
        if table_name not in existing_tables:
            logger.warning(
                'Skipping updated_at downgrade for missing table %s',
                table_name,
            )
            continue
        op.drop_column(table_name, "updated_at")
