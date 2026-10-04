"""Validation, direct object storage, and queries for library audio and video."""

from __future__ import annotations

import base64
from io import BytesIO
import re
import secrets
from datetime import datetime, timezone

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.models.library_item import LibraryItem
from app.schemas.library_item import (
    MAX_LIBRARY_AUDIO_SIZE_BYTES,
    MAX_LIBRARY_ITEM_TITLE_LENGTH,
    MAX_LIBRARY_ITEM_TYPE_LENGTH,
    MAX_LIBRARY_VIDEO_SIZE_BYTES,
    LibraryAudioReference,
    LibraryAudioUploadGrant,
    LibraryAudioUploadRequest,
    LibraryVideoReference,
    LibraryVideoUploadGrant,
    LibraryVideoUploadRequest,
)
from app.services.object_storage import ObjectNotFoundError, get_object_storage


AUDIO_UPLOAD_URL_EXPIRY_SECONDS = 15 * 60
# A phone's own files are accepted as they come (ROUND50): Voice Memos and
# most recorders save AAC in MP4 (.m4a), and an iPhone's camera roll hands
# over QuickTime (.mov). The object key patterns below follow these lists.
ALLOWED_LIBRARY_AUDIO_TYPES = {
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
}
ALLOWED_LIBRARY_VIDEO_TYPES = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
}

# These are the article-media rules. Keep the accepted formats, byte limit,
# pixel limit, output dimensions, and WebP settings identical to that route.
MAX_LIBRARY_COVER_BYTES = 8 * 1024 * 1024
MAX_LIBRARY_COVER_PIXELS = 24_000_000
ALLOWED_LIBRARY_COVER_TYPES = {"image/jpeg", "image/png", "image/webp"}

_SLUG = re.compile(r"[^a-z0-9]+")


def _object_key_pattern(kind: str, allowed_types: dict[str, str]) -> re.Pattern[str]:
    extensions = "|".join(re.escape(extension.lstrip(".")) for extension in allowed_types.values())
    return re.compile(rf"^library/{kind}/[A-Za-z0-9_-]{{32}}\.({extensions})$")


_AUDIO_OBJECT_KEY = _object_key_pattern("audio", ALLOWED_LIBRARY_AUDIO_TYPES)
_VIDEO_OBJECT_KEY = _object_key_pattern("video", ALLOWED_LIBRARY_VIDEO_TYPES)


class LibraryItemError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


class PreparedCover:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.content_type = "image/webp"
        self.extension = ".webp"


def audio_url(item: LibraryItem) -> str | None:
    if item.audio_file_path is None:
        return None
    return get_object_storage().public_url(item.audio_file_path)


def video_url(item: LibraryItem) -> str | None:
    if item.video_file_path is None:
        return None
    return get_object_storage().public_url(item.video_file_path)


def cover_url(item: LibraryItem) -> str | None:
    if item.cover_image_path is None:
        return None
    return get_object_storage().public_url(item.cover_image_path)


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


def _validate_audio_claim(audio: LibraryAudioUploadRequest) -> str:
    extension = ALLOWED_LIBRARY_AUDIO_TYPES.get(audio.content_type)
    if extension is None:
        raise LibraryItemError(415, "Upload an MP3, OGG or M4A audio file.")
    if audio.size_bytes > MAX_LIBRARY_AUDIO_SIZE_BYTES:
        raise LibraryItemError(413, "Library audio files must be smaller than 2 GB.")
    return extension


def _validate_video_claim(video: LibraryVideoUploadRequest) -> str:
    extension = ALLOWED_LIBRARY_VIDEO_TYPES.get(video.content_type)
    if extension is None:
        raise LibraryItemError(415, "Upload an MP4 or MOV video file.")
    if video.size_bytes > MAX_LIBRARY_VIDEO_SIZE_BYTES:
        raise LibraryItemError(
            413,
            f"Library video files must be no larger than {MAX_LIBRARY_VIDEO_SIZE_BYTES // (1024 * 1024)} MB.",
        )
    return extension


def _presign_direct_upload(
    upload: LibraryAudioUploadRequest | LibraryVideoUploadRequest,
    object_key: str,
) -> LibraryAudioUploadGrant:
    upload_url, headers = get_object_storage().presign_put(
        object_key,
        content_type=upload.content_type,
        content_length=upload.size_bytes,
        content_md5=upload.content_md5,
        sha256=upload.sha256,
        duration_seconds=str(upload.duration_seconds),
        expires_seconds=AUDIO_UPLOAD_URL_EXPIRY_SECONDS,
    )
    return LibraryAudioUploadGrant(
        object_key=object_key,
        upload_url=upload_url,
        expires_in_seconds=AUDIO_UPLOAD_URL_EXPIRY_SECONDS,
        headers=headers,
    )


