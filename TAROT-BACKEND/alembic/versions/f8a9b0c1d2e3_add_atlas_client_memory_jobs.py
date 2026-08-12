"""Add durable post-session Atlas client-memory jobs.

Revision ID: f8a9b0c1d2e3
Revises: e6a7b8c9d0e1
"""

from alembic import op
import sqlalchemy as sa


revision = "f8a9b0c1d2e3"
down_revision = "e6a7b8c9d0e1"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    tables = _tables()
    if "chat_sessions" not in tables or "atlas_client_memory_jobs" in tables:
        return
    op.create_table(
        "atlas_client_memory_jobs",
        sa.Column(
            "chat_session_id",
            sa.Integer(),
            sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="PENDING"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("processing_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_code", sa.String(length=120), nullable=True),
        sa.Column("atlas_version_number", sa.Integer(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("cost_usd", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "status IN ('PENDING', 'PROCESSING', 'RETRY_PENDING', 'COMPLETED', 'FAILED')",
            name="ck_atlas_memory_job_status",
        ),
        sa.CheckConstraint(
            "attempts >= 0 AND attempts <= 2",
            name="ck_atlas_memory_job_attempts",
        ),
    )
    op.create_index(
        "ix_atlas_memory_jobs_sweep",
        "atlas_client_memory_jobs",
        ["status", "processing_started_at", "created_at"],
    )


def downgrade() -> None:
    if "atlas_client_memory_jobs" not in _tables():
        return
    op.drop_index("ix_atlas_memory_jobs_sweep", table_name="atlas_client_memory_jobs")
    op.drop_table("atlas_client_memory_jobs")
