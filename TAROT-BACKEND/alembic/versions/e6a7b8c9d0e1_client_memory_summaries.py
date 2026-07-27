"""One rolling memory summary per (client, psychic).

Replaces the pile of per-session AI_ATLAS notes with a single document that is
merged forward each session. Carries the watermark the merge resumes from, and
a cleared_at floor so a purge cannot be undone by the next session sweeping the
pre-deletion transcript back in.

Revision ID: e6a7b8c9d0e1
Revises: d5f6a7b8c9d0
"""

from alembic import op
import sqlalchemy as sa

revision = "e6a7b8c9d0e1"
down_revision = "d5f6a7b8c9d0"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    tables = _tables()
    # Narrow migration tests stamp a late revision over a minimal schema; do not
    # manufacture the users table on those paths (same guard as c4e5f6a7b8c9).
    if "users" not in tables or "client_memory_summaries" in tables:
        return
    op.create_table(
        "client_memory_summaries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("psychic_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("covers_through", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cleared_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("client_id", "psychic_id", name="uq_client_memory_client_psychic"),
    )
    op.create_index("ix_client_memory_client", "client_memory_summaries", ["client_id"])
    op.create_index("ix_client_memory_psychic", "client_memory_summaries", ["psychic_id"])


def downgrade() -> None:
    if "client_memory_summaries" not in _tables():
        return
    op.drop_index("ix_client_memory_psychic", table_name="client_memory_summaries")
    op.drop_index("ix_client_memory_client", table_name="client_memory_summaries")
    op.drop_table("client_memory_summaries")
