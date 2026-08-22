"""Validation, storage, and queries for Sanctuary library audio content."""

from __future__ import annotations

import hashlib
from io import BytesIO
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.models.library_item import LibraryItem
from app.schemas.library_item import MAX_LIBRARY_ITEM_TITLE_LENGTH, MAX_LIBRARY_ITEM_TYPE_LENGTH
from app.services.hall_sounds import HallSoundError, SniffResult, sniff_hall_sound


MAX_LIBRARY_AUDIO_BYTES = 60 * 1024 * 1024

# These are the article-media rules. Keep the accepted formats, byte limit,
# pixel limit, output dimensions, and WebP settings identical to that route.
MAX_LIBRARY_COVER_BYTES = 8 * 1024 * 1024
MAX_LIBRARY_COVER_PIXELS = 24_000_000
ALLOWED_LIBRARY_COVER_TYPES = {"image/jpeg", "image/png", "image/webp"}

MEDIA_URL_PREFIX = "/api/media/uploads/"
_SLUG = re.compile(r"[^a-z0-9]+")


class LibraryItemError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


@dataclass(frozen=True)
class PreparedCover:
    data: bytes
    content_type: str = "image/webp"
    extension: str = ".webp"


def media_dir() -> Path:
    directory = get_app_settings().MEDIA_DIR
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def audio_url(item: LibraryItem) -> str:
    return MEDIA_URL_PREFIX + item.audio_file_path


def cover_url(item: LibraryItem) -> str | None:
    if item.cover_image_path is None:
        return None
    return MEDIA_URL_PREFIX + item.cover_image_path


def make_key(db: Session, title: str) -> str:
    base = _SLUG.sub("-", title.strip().lower()).strip("-")[:48] or "item"
    key = base
    suffix = 2
    while db.query(LibraryItem).filter(LibraryItem.key == key).first() is not None:
        key = f"{base}-{suffix}"
        suffix += 1
    return key


def _validate_text(type_value: str, title: str) -> tuple[str, str]:
    type_value = type_value.strip()
    title = title.strip()
    if not type_value or len(type_value) > MAX_LIBRARY_ITEM_TYPE_LENGTH:
        raise LibraryItemError(
            400,
            f"Give the item a type of up to {MAX_LIBRARY_ITEM_TYPE_LENGTH} characters.",
        )
    if not title or len(title) > MAX_LIBRARY_ITEM_TITLE_LENGTH:
        raise LibraryItemError(
            400,
            f"Give the item a title of up to {MAX_LIBRARY_ITEM_TITLE_LENGTH} characters.",
        )
    return type_value, title


def prepare_audio(data: bytes) -> SniffResult:
    if not data:
        raise LibraryItemError(400, "The selected audio file is empty.")
    if len(data) > MAX_LIBRARY_AUDIO_BYTES:
        raise LibraryItemError(413, "Library audio files must be no larger than 60 MB.")
    try:
        return sniff_hall_sound(data)
    except HallSoundError as exc:
        raise LibraryItemError(exc.status, exc.message) from exc


def prepare_cover(data: bytes, declared_content_type: str | None) -> PreparedCover:
    if declared_content_type not in ALLOWED_LIBRARY_COVER_TYPES:
        raise LibraryItemError(415, "Choose a JPEG, PNG or WebP image.")
    if not data:
        raise LibraryItemError(400, "The selected image is empty.")
    if len(data) > MAX_LIBRARY_COVER_BYTES:
        raise LibraryItemError(413, "Article images must be no larger than 8 MB.")
    try:
        image = Image.open(BytesIO(data))
        image.verify()
        image = Image.open(BytesIO(data))
        if image.width * image.height > MAX_LIBRARY_COVER_PIXELS:
            raise LibraryItemError(413, "That image has too many pixels. Choose a smaller image.")
        image = ImageOps.exif_transpose(image)
        image.thumbnail((2400, 2400), Image.Resampling.LANCZOS)
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")
        output = BytesIO()
        image.save(output, format="WEBP", quality=86, method=6)
    except LibraryItemError:
        raise
    except (UnidentifiedImageError, OSError, ValueError):
        raise LibraryItemError(415, "The selected file is not a valid JPEG, PNG or WebP image.")
    return PreparedCover(output.getvalue())


def _random_path(prefix: str, extension: str) -> tuple[str, Path]:
    directory = media_dir()
    while True:
        filename = f"{prefix}_{secrets.token_urlsafe(24)}{extension}"
        target = directory / filename
        if not target.exists():
            return filename, target


def _write_file(prefix: str, extension: str, data: bytes) -> tuple[str, Path]:
    filename, target = _random_path(prefix, extension)
    partial = target.with_suffix(target.suffix + ".partial")
    partial.write_bytes(data)
    partial.replace(target)
    return filename, target


