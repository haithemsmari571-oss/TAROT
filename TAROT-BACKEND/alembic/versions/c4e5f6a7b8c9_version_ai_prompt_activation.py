"""add explicit AI prompt drafts, activation metadata and output contracts

Revision ID: c4e5f6a7b8c9
Revises: b3c4d5e6f7a8
Create Date: 2026-07-26 12:00:00.000000

Additive evolution of the existing registry. Existing prompt text remains live.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "c4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "b3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    # Some narrow migration tests stamp a late revision over a deliberately
    # minimal schema. Do not make those unrelated upgrade paths manufacture the
    # entire older registry; a real database at this revision already has it.
    if not {"ai_prompts", "ai_prompt_versions"}.issubset(tables):
        return

    with op.batch_alter_table("ai_prompts") as batch:
        batch.add_column(sa.Column("output_schema", sa.JSON(), nullable=True))
        batch.add_column(
            sa.Column("output_schema_version", sa.String(64), nullable=True)
        )
        batch.add_column(
            sa.Column(
                "classification",
                sa.String(32),
                server_default="PROTECTED",
                nullable=False,
            )
        )
        batch.add_column(
            sa.Column(
                "active_version",
                sa.Integer(),
                server_default="1",
                nullable=False,
            )
        )
        batch.add_column(sa.Column("draft_version", sa.Integer(), nullable=True))

    with op.batch_alter_table("ai_prompt_versions") as batch:
        batch.add_column(sa.Column("version", sa.Integer(), nullable=True))
        batch.add_column(
            sa.Column(
                "state",
                sa.String(16),
                server_default="SUPERSEDED",
                nullable=False,
            )
        )
        batch.add_column(
            sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True)
        )

    version_rows = bind.execute(
        sa.text(
            "SELECT id, prompt_id FROM ai_prompt_versions "
            "ORDER BY prompt_id, id"
        )
    ).mappings()
    counters: dict[int, int] = {}
    for row in version_rows:
        prompt_id = int(row["prompt_id"])
        counters[prompt_id] = counters.get(prompt_id, 0) + 1
        bind.execute(
            sa.text(
                "UPDATE ai_prompt_versions SET version = :version WHERE id = :id"
            ),
            {"version": counters[prompt_id], "id": row["id"]},
        )

    for prompt_id, active_version in counters.items():
        bind.execute(
            sa.text(
                "UPDATE ai_prompts SET active_version = :version WHERE id = :id"
            ),
            {"version": active_version, "id": prompt_id},
        )
        bind.execute(
            sa.text(
                "UPDATE ai_prompt_versions "
                "SET state = 'ACTIVE', activated_at = CURRENT_TIMESTAMP "
                "WHERE prompt_id = :prompt_id AND version = :version"
            ),
            {"prompt_id": prompt_id, "version": active_version},
        )

    with op.batch_alter_table("ai_prompt_versions") as batch:
        batch.alter_column("version", existing_type=sa.Integer(), nullable=False)
        batch.create_unique_constraint(
            "uq_ai_prompt_versions_prompt_version",
            ["prompt_id", "version"],
        )


def downgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if not {"ai_prompts", "ai_prompt_versions"}.issubset(tables):
        return

    with op.batch_alter_table("ai_prompt_versions") as batch:
        batch.drop_constraint(
            "uq_ai_prompt_versions_prompt_version", type_="unique"
        )
        batch.drop_column("activated_at")
        batch.drop_column("state")
        batch.drop_column("version")
    with op.batch_alter_table("ai_prompts") as batch:
        batch.drop_column("draft_version")
        batch.drop_column("active_version")
        batch.drop_column("classification")
        batch.drop_column("output_schema_version")
        batch.drop_column("output_schema")
