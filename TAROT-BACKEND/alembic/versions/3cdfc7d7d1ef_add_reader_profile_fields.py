"""Add a reader's profile fields to users (ROUND54).

Ethnicity (shown to clients only with her consent), years reading, zodiac sign
and the languages she speaks. Five nullable columns on users, with no server default, so adding them writes
nothing into any existing row: every reader made before this keeps them empty
until the owner fills them in from the phone. Dropping them is the way back.

Revision ID: 3cdfc7d7d1ef
Revises: 1e859de0e75c
"""

from alembic import op
import sqlalchemy as sa


revision = "3cdfc7d7d1ef"
down_revision = "1e859de0e75c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("ethnicity", sa.String(60), nullable=True))
        batch_op.add_column(sa.Column("show_ethnicity", sa.Boolean(), nullable=True))
        batch_op.add_column(sa.Column("years_experience", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("zodiac_sign", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("languages", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("languages")
        batch_op.drop_column("zodiac_sign")
        batch_op.drop_column("years_experience")
        batch_op.drop_column("show_ethnicity")
        batch_op.drop_column("ethnicity")
