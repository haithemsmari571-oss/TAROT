"""Record which model an AI prompt run actually used.

The Prompts screen reports when a prompt last ran and how it went; without this
column it could only show the model configured now, which is not necessarily the
one the recorded run used. Additive and nullable: existing rows keep their
history and nothing reads it until a run writes it.

Revision ID: a1c2e3f4b5d6
Revises: 4d5e6f7a8b9c
Create Date: 2026-08-15
"""

from alembic import op
import sqlalchemy as sa

revision = "a1c2e3f4b5d6"
down_revision = "4d5e6f7a8b9c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_prompts", sa.Column("last_run_model", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("ai_prompts", "last_run_model")
