import mimetypes

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import get_app_settings

router = APIRouter()


settings = get_app_settings()
MEDIA_DIR = settings.MEDIA_DIR


@router.get("/uploads/{filename}")
def get_thumbnail(filename: str):
    file_path = MEDIA_DIR / filename

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")

    # Detect MIME type automatically
    mime_type, _ = mimetypes.guess_type(file_path)
    if mime_type is None:
        mime_type = "application/octet-stream"

    return FileResponse(
        path=file_path,
        media_type=mime_type,
        filename=None,
        headers={"Content-Disposition": "inline"},
    )
