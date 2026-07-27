"""Track whether an ai_prompt row still follows the shipped default.

Before this column the DB row was authoritative from the first seed: once a key
had been seeded, a later edit to the prompt constant in code was silently
ignored forever, because get_prompt_text returned ai_prompts.prompt and
seed_prompts deliberately never overwrites it. The feature kept running the
ORIGINAL shipped text while the source said something else.

is_default = 1 means "still following the code default"; resolve_prompt_text
then serves default_prompt, which seed_prompts keeps in step with the constant.

BACKFILL IS DELIBERATELY CONSERVATIVE. Existing rows are marked as following the
default ONLY when prompt is byte-identical to default_prompt. Anything else is
treated as owner-edited (is_default = 0) and keeps serving exactly the text it
serves today. That direction matters: guessing wrong the other way would
silently replace a real owner edit with the shipped wording on the next read.
A row whose code default changed while it was never edited is therefore left
pinned; restore_default puts it back to tracking.

Revision ID: d5f6a7b8c9d0
Revises: c4e5f6a7b8c9
"""

from alembic import op
import sqlalchemy as sa

revision = "d5f6a7b8c9d0"
down_revision = "c4e5f6a7b8c9"
branch_labels = None
depends_on = None


def _has_ai_prompts() -> bool:
    # Some narrow migration tests stamp a late revision over a deliberately
    # minimal schema. Match the guard c4e5f6a7b8c9 already uses rather than
    # manufacturing the older registry on those unrelated upgrade paths.
    return "ai_prompts" in set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    if not _has_ai_prompts():
        return
    with op.batch_alter_table("ai_prompts") as batch:
        batch.add_column(
            sa.Column("is_default", sa.Integer(), nullable=False, server_default="1")
        )
    # Existing rows: only an exact match still counts as "following the default".
    op.execute(
        """
        UPDATE ai_prompts
           SET is_default = CASE WHEN prompt = default_prompt THEN 1 ELSE 0 END
        """
    )


def downgrade() -> None:
    if not _has_ai_prompts():
        return
    with op.batch_alter_table("ai_prompts") as batch:
        batch.drop_column("is_default")
