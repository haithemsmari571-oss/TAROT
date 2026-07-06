"""add EARN and EXPIRE transaction types

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-07-05 22:00:00.000000

Gamification earned-Stardust ledger needs two new transaction types:
  EARN   — earned Stardust credited from a completed task/claim
  EXPIRE — earned Stardust forfeited 30 days after it was credited

Additive only. Existing rows and balances are untouched; every balance that
existed before this feature stays "purchased" (no expiry, no cap). Kept in its
own migration (mirroring add_gift_enums) so the enum change is isolated from the
table creation that follows.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d0e1f2a3b4c5"
down_revision: Union[str, Sequence[str], None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres 12+ allows ALTER TYPE ... ADD VALUE inside a transaction as long
    # as the new value isn't used in the same transaction (it isn't here).
    # IF NOT EXISTS makes the migration safe to re-run.
    op.execute("ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'EARN'")
    op.execute("ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'EXPIRE'")


def downgrade() -> None:
    # Postgres cannot easily drop enum values; leaving them is harmless.
    pass
