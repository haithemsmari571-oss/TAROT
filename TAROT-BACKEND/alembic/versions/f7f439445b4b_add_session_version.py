"""Session version: ends every other sign-in when the password changes (ROUND66).

users.session_version is copied into every refresh token. A password change or
reset adds one, and /refresh-token refuses a token whose copy differs. Every
existing row gets 0, which is also what a refresh token made before this
column counts as, so nobody signed in now is signed out by it. Dropping the
column is the way back.

Revision ID: f7f439445b4b
Revises: e7a1c4b9d2f6
"""

from alembic import op
import sqlalchemy as sa


revision = "f7f439445b4b"
down_revision = "e7a1c4b9d2f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("session_version", sa.Integer(), nullable=False, server_default="0")
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("session_version")
