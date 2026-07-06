"""add CLAIM_APPROVED and CLAIM_REJECTED notification types

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-07-06 01:00:00.000000

Notify the client when a screenshot/handle ritual claim is approved or rejected
(Step 7). Additive enum values only — mirrors the add_gift_enums pattern.
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3b4c5d6e7f8"
down_revision: Union[str, Sequence[str], None] = "f2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'CLAIM_APPROVED'")
    op.execute("ALTER TYPE notificationtype ADD VALUE IF NOT EXISTS 'CLAIM_REJECTED'")


def downgrade() -> None:
    # Postgres cannot easily drop enum values; leaving them is harmless.
    pass
