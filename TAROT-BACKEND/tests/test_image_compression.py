"""Server-side fallback compression: a large image in → a small JPEG out."""

import io

from PIL import Image

from app.services.image_compression import (
    JPEG_QUALITY,
    MAX_LONG_EDGE,
    compress_image,
)


def _big_png_bytes(w=3000, h=2200) -> bytes:
    """A large, noisy PNG so it doesn't trivially compress to nothing."""
    import random

    img = Image.new("RGB", (w, h))
    rnd = random.Random(0)
    img.putdata([(rnd.randint(0, 255), rnd.randint(0, 255), rnd.randint(0, 255)) for _ in range(w * h)])
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_large_image_is_downscaled_and_shrunk():
    raw = _big_png_bytes()
    out, ext = compress_image(raw)

    assert ext == ".jpg"
    assert len(out) < len(raw)  # smaller stored file

    img = Image.open(io.BytesIO(out))
    assert img.format == "JPEG"
    assert max(img.size) <= MAX_LONG_EDGE  # long edge capped at 1600


def test_small_image_stays_within_bounds():
    img = Image.new("RGB", (800, 600), (120, 40, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    out, ext = compress_image(buf.getvalue())

    assert ext == ".jpg"
    result = Image.open(io.BytesIO(out))
    assert result.size == (800, 600)  # not upscaled
    assert result.format == "JPEG"


def test_undecodable_input_is_kept_not_rejected():
    # A raw/unknown blob must never bounce — it's kept as-is (fail soft).
    out, ext = compress_image(b"not-an-image-at-all")
    assert out == b"not-an-image-at-all"
    assert ext == ".bin"


def test_exif_is_stripped():
    # Build a JPEG carrying EXIF, confirm the re-encode drops it.
    img = Image.new("RGB", (1000, 800), (10, 20, 30))
    exif = Image.Exif()
    exif[0x010F] = "SecretCameraMake"  # Make tag
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif)

    out, _ = compress_image(buf.getvalue())
    reloaded = Image.open(io.BytesIO(out))
    assert len(reloaded.getexif()) == 0  # no EXIF survives
    assert JPEG_QUALITY == 80
