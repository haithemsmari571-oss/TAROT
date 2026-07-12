"""add AI reading pipeline (author_type, response_mode, note source, ai_drafts)

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
Create Date: 2026-07-12 00:00:00.000000

Schema for the Valentina/Sabri/Atlas pipeline:
  - messages.author_type  (how a message was produced; backfilled HUMAN_PSYCHIC)
  - chats.response_mode    (human | hybrid | sabri; backfilled/default SABRI)
  - client_notes.source    (human | ai_atlas; backfilled HUMAN — Atlas notes)
  - ai_drafts table        (drafts awaiting admin review)

BACK UP FIRST (per migration hygiene). On the prod VPS, before deploying:
    docker exec tarot-postgres pg_dump -U tarot tarot > /root/backup_pre_ai_pipeline.sql
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, Sequence[str], None] = "b0c1d2e3f4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Enum type objects (created explicitly so column adds can reference them).
author_type = sa.Enum(
    "HUMAN_PSYCHIC", "AI_DRAFTED", "ADMIN", "SYSTEM", name="authortype"
)
response_mode = sa.Enum("HUMAN", "HYBRID", "SABRI", name="responsemode")
note_source = sa.Enum("HUMAN", "AI_ATLAS", name="notesource")
ai_draft_status = sa.Enum("PENDING", "SENT", "DISCARDED", name="aidraftstatus")


def upgrade() -> None:
    bind = op.get_bind()
    author_type.create(bind, checkfirst=True)
    response_mode.create(bind, checkfirst=True)
    note_source.create(bind, checkfirst=True)
    ai_draft_status.create(bind, checkfirst=True)

    # messages.author_type — backfill every existing row to HUMAN_PSYCHIC.
    op.add_column(
        "messages",
        sa.Column(
            "author_type",
            postgresql.ENUM(name="authortype", create_type=False),
            nullable=True,
        ),
    )
    op.execute("UPDATE messages SET author_type = 'HUMAN_PSYCHIC'")
    op.alter_column("messages", "author_type", nullable=False)

    # chats.response_mode — default/backfill SABRI.
    op.add_column(
        "chats",
        sa.Column(
            "response_mode",
            postgresql.ENUM(name="responsemode", create_type=False),
            nullable=True,
        ),
    )
    op.execute("UPDATE chats SET response_mode = 'SABRI'")
    op.alter_column("chats", "response_mode", nullable=False)

    # client_notes.source — backfill existing notes to HUMAN.
    op.add_column(
        "client_notes",
        sa.Column(
            "source",
            postgresql.ENUM(name="notesource", create_type=False),
            nullable=True,
        ),
    )
    op.execute("UPDATE client_notes SET source = 'HUMAN'")
    op.alter_column("client_notes", "source", nullable=False)

    # ai_drafts — drafts awaiting admin review.
    op.create_table(
        "ai_drafts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "chat_id",
            sa.Integer(),
            sa.ForeignKey("chats.id"),
            nullable=False,
        ),
        sa.Column(
            "client_message_id",
            sa.Integer(),
            sa.ForeignKey("messages.id"),
            nullable=True,
        ),
        sa.Column(
            "mode",
            postgresql.ENUM(name="responsemode", create_type=False),
            nullable=False,
        ),
        sa.Column("draft_text", sa.Text(), nullable=False),
        sa.Column("sabri_flags", sa.Text(), nullable=True),
        sa.Column(
            "sabri_passed", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "status",
            postgresql.ENUM(name="aidraftstatus", create_type=False),
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_ai_drafts_chat_id", "ai_drafts", ["chat_id"])
    op.create_index("ix_ai_drafts_status", "ai_drafts", ["status"])


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_index("ix_ai_drafts_status", table_name="ai_drafts")
    op.drop_index("ix_ai_drafts_chat_id", table_name="ai_drafts")
    op.drop_table("ai_drafts")
    op.drop_column("client_notes", "source")
    op.drop_column("chats", "response_mode")
    op.drop_column("messages", "author_type")
    ai_draft_status.drop(bind, checkfirst=True)
    note_source.drop(bind, checkfirst=True)
    response_mode.drop(bind, checkfirst=True)
    author_type.drop(bind, checkfirst=True)
