from io import BytesIO
from pathlib import Path
import uuid

from fastapi import UploadFile
from PIL import Image, UnidentifiedImageError

from app.config import get_app_settings

settings = get_app_settings()
MEDIA_DIR = settings.MEDIA_DIR

MEDIA_DIR.mkdir(parents=True, exist_ok=True)

# A profile picture (POST /api/profile/me/picture, and a reader's photo from
# the owner's phone): the raster formats it may be, each with the extension
# it is stored under, and its largest size.
PICTURE_FORMAT_EXTENSIONS = {"JPEG": ".jpg", "PNG": ".png", "GIF": ".gif", "WEBP": ".webp"}
MAX_PICTURE_BYTES = 5 * 1024 * 1024


def picture_format(content: bytes) -> str | None:
    """The format Pillow reads these bytes as ("JPEG", "PNG", …), or None when
    they are not an image it can read. The declared content type and the file
    name are the client's to choose, so the stored extension comes from here:
    an HTML or SVG file named ".png" must never be served from our own origin
    (stored XSS; the auth token lives in localStorage)."""
    try:
        with Image.open(BytesIO(content)) as probe:
            return (probe.format or "").upper() or None
    except (UnidentifiedImageError, OSError, ValueError):
        return None


def save_media(media: UploadFile) -> str:
    filename = f"{uuid.uuid4()}_{media.filename}"
    file_path = MEDIA_DIR / filename

    with file_path.open("wb") as f:
        f.write(media.file.read())

    return str(file_path)


def update_media(old_media_path: str, new_media_file: UploadFile) -> str:
    old_media_deleted = delete_media(old_media_path)
    new_media_path = save_media(new_media_file)

    if not old_media_deleted:
        return str(new_media_path)  # TODO: (hack) Temporary till adding loggings

    return str(new_media_path)


def delete_media(path: str | None) -> bool:
    if path is None:
        return False

    file_path = Path(path)
    try:
        file_path.unlink()
        return True
    except FileNotFoundError:
        return False
