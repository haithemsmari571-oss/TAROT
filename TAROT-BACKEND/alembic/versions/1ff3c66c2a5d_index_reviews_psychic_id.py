"""Index reviews by reader.

The reader's page lists her approved reviews and sums them by psychic_id
(services/reviews.py). The one-review-per-reader pair leads with user_id, so
until now those reads scanned the table.

Revision ID: 1ff3c66c2a5d
Revises: 55f95ef6d418
"""

from alembic import op


revision = "1ff3c66c2a5d"
down_revision = "55f95ef6d418"
branch_labels = None
depends_on = None


INDEX_NAME = "ix_reviews_psychic_id"


def upgrade() -> None:
    op.create_index(INDEX_NAME, "reviews", ["psychic_id"], unique=False)


def downgrade() -> None:
    op.drop_index(INDEX_NAME, table_name="reviews")
