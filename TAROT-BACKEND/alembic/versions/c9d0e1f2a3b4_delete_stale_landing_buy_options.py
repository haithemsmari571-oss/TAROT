"""delete stale services landing_content + buy_options rows

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-07-05 00:00:00.000000

Physically remove junk data that nothing reads anymore:
- the orphaned "services" landing_content row (the Services editor tab was
  removed in Pass 4 (8/n); nothing on the live home ever rendered it), and
- every buy_options row (the table was retired in Pass 4 (5/n) and merely
  archived; the live checkout uses the Stardust Glider, never buy_options).

Data-only and idempotent. The buy_options TABLE is kept (the model and earlier
migrations reference it) — only its rows are removed. No foreign keys reference
buy_options, so deleting the rows is safe.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, Sequence[str], None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DELETE FROM landing_content WHERE section = 'services'")
    op.execute("DELETE FROM buy_options")


def downgrade() -> None:
    # One-way cleanup: the removed rows were stale junk, not restored on downgrade.
    pass
