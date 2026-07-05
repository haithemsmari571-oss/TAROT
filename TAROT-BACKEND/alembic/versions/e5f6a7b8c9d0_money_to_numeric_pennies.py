"""money columns to Numeric(10,2) — store pennies

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-05 00:00:00.000000

Per-minute prepaid billing charges the exact reader rate per minute (e.g.
Valentina £5.20/min). Whole-point (integer) money can't hold £5.20, so the
balance and ledger money columns move to NUMERIC(10,2) (pennies). Existing
whole-point values convert losslessly (15 -> 15.00). Reversible.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Balances
    op.alter_column(
        "users",
        "balance",
        type_=sa.Numeric(10, 2),
        existing_nullable=False,
        postgresql_using="balance::numeric(10,2)",
    )
    op.alter_column(
        "users",
        "credit_balance",
        type_=sa.Numeric(10, 2),
        existing_nullable=False,
        server_default="0",
        postgresql_using="credit_balance::numeric(10,2)",
    )

    # Ledger amounts
    for col in ("amount", "balance_before", "balance_after"):
        op.alter_column(
            "transactions",
            col,
            type_=sa.Numeric(10, 2),
            existing_nullable=False,
            postgresql_using=f"{col}::numeric(10,2)",
        )


def downgrade() -> None:
    # Round back to whole points on the way down (lossy for fractional pennies).
    for col in ("amount", "balance_before", "balance_after"):
        op.alter_column(
            "transactions",
            col,
            type_=sa.Integer(),
            existing_nullable=False,
            postgresql_using=f"round({col})::integer",
        )
    op.alter_column(
        "users",
        "credit_balance",
        type_=sa.Integer(),
        existing_nullable=False,
        server_default="0",
        postgresql_using="round(credit_balance)::integer",
    )
    op.alter_column(
        "users",
        "balance",
        type_=sa.Integer(),
        existing_nullable=False,
        postgresql_using="round(balance)::integer",
    )
