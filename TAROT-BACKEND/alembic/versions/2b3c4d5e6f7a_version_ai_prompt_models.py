"""Version AI prompt model selections.

Revision ID: 2b3c4d5e6f7a
Revises: 1a2b3c4d5e6f
"""

from alembic import op
import sqlalchemy as sa


revision = "2b3c4d5e6f7a"
down_revision = "1a2b3c4d5e6f"
branch_labels = None
depends_on = None


def _has_prompt_tables() -> bool:
    return {"ai_prompts", "ai_prompt_versions"}.issubset(
        set(sa.inspect(op.get_bind()).get_table_names())
    )


def upgrade() -> None:
    if not _has_prompt_tables():
        return
    with op.batch_alter_table("ai_prompts") as batch:
        batch.add_column(sa.Column("default_model", sa.String(64), nullable=True))
    op.execute("UPDATE ai_prompts SET default_model = model WHERE default_model IS NULL")
    with op.batch_alter_table("ai_prompts") as batch:
        batch.alter_column("default_model", existing_type=sa.String(64), nullable=False)

    with op.batch_alter_table("ai_prompt_versions") as batch:
        batch.add_column(sa.Column("model", sa.String(64), nullable=True))
    op.execute(
        "UPDATE ai_prompt_versions SET model = ("
        "SELECT ai_prompts.model FROM ai_prompts "
        "WHERE ai_prompts.id = ai_prompt_versions.prompt_id"
        ") WHERE model IS NULL"
    )
    with op.batch_alter_table("ai_prompt_versions") as batch:
        batch.alter_column("model", existing_type=sa.String(64), nullable=False)


def downgrade() -> None:
    if not _has_prompt_tables():
        return
    with op.batch_alter_table("ai_prompt_versions") as batch:
        batch.drop_column("model")
    with op.batch_alter_table("ai_prompts") as batch:
        batch.drop_column("default_model")