def create_audio_upload_grant(audio: LibraryAudioUploadRequest) -> LibraryAudioUploadGrant:
    """Sign one exact direct-to-R2 PUT. No media bytes enter this process."""
    extension = _validate_audio_claim(audio)
    return _presign_direct_upload(audio, _random_object_key("audio", extension))


def create_video_upload_grant(video: LibraryVideoUploadRequest) -> LibraryVideoUploadGrant:
    """Sign one exact direct-to-R2 PUT for a video. No media bytes enter this process."""
    extension = _validate_video_claim(video)
    return _presign_direct_upload(video, _random_object_key("video", extension))


def _expected_md5_hex(content_md5: str) -> str:
    return base64.b64decode(content_md5, validate=True).hex()


def _verify_stored_upload(
    reference: LibraryAudioReference | LibraryVideoReference,
    *,
    medium: str,
    extension: str,
    key_pattern: re.Pattern[str],
) -> None:
    match = key_pattern.fullmatch(reference.object_key)
    if match is None or f".{match.group(1)}" != extension:
        raise LibraryItemError(400, f"That {medium} object key was not issued for this file type.")
    try:
        stored = get_object_storage().head_object(reference.object_key)
    except ObjectNotFoundError as exc:
        raise LibraryItemError(
            409,
            f"The direct {medium} upload has not completed in storage yet.",
        ) from exc
    if stored.size_bytes != reference.size_bytes:
        raise LibraryItemError(409, f"The stored {medium} size does not match the signed upload.")
    if stored.content_type != reference.content_type:
        raise LibraryItemError(409, f"The stored {medium} type does not match the signed upload.")
    if stored.etag != _expected_md5_hex(reference.content_md5):
        raise LibraryItemError(409, f"The stored {medium} checksum does not match the signed upload.")
    if stored.metadata.get("sha256") != reference.sha256:
        raise LibraryItemError(409, f"The stored {medium} SHA-256 does not match the signed upload.")
    if stored.metadata.get("duration-seconds") != str(reference.duration_seconds):
        raise LibraryItemError(409, f"The stored {medium} duration does not match the signed upload.")


def _verify_audio_object(audio: LibraryAudioReference) -> None:
    _verify_stored_upload(
        audio,
        medium="audio",
        extension=_validate_audio_claim(audio),
        key_pattern=_AUDIO_OBJECT_KEY,
    )


def _verify_video_object(video: LibraryVideoReference) -> None:
    _verify_stored_upload(
        video,
        medium="video",
        extension=_validate_video_claim(video),
        key_pattern=_VIDEO_OBJECT_KEY,
    )


def _ensure_audio_key_unused(
    db: Session,
    object_key: str,
    *,
    current_item_id: int | None = None,
) -> None:
    query = db.query(LibraryItem).filter(LibraryItem.audio_file_path == object_key)
    if current_item_id is not None:
        query = query.filter(LibraryItem.id != current_item_id)
    if query.first() is not None:
        raise LibraryItemError(409, "That direct audio upload has already been used.")


def _ensure_video_key_unused(db: Session, object_key: str) -> None:
    if db.query(LibraryItem).filter(LibraryItem.video_file_path == object_key).first() is not None:
        raise LibraryItemError(409, "That direct video upload has already been used.")


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


def _random_object_key(kind: str, extension: str) -> str:
    # 24 random bytes -> 32 URL-safe characters: the hall's unguessable-name pattern.
    return f"library/{kind}/{secrets.token_urlsafe(24)}{extension}"


def create_library_item(
    db: Session,
    *,
    audio: LibraryAudioReference,
    type_value: str,
    title: str,
    description: str | None,
    sort_order: int,
    enabled: bool,
    published_at: datetime | None,
) -> LibraryItem:
    type_value, title = _validate_text(type_value, title)
    _ensure_audio_key_unused(db, audio.object_key)
    _verify_audio_object(audio)

    item = LibraryItem(
        key=make_key(db, title),
        type=type_value,
        title=title,
        description=(description or "").strip() or None,
        audio_file_path=audio.object_key,
        audio_content_type=audio.content_type,
        audio_size_bytes=audio.size_bytes,
        audio_sha256=audio.sha256,
        duration_seconds=round(audio.duration_seconds, 3),
        cover_image_path=None,
        cover_content_type=None,
        cover_size_bytes=None,
        sort_order=sort_order,
        enabled=enabled,
        published_at=published_at,
        original_filename=(audio.original_filename or "")[:255] or None,
    )
    try:
        db.add(item)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(item)
    return item


