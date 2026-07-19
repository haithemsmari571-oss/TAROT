"""add client_record_mappings (tarot client -> CRM vault file, human-gated)

Revision ID: f4b5c6d7e8a9
Revises: e3f4a5b6c7d8
Create Date: 2026-07-19 00:00:00.000000

Auto-proposed links between a tarot client and one markdown file in the Second
Brain CRM's client-records vault (which this backend only ever READS). A row is
created PENDING by the matcher and must be human-CONFIRMED before the reading
pipeline will merge the vault file into Valentina's CLIENT FILE. REJECTED rows
are kept so the scanner never re-proposes a refused match. One row per client.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f4b5c6d7e8a9"
down_revision: Union[str, Sequence[str], None] = "e3f4a5b6c7d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "client_record_mappings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("vault_filename", sa.Text(), nullable=False),
        sa.Column("vault_client_uid", sa.Text(), nullable=False),
        sa.Column("vault_dob", sa.Date(), nullable=True),
        sa.Column("dob_tier", sa.Text(), server_default="none", nullable=False),
        sa.Column("match_method", sa.Text(), nullable=False),
        sa.Column("match_score", sa.Float(), server_default="0", nullable=False),
        sa.Column("status", sa.Text(), server_default="PENDING", nullable=False),
        sa.Column("reviewed_by", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_client_record_mappings_user_id"),
    )
    op.create_index(
        "ix_client_record_mappings_user_id",
        "client_record_mappings",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_client_record_mappings_user_id", table_name="client_record_mappings")
    op.drop_table("client_record_mappings")
