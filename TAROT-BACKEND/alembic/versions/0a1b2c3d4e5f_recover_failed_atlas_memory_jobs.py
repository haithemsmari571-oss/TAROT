"""Recover terminal Atlas memory summaries with bounded backoff.

Revision ID: 0a1b2c3d4e5f
Revises: f8a9b0c1d2e3
"""

from alembic import op
import sqlalchemy as sa


revision = "0a1b2c3d4e5f"
down_revision = "f8a9b0c1d2e3"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    # The parent migration deliberately skips this table for narrow migration
    # tests stamped over a minimal schema. Preserve that compatibility boundary
    # instead of trying to alter a table that the parent did not create.
    if "atlas_client_memory_jobs" not in _tables():
        return
    op.add_column(
        "atlas_client_memory_jobs",
        sa.Column("recovery_cycles", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "atlas_client_memory_jobs",
        sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        "ck_atlas_memory_job_recovery_cycles",
        "atlas_client_memory_jobs",
        "recovery_cycles >= 0 AND recovery_cycles <= 3",
    )
    op.create_index(
        "ix_atlas_memory_jobs_failed_retry",
        "atlas_client_memory_jobs",
        ["status", "next_retry_at", "recovery_cycles"],
    )


def downgrade() -> None:
    if "atlas_client_memory_jobs" not in _tables():
        return
    op.drop_index("ix_atlas_memory_jobs_failed_retry", table_name="atlas_client_memory_jobs")
    op.drop_constraint(
        "ck_atlas_memory_job_recovery_cycles",
        "atlas_client_memory_jobs",
        type_="check",
    )
    op.drop_column("atlas_client_memory_jobs", "next_retry_at")
    op.drop_column("atlas_client_memory_jobs", "recovery_cycles")
