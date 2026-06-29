"""add_gift_enums

Revision ID: a1b2c3d4e5f6
Revises: dff106583c95
Create Date: 2026-06-29 11:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "dff106583c95"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Disable transaction so we can run ALTER TYPE ADD VALUE in Postgres
disable_transaction = True

def upgrade() -> None:
    # Use autocommit to alter enums in PostgreSQL without transaction block
    op.execute("ALTER TYPE notificationtype ADD VALUE 'GIFT_BALANCE_RECEIVED'")
    op.execute("ALTER TYPE transactiontype ADD VALUE 'GIFT'")


def downgrade() -> None:
    # Downgrade is not easily supported for removing enum values in Postgres, so we pass.
    pass
