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
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    columns = {
        table_name: {column["name"] for column in inspector.get_columns(table_name)}
        for table_name in tables
    }
    for table_name, column_name in _COLUMNS:
        if table_name not in tables or column_name not in columns[table_name]:
            continue
        op.execute(
            sa.text(
                f'UPDATE "{table_name}" SET "{column_name}" = CURRENT_TIMESTAMP '
                f'WHERE "{column_name}" IS NULL'
            )
        )
        if bind.dialect.name == "sqlite":
            with op.batch_alter_table(table_name) as batch_op:
                batch_op.alter_column(
                    column_name,
                    existing_type=sa.DateTime(timezone=True),
                    nullable=False,
                )
        else:
            op.alter_column(
                table_name,
                column_name,
                existing_type=sa.DateTime(timezone=True),
                nullable=False,
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    columns = {
        table_name: {column["name"] for column in inspector.get_columns(table_name)}
        for table_name in tables
    }
    for table_name, column_name in reversed(_COLUMNS):
        if table_name not in tables or column_name not in columns[table_name]:
            continue
        if bind.dialect.name == "sqlite":
            with op.batch_alter_table(table_name) as batch_op:
                batch_op.alter_column(
                    column_name,
                    existing_type=sa.DateTime(timezone=True),
                    nullable=True,
                )
        else:
            op.alter_column(
                table_name,
                column_name,
                existing_type=sa.DateTime(timezone=True),
                nullable=True,
            )
