"""Verification and password-reset links, kept in the database.

The links used to live only in the backend process's memory (app/cache.py), so
every restart or deploy voided every open link. auth_link_tokens holds one row
per emailed link: whose it is, what it does (verify_account or
reset_password), the sha256 of its token (never the token itself), when it
expires and when it was used. No existing row changes; links sent before this
revision were in memory and are gone with the old process either way.

Revision ID: 5e0f6599a623
Revises: cf5bb573a7bf
"""

from alembic import op
import sqlalchemy as sa


revision = "5e0f6599a623"
down_revision = "cf5bb573a7bf"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auth_link_tokens",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("purpose", sa.String(length=24), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "purpose IN ('verify_account', 'reset_password')",
            name="ck_auth_link_tokens_purpose",
        ),
        sa.UniqueConstraint("token_hash", name="uq_auth_link_tokens_token_hash"),
    )
    op.create_index("ix_auth_link_tokens_user_id", "auth_link_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_auth_link_tokens_user_id", table_name="auth_link_tokens")
    op.drop_table("auth_link_tokens")
