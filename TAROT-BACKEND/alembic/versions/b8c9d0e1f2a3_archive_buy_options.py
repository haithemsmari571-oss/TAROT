"""archive legacy buy_options rows

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-07-05 00:00:00.000000

The buy_options table is retired. The live checkout uses the Stardust Glider
tiers (app/services/stardust.py), never buy_options, and the admin page now
shows those live tiers read-only. Deactivate every remaining buy_options row so
nothing surfaces the stale/duplicate packages. Data-only, idempotent — the
table is kept for history.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, Sequence[str], None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE buy_options SET is_active = false WHERE is_active = true")


def downgrade() -> None:
    # One-way archival: we don't resurrect the stale packages on downgrade.
    pass
