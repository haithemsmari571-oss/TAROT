"""Reflection — the two columns a reading keeps across a refresh and a restart.

A customer in a reading can pause to sit with what she said: the meter and the
charge stop, the reader keeps writing, and what she wrote is held until the
customer returns. The server is the authority for that state, so it has to
survive both a hard refresh of her browser and a restart of the backend:

  reflection_seconds_used  every reflection in this reading, added up on each
                           return — the closing card's "N minutes of reflection,
                           never charged"
  reflecting_since         set while a reflection is in progress, NULL otherwise —
                           a restart reads it back and keeps the meter frozen
                           instead of re-billing the reflected time

Per ChatSession, not per Chat: one ChatSession is one reading and the card is
drawn per reading; "read with her again" starts a new one. Additive, with a
server default, so every existing reading reads as "no reflection", which is
true. No enum is touched.

Revision ID: d1e2f3a4b5c6
Revises: f1a2b3c4d5e6
Create Date: 2026-08-22
"""

from alembic import op
import sqlalchemy as sa

revision = "d1e2f3a4b5c6"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chat_sessions",
        sa.Column(
            "reflection_seconds_used",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "chat_sessions",
        sa.Column("reflecting_since", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("chat_sessions", "reflecting_since")
    op.drop_column("chat_sessions", "reflection_seconds_used")
