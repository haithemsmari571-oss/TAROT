"""add psychic_onboarding_drafts (bulk onboarding staging table)

Staging table for create-first-then-review bulk psychic onboarding. Rows are
parsed from an uploaded manifest + images, reviewed/edited by the operator, and
only turned into real PSYCHIC accounts on explicit confirm.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "b5d7f9a1c3e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "psychic_onboarding_drafts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("batch_id", sa.String(), nullable=False),
        sa.Column("row_index", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("error_reason", sa.Text(), nullable=True),
        sa.Column("display_name", sa.String(), nullable=True),
        sa.Column("price_per_minute", sa.Numeric(10, 2, asdecimal=False), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("categories_csv", sa.Text(), nullable=True),
        sa.Column("username", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("image_filename", sa.String(), nullable=True),
        sa.Column("profile_picture_path", sa.String(), nullable=True),
        sa.Column("created_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_psychic_onboarding_drafts_batch_id",
        "psychic_onboarding_drafts",
        ["batch_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_psychic_onboarding_drafts_batch_id", table_name="psychic_onboarding_drafts")
    op.drop_table("psychic_onboarding_drafts")
