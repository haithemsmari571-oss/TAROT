"""seed real launch tasks; remove the fdsaaa test task

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-07-06 03:30:00.000000

Seeds the three social screenshot tasks that genuinely work today, and removes
the leftover "fdsaaa" test task. Idempotent (inserts only when the titled task
is missing) so it's safe on a fresh DB and on the live one.
"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d6e7f8a9b0c1"
down_revision: Union[str, Sequence[str], None] = "c5d6e7f8a9b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

LAUNCH_TASKS = [
    # (title, description, icon, reward, frequency)
    (
        "Share your daily card to your story, tag @askvalentina",
        "Screenshot your story with @askvalentina tagged, then upload it here.",
        "📸", 5, "ONCE_PER_DAY",
    ),
    (
        "Share or repost our latest post",
        "Repost our latest post to your feed or story, then upload a screenshot.",
        "🔁", 3, "ONCE_PER_WINDOW",
    ),
    (
        "Like + comment on our latest post",
        "Like and leave a comment on our latest post, then upload a screenshot.",
        "💬", 1, "ONCE_PER_WINDOW",
    ),
]


def upgrade() -> None:
    # Remove the leftover test task ("share" / "fds…") and any claims on it.
    op.execute(
        "DELETE FROM claims WHERE task_id IN "
        "(SELECT id FROM tasks WHERE title = 'share' AND description LIKE 'fds%')"
    )
    op.execute(
        "DELETE FROM tasks WHERE title = 'share' AND description LIKE 'fds%'"
    )

    insert = sa.text(
        """
        INSERT INTO tasks
            (title, description, icon, reward, verification_type, trigger_event,
             frequency, status, rotation_weight, created_at, updated_at)
        SELECT :title, :descr, :icon, :reward,
               'SCREENSHOT'::verificationtype, NULL,
               CAST(:freq AS taskfrequency), 'ACTIVE'::taskstatus, 1, now(), now()
        WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = :title)
        """
    )
    for title, descr, icon, reward, freq in LAUNCH_TASKS:
        op.execute(
            insert.bindparams(
                title=title, descr=descr, icon=icon, reward=reward, freq=freq
            )
        )


def downgrade() -> None:
    for title, *_ in LAUNCH_TASKS:
        op.execute(sa.text("DELETE FROM tasks WHERE title = :title").bindparams(title=title))