def create_video_item(
    db: Session,
    *,
    video: LibraryVideoReference,
    type_value: str,
    title: str,
    description: str | None,
    sort_order: int,
    enabled: bool,
    published_at: datetime | None,
) -> LibraryItem:
    type_value, title = _validate_text(type_value, title)
    _ensure_video_key_unused(db, video.object_key)
    _verify_video_object(video)

    item = LibraryItem(
        key=make_key(db, title),
        type=type_value,
        title=title,
        description=(description or "").strip() or None,
        video_file_path=video.object_key,
        video_content_type=video.content_type,
        video_size_bytes=video.size_bytes,
        video_sha256=video.sha256,
        video_width=video.width,
        video_height=video.height,
        duration_seconds=round(video.duration_seconds, 3),
        cover_image_path=None,
        cover_content_type=None,
        cover_size_bytes=None,
        sort_order=sort_order,
        enabled=enabled,
        published_at=published_at,
        original_filename=(video.original_filename or "")[:255] or None,
    )
    try:
        db.add(item)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(item)
    return item


def update_library_item(
    db: Session,
    item: LibraryItem,
    *,
    changes: dict,
    audio: LibraryAudioReference | None,
    cover_data: bytes | None,
    cover_declared_content_type: str | None,
    remove_cover: bool,
) -> LibraryItem:
    if "type" in changes or "title" in changes:
        next_type = changes.get("type", item.type)
        next_title = changes.get("title", item.title)
        changes["type"], changes["title"] = _validate_text(next_type, next_title)

    if audio is not None:
        if item.video_file_path is not None:
            raise LibraryItemError(400, "This item is a video. It has no audio to replace.")
        if audio.object_key == item.audio_file_path:
            raise LibraryItemError(409, "That audio upload is already attached to this item.")
        _ensure_audio_key_unused(db, audio.object_key, current_item_id=item.id)
        _verify_audio_object(audio)
    cover = (
        prepare_cover(cover_data, cover_declared_content_type)
        if cover_data is not None
        else None
    )
    storage = get_object_storage()
    new_cover_key: str | None = None
    old_keys: list[str] = []

    try:
        if audio is not None:
            old_keys.append(item.audio_file_path)
            item.audio_file_path = audio.object_key
            item.audio_content_type = audio.content_type
            item.audio_size_bytes = audio.size_bytes
            item.audio_sha256 = audio.sha256
            item.duration_seconds = round(audio.duration_seconds, 3)
            item.original_filename = (audio.original_filename or "")[:255] or None

        if cover is not None:
            new_cover_key = _random_object_key("covers", cover.extension)
            storage.put_object(
                new_cover_key,
                BytesIO(cover.data),
                content_type=cover.content_type,
            )
            if item.cover_image_path is not None:
                old_keys.append(item.cover_image_path)
            item.cover_image_path = new_cover_key
            item.cover_content_type = cover.content_type
            item.cover_size_bytes = len(cover.data)
        elif remove_cover and item.cover_image_path is not None:
            old_keys.append(item.cover_image_path)
            item.cover_image_path = None
            item.cover_content_type = None
            item.cover_size_bytes = None
    except Exception:
        if new_cover_key is not None:
            storage.delete_object(new_cover_key)
        raise

    for field, value in changes.items():
        if field == "description" and value is not None:
            value = value.strip() or None
        setattr(item, field, value)

    try:
        db.commit()
    except Exception:
        db.rollback()
        if new_cover_key is not None:
            storage.delete_object(new_cover_key)
        raise
    db.refresh(item)
    for key in old_keys:
        storage.delete_object(key)
    return item


def delete_library_item(db: Session, item: LibraryItem) -> None:
    keys = [item.video_file_path if item.video_file_path is not None else item.audio_file_path]
    if item.cover_image_path is not None:
        keys.append(item.cover_image_path)
    db.delete(item)
    db.commit()
    storage = get_object_storage()
    for key in keys:
        storage.delete_object(key)


def list_all(db: Session) -> list[LibraryItem]:
    return db.query(LibraryItem).order_by(LibraryItem.sort_order.asc(), LibraryItem.id.asc()).all()


def list_public(db: Session, *, now: datetime | None = None) -> list[LibraryItem]:
    visible_at = now or datetime.now(timezone.utc)
    return (
        db.query(LibraryItem)
        .filter(
            LibraryItem.audio_file_path.is_not(None),
            LibraryItem.enabled.is_(True),
            LibraryItem.published_at.is_not(None),
            LibraryItem.published_at <= visible_at,
        )
        .order_by(LibraryItem.sort_order.asc(), LibraryItem.id.asc())
        .all()
    )


def list_public_reels(db: Session, *, now: datetime | None = None) -> list[LibraryItem]:
    visible_at = now or datetime.now(timezone.utc)
    return (
        db.query(LibraryItem)
        .filter(
            LibraryItem.video_file_path.is_not(None),
            LibraryItem.enabled.is_(True),
            LibraryItem.published_at.is_not(None),
            LibraryItem.published_at <= visible_at,
        )
        .order_by(LibraryItem.published_at.desc(), LibraryItem.id.desc())
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
