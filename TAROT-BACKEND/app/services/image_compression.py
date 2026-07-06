"""Server-side image compression — the safety net behind the client's in-browser
compression (Section 6.1).

The client already downscales + re-encodes before upload, so almost nothing raw
reaches here. This is the fallback for the rare oversized/raw file: downscale to
a sane size, re-encode as JPEG, and STRIP EXIF (privacy — phone screenshots can
carry location). We store the compressed result only.

Uses Pillow. If a format Pillow can't decode slips through (e.g. HEIC without a
plugin — the client converts those first), we fail soft and keep the original
bytes rather than rejecting the user's upload.
"""

import io
from typing import Tuple

from PIL import Image, ImageOps

from app.logging_config import get_logger

logger = get_logger(__name__)

MAX_LONG_EDGE = 1600
JPEG_QUALITY = 80


def compress_image(data: bytes) -> Tuple[bytes, str]:
    """Return (compressed_bytes, extension). Downscales to <=1600px long edge,
    re-encodes JPEG ~80%, strips EXIF. On any decode failure, returns the input
    unchanged with a ``.bin`` extension so the upload never bounces."""
    try:
        img = Image.open(io.BytesIO(data))
        # Apply EXIF orientation, THEN drop EXIF by re-encoding (privacy).
        img = ImageOps.exif_transpose(img)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")

        w, h = img.size
        long_edge = max(w, h)
        if long_edge > MAX_LONG_EDGE:
            scale = MAX_LONG_EDGE / long_edge
            img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)

        out = io.BytesIO()
        img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
        result = out.getvalue()
        logger.info(
            "evidence_compressed",
            in_bytes=len(data),
            out_bytes=len(result),
            dimensions=f"{img.size[0]}x{img.size[1]}",
        )
        return result, ".jpg"
    except Exception as e:
        # Unknown/undecodable format — keep the original rather than rejecting.
        logger.warning(
            "evidence_compression_skipped",
            error=str(e),
            error_type=e.__class__.__name__,
            in_bytes=len(data),
        )
        return data, ".bin"
