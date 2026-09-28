import mimetypes

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.config import get_app_settings

router = APIRouter()


settings = get_app_settings()
MEDIA_DIR = settings.MEDIA_DIR

# The only content types the folder legitimately serves inline: the reader and
# client pictures and the owner's hall-sound audio. Anything else — including an
# uploaded HTML or SVG file — is served as an opaque download so a browser can
# never render it as active content on our own origin (stored XSS). Paired with
# X-Content-Type-Options: nosniff below so the browser cannot sniff past it.
INLINE_SAFE_MEDIA_TYPES = frozenset(
    {
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "image/avif",
        "audio/mpeg",
        "audio/ogg",
        "audio/mp4",
        "audio/aac",
        "audio/wav",
    }
)


@router.get("/uploads/{filename}")
def get_thumbnail(filename: str):
    file_path = MEDIA_DIR / filename

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")

    # Detect MIME type automatically
    mime_type, _ = mimetypes.guess_type(file_path)
    if mime_type is None:
        mime_type = "application/octet-stream"

    headers = {"X-Content-Type-Options": "nosniff"}
    if mime_type in INLINE_SAFE_MEDIA_TYPES:
        headers["Content-Disposition"] = "inline"
        media_type = mime_type
    else:
        # Unknown or browser-executable type (html, svg, xml, …): hand it back as
        # an opaque attachment, never rendered inline on our origin.
        headers["Content-Disposition"] = "attachment"
        media_type = "application/octet-stream"

    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=None,
        headers=headers,
    )
