"""Let library items carry a video file instead of an audio file.

Revision ID: f0a1b2c3d4e5
Revises: d9e0f1a2b3c4
"""

from alembic import op
import sqlalchemy as sa


revision = "f0a1b2c3d4e5"
down_revision = "d9e0f1a2b3c4"
branch_labels = None
depends_on = None


_AUDIO_COLUMNS = (
    ("audio_file_path", sa.String(length=255)),
    ("audio_content_type", sa.String(length=32)),
    ("audio_size_bytes", sa.Integer()),
    ("audio_sha256", sa.String(length=64)),
)


def upgrade() -> None:
    with op.batch_alter_table("library_items") as batch_op:
        batch_op.add_column(sa.Column("video_file_path", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("video_content_type", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("video_size_bytes", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("video_sha256", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("video_width", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("video_height", sa.Integer(), nullable=True))
        for name, column_type in _AUDIO_COLUMNS:
            batch_op.alter_column(name, existing_type=column_type, nullable=True)
        batch_op.create_unique_constraint("uq_library_items_video_file_path", ["video_file_path"])
        batch_op.create_check_constraint(
            "ck_library_items_one_media",
            "(audio_file_path IS NULL) <> (video_file_path IS NULL)",
        )
        batch_op.create_check_constraint(
            "ck_library_items_video_metadata_paired",
            "(video_file_path IS NULL AND video_content_type IS NULL "
            "AND video_size_bytes IS NULL AND video_sha256 IS NULL) "
            "OR (video_file_path IS NOT NULL AND video_content_type IS NOT NULL "
            "AND video_size_bytes IS NOT NULL AND video_sha256 IS NOT NULL)",
        )


def downgrade() -> None:
    video_rows = op.get_bind().execute(
        sa.text("SELECT count(*) FROM library_items WHERE video_file_path IS NOT NULL")
    ).scalar()
    if video_rows:
        raise RuntimeError(
            f"Refusing to downgrade: {video_rows} library item(s) hold a video. "
            "Delete them first; an audio-only table cannot keep them."
        )
    with op.batch_alter_table("library_items") as batch_op:
        batch_op.drop_constraint("ck_library_items_video_metadata_paired", type_="check")
        batch_op.drop_constraint("ck_library_items_one_media", type_="check")
        batch_op.drop_constraint("uq_library_items_video_file_path", type_="unique")
        for name, column_type in _AUDIO_COLUMNS:
            batch_op.alter_column(name, existing_type=column_type, nullable=False)
        batch_op.drop_column("video_height")
        batch_op.drop_column("video_width")
        batch_op.drop_column("video_sha256")
        batch_op.drop_column("video_size_bytes")
        batch_op.drop_column("video_content_type")
        batch_op.drop_column("video_file_path")
