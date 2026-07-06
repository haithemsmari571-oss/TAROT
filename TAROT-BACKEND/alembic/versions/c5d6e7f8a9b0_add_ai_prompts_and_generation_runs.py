"""add ai_prompts, ai_prompt_versions and content_generation_runs

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-07-06 03:00:00.000000

The AI Prompt Registry (every AI prompt stored + admin-editable, with version
history) and the nightly content-engine run log. Additive only.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c5d6e7f8a9b0"
down_revision: Union[str, Sequence[str], None] = "b4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _timestamps():
    return (
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def upgrade() -> None:
    op.create_table(
        "ai_prompts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("key", sa.String(64), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("model", sa.String(64), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("default_prompt", sa.Text(), nullable=False),
        sa.Column("variables", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(16), server_default="ACTIVE", nullable=False),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_run_status", sa.String(255), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key", name="uq_ai_prompts_key"),
    )

    op.create_table(
        "ai_prompt_versions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("prompt_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        *_timestamps(),
        sa.ForeignKeyConstraint(["prompt_id"], ["ai_prompts.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_prompt_versions_prompt_id", "ai_prompt_versions", ["prompt_id"])

    op.create_table(
        "content_generation_runs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("content_date", sa.Date(), nullable=False),
        sa.Column("trigger", sa.String(16), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("signs_ok", sa.JSON(), nullable=True),
        sa.Column("signs_failed", sa.JSON(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("output_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("cost_usd", sa.Numeric(10, 4), server_default="0", nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_content_generation_runs_content_date", "content_generation_runs", ["content_date"])


def downgrade() -> None:
    op.drop_index("ix_content_generation_runs_content_date", table_name="content_generation_runs")
    op.drop_table("content_generation_runs")
    op.drop_index("ix_ai_prompt_versions_prompt_id", table_name="ai_prompt_versions")
    op.drop_table("ai_prompt_versions")
    op.drop_table("ai_prompts")
