"""Add missing shared-Base timestamps to article support tables.

Revision ID: 1b2c3d4e5f6
Revises: 0a1b2c3d4e5f
"""

from alembic import op
import sqlalchemy as sa


revision = "1b2c3d4e5f6"
down_revision = "0a1b2c3d4e5f"
branch_labels = None
depends_on = None


_TABLES = (
    "article_versions",
    "article_slug_redirects",
    "article_audit_events",
)


def upgrade() -> None:
    for table_name in _TABLES:
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
    for table_name in reversed(_TABLES):
        op.drop_column(table_name, "updated_at")
