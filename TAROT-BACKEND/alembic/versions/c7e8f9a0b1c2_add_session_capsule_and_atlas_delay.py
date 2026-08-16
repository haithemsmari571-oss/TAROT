"""Session capsule memory, and a delay before the Atlas end-of-session summary.

Three additive columns, all backfilled so existing rows behave exactly as they did before:

* reading_session_states.capsule_narrative / capsule_folded_upto — the running summary of
  the part of a live reading that has scrolled out of the verbatim window, and how far
  along the transcript it has consumed. Both persist, so a restart mid-reading resumes with
  its memory rather than beginning the second hour knowing only the last twenty messages.
  Existing rows backfill to an empty summary that has folded nothing, which is exactly the
  state a reading in progress is in before its first fold.

* atlas_client_memory_jobs.not_before — the earliest a finished session may be folded into
  the client's long-term memory. It used to run the moment the session ended, so a client
  who came straight back had the reading she had just had summarised out from under her
  while she was already in the next one. Existing rows backfill to created_at, i.e. eligible
  immediately, so nothing already queued is delayed by this deploy.

Revision ID: c7e8f9a0b1c2
Revises: a1c2e3f4b5d6
Create Date: 2026-08-16
"""

from alembic import op
import sqlalchemy as sa

revision = "c7e8f9a0b1c2"
down_revision = "a1c2e3f4b5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "reading_session_states",
        sa.Column(
            "capsule_narrative", sa.Text(), nullable=False, server_default=sa.text("''")
        ),
    )
    op.add_column(
        "reading_session_states",
        sa.Column(
            "capsule_folded_upto", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
    )
    op.add_column(
        "atlas_client_memory_jobs",
        sa.Column("not_before", sa.DateTime(timezone=True), nullable=True),
    )
    # Backfill: anything already queued stays immediately eligible. A NULL not_before is
    # also treated as eligible by the sweep, so this is belt and braces rather than load
    # bearing — but an explicit value is easier to read in the table than an absence.
    op.execute(
        "UPDATE atlas_client_memory_jobs SET not_before = created_at WHERE not_before IS NULL"
    )


def downgrade() -> None:
    op.drop_column("atlas_client_memory_jobs", "not_before")
    op.drop_column("reading_session_states", "capsule_folded_upto")
    op.drop_column("reading_session_states", "capsule_narrative")