def create_library_item(
    db: Session,
    *,
    audio_data: bytes,
    audio_original_filename: str | None,
    type_value: str,
    title: str,
    description: str | None,
    sort_order: int,
    enabled: bool,
    published_at: datetime | None,
) -> LibraryItem:
    type_value, title = _validate_text(type_value, title)
    audio = prepare_audio(audio_data)

    written: list[Path] = []
    try:
        audio_name, audio_target = _write_file("library_audio", audio.extension, audio_data)
        written.append(audio_target)
    except Exception:
        for path in written:
            path.unlink(missing_ok=True)
        raise

    item = LibraryItem(
        key=make_key(db, title),
        type=type_value,
        title=title,
        description=(description or "").strip() or None,
        audio_file_path=audio_name,
        audio_content_type=audio.content_type,
        audio_size_bytes=len(audio_data),
        audio_sha256=hashlib.sha256(audio_data).hexdigest(),
        duration_seconds=round(audio.duration_seconds, 3),
        cover_image_path=None,
        cover_content_type=None,
        cover_size_bytes=None,
        sort_order=sort_order,
        enabled=enabled,
        published_at=published_at,
        original_filename=(audio_original_filename or "")[:255] or None,
    )
    try:
        db.add(item)
        db.commit()
    except Exception:
        db.rollback()
        for path in written:
            path.unlink(missing_ok=True)
        raise
    db.refresh(item)
    return item


def update_library_item(
    db: Session,
    item: LibraryItem,
    *,
    changes: dict,
    audio_data: bytes | None,
    audio_original_filename: str | None,
    cover_data: bytes | None,
    cover_declared_content_type: str | None,
    remove_cover: bool,
) -> LibraryItem:
    if "type" in changes or "title" in changes:
        next_type = changes.get("type", item.type)
        next_title = changes.get("title", item.title)
        changes["type"], changes["title"] = _validate_text(next_type, next_title)

    audio = prepare_audio(audio_data) if audio_data is not None else None
    cover = (
        prepare_cover(cover_data, cover_declared_content_type)
        if cover_data is not None
        else None
    )

    old_paths: list[Path] = []
    written: list[Path] = []
    try:
        if audio is not None:
            audio_name, audio_target = _write_file("library_audio", audio.extension, audio_data)
            written.append(audio_target)
            old_paths.append(media_dir() / item.audio_file_path)
            item.audio_file_path = audio_name
            item.audio_content_type = audio.content_type
            item.audio_size_bytes = len(audio_data)
            item.audio_sha256 = hashlib.sha256(audio_data).hexdigest()
            item.duration_seconds = round(audio.duration_seconds, 3)
            item.original_filename = (audio_original_filename or "")[:255] or None

        if cover is not None:
            cover_name, cover_target = _write_file("library_cover", cover.extension, cover.data)
            written.append(cover_target)
            if item.cover_image_path is not None:
                old_paths.append(media_dir() / item.cover_image_path)
            item.cover_image_path = cover_name
            item.cover_content_type = cover.content_type
            item.cover_size_bytes = len(cover.data)
        elif remove_cover and item.cover_image_path is not None:
            old_paths.append(media_dir() / item.cover_image_path)
            item.cover_image_path = None
            item.cover_content_type = None
            item.cover_size_bytes = None
    except Exception:
        for path in written:
            path.unlink(missing_ok=True)
        raise

    for field, value in changes.items():
        if field == "description" and value is not None:
            value = value.strip() or None
        setattr(item, field, value)

    try:
        db.commit()
    except Exception:
        db.rollback()
        for path in written:
            path.unlink(missing_ok=True)
        raise
    db.refresh(item)
    for path in old_paths:
        path.unlink(missing_ok=True)
    return item


def delete_library_item(db: Session, item: LibraryItem) -> None:
    paths = [media_dir() / item.audio_file_path]
    if item.cover_image_path is not None:
        paths.append(media_dir() / item.cover_image_path)
    db.delete(item)
    db.commit()
    for path in paths:
        path.unlink(missing_ok=True)


def list_all(db: Session) -> list[LibraryItem]:
    return db.query(LibraryItem).order_by(LibraryItem.sort_order.asc(), LibraryItem.id.asc()).all()


def list_public(db: Session, *, now: datetime | None = None) -> list[LibraryItem]:
    visible_at = now or datetime.now(timezone.utc)
    return (
        db.query(LibraryItem)
        .filter(
            LibraryItem.enabled.is_(True),
            LibraryItem.published_at.is_not(None),
            LibraryItem.published_at <= visible_at,
        )
        .order_by(LibraryItem.sort_order.asc(), LibraryItem.id.asc())
        .all()
    )


def get_public_by_key(db: Session, key: str, *, now: datetime | None = None) -> LibraryItem | None:
    visible_at = now or datetime.now(timezone.utc)
    return (
        db.query(LibraryItem)
        .filter(
            LibraryItem.key == key,
            LibraryItem.enabled.is_(True),
            LibraryItem.published_at.is_not(None),
            LibraryItem.published_at <= visible_at,
        )
        .first()
    )
