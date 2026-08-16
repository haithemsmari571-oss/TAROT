"""The client's gender, stated by her rather than guessed by the reader.

Nothing in the product ever collected it, so the reading filled the gap with the likeliest
assumption — a woman asking about a man — and did it on the live site in front of the owner.

Additive and backfilled. Every existing row becomes NOT_STATED, which is the correct answer
for an account that was never asked: these are all test accounts, and nobody's gender is
being inferred from a name, a psychic's notes or anything else. NOT_STATED is a real answer
the client can also choose deliberately, and the reading prompt says it out loud rather than
leaving the line out, so the model is told not to assume instead of being left to.

Revision ID: d8e9f0a1b2c3
Revises: c7e8f9a0b1c2
Create Date: 2026-08-16
"""

from alembic import op
import sqlalchemy as sa

revision = "d8e9f0a1b2c3"
down_revision = "c7e8f9a0b1c2"
branch_labels = None
depends_on = None

GENDER_VALUES = ("WOMAN", "MAN", "OTHER", "NOT_STATED")


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Postgres needs the type to exist before a column can use it. create_type=False on
        # the column below stops SQLAlchemy trying to create it a second time.
        sa.Enum(*GENDER_VALUES, name="gender").create(bind, checkfirst=True)
        gender_type = sa.Enum(*GENDER_VALUES, name="gender", create_type=False)
    else:
        gender_type = sa.Enum(*GENDER_VALUES, name="gender")

    op.add_column(
        "users",
        sa.Column(
            "gender",
            gender_type,
            nullable=False,
            server_default="NOT_STATED",
        ),
    )
    # Explicit rather than implied. Every account that predates this column was never asked,
    # and "not stated" is the honest record of that.
    op.execute("UPDATE users SET gender = 'NOT_STATED' WHERE gender IS NULL")


def downgrade() -> None:
    op.drop_column("users", "gender")
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        sa.Enum(name="gender").drop(bind, checkfirst=True)
