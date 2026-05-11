from pathlib import Path
import uuid

from fastapi import UploadFile

from app.config import get_app_settings

settings = get_app_settings()
MEDIA_DIR = settings.MEDIA_DIR

MEDIA_DIR.mkdir(parents=True, exist_ok=True)


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
