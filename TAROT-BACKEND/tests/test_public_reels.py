"""The public reels pages and their sitemap entries (ROUND67).

Every visitor, signed in or not, reads /reels/ (all reels) and /reels/<key>/
(one reel): the video behind its poster, never playing by itself, the title,
the caption, the reading button and the words spoken, with VideoObject data
for search engines. Only what the Shorts tab shows is shown.
"""

from datetime import datetime, timedelta, timezone
import json
import re

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from app.database.client import get_db
from app.models.library_item import LibraryItem
from app.routers.public_seo import GET_YOUR_READING, SIGN_UP_PATH, router as public_seo_router


class _Storage:
    def public_url(self, key):
        return f"https://askvalentina.co.uk/media/{key}"


@pytest.fixture
def storage(monkeypatch):
    storage = _Storage()
    monkeypatch.setattr("app.services.library_items.get_object_storage", lambda: storage)
    return storage


def _client(db) -> TestClient:
    app = FastAPI()
    app.include_router(public_seo_router)
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app, raise_server_exceptions=False)


def _reel(db, key, *, published_at, title="A reel", enabled=True, transcript=None, cover=True, description=None):
    item = LibraryItem(
        key=key,
        type="reel",
        title=title,
        description=description,
        transcript=transcript,
        video_file_path=f"library/video/{key}.mp4",
        video_content_type="video/mp4",
        video_size_bytes=1000,
        video_sha256="a" * 64,
        video_width=720,
        video_height=1280,
        duration_seconds=98.4,
        cover_image_path=f"library/covers/{key}.webp" if cover else None,
        cover_content_type="image/webp" if cover else None,
        cover_size_bytes=10 if cover else None,
        enabled=enabled,
        published_at=published_at,
    )
    db.add(item)
    db.commit()
    return item


def _json_ld(html: str) -> list[dict]:
    return [json.loads(block) for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html)]


def test_reels_page_shows_every_published_reel_with_its_words_and_video_data(db, storage):
    now = datetime.now(timezone.utc)
    _reel(
        db,
        "ig-2",
        published_at=now - timedelta(days=1),
        title="Capricorn doesn’t look at your money first.",
        description="They look at your spine.",
        transcript="Capricorn does not look at your money first <and> looks at your spine.",
    )
    _reel(db, "ig-1", published_at=now - timedelta(days=30), title="An older reel", cover=False)
    _reel(db, "ig-hidden", published_at=now - timedelta(days=2), title="Hidden reel", enabled=False)
    _reel(db, "ig-future", published_at=now + timedelta(days=2), title="Future reel")
    db.add(
        LibraryItem(
            key="tone", type="meditation", title="A podcast", audio_file_path="library/audio/t.mp3",
            audio_content_type="audio/mpeg", audio_size_bytes=10, audio_sha256="b" * 64,
            duration_seconds=6, enabled=True, published_at=now - timedelta(days=1),
        )
    )
    db.commit()

    response = _client(db).get("/reels/")
    assert response.status_code == 200
    html = response.text
    assert "<title>Reels | Ask Valentina</title>" in html
    assert '<link rel="canonical" href="https://askvalentina.co.uk/reels/">' in html
    assert 'content="index,follow"' in html
    # Newest first; the hidden, the future and the podcast are not there.
    page = html.split("<main>", 1)[1]
    assert page.index("Capricorn doesn’t look") < page.index("An older reel")
    for absent in ("Hidden reel", "Future reel", "A podcast"):
        assert absent not in html
    # The caption, the words (escaped) and the reading button under each reel.
    assert "They look at your spine." in html
    assert "Capricorn does not look at your money first &lt;and&gt; looks at your spine." in html
    assert html.count(f'href="{SIGN_UP_PATH}" data-reading-link>{GET_YOUR_READING}</a>') == 2
    # Poster first; the video address waits in the button until a tap.
    assert '<img src="https://askvalentina.co.uk/media/library/covers/ig-2.webp" alt="" loading="lazy"' in html
    assert "<video" not in html.split("<main>", 1)[1].split("<script>", 1)[0]
    assert "autoplay" not in html
    assert 'data-src="https://askvalentina.co.uk/media/library/video/ig-2.mp4"' in html

    listing = next(block for block in _json_ld(html) if block["@type"] == "ItemList")
    first = listing["itemListElement"][0]["item"]
    assert first["@type"] == "VideoObject"
    assert first["name"] == "Capricorn doesn’t look at your money first."
    assert first["description"] == "Capricorn doesn’t look at your money first. They look at your spine."
    assert first["thumbnailUrl"] == ["https://askvalentina.co.uk/media/library/covers/ig-2.webp"]
    assert first["contentUrl"] == "https://askvalentina.co.uk/media/library/video/ig-2.mp4"
    assert first["duration"] == "PT1M38S"
    assert first["uploadDate"].endswith("+00:00")
    assert first["url"] == "https://askvalentina.co.uk/reels/ig-2/"
    assert first["transcript"].startswith("Capricorn does not look")
    assert "thumbnailUrl" not in listing["itemListElement"][1]["item"]


def test_one_reel_page_is_the_video_its_caption_and_its_words(db, storage):
    now = datetime.now(timezone.utc)
    _reel(db, "ig-3", published_at=now - timedelta(days=1), title="Newest")
    _reel(
        db,
        "ig-2",
        published_at=now - timedelta(days=2),
        title="Watch me",
        description="Line one.\nLine two.",
        transcript="Every word said in the reel.",
    )
    _reel(db, "ig-1", published_at=now - timedelta(days=3), title="Oldest")

    client = _client(db)
    response = client.get("/reels/ig-2/")
    assert response.status_code == 200
    html = response.text
    assert "<title>Watch me | Ask Valentina</title>" in html
    assert '<link rel="canonical" href="https://askvalentina.co.uk/reels/ig-2/">' in html
    assert '<meta property="og:type" content="video.other">' in html
    assert "<h1>Watch me</h1>" in html
    assert '<p class="reel-caption">Line one.\nLine two.</p>' in html
    assert "Every word said in the reel." in html
    assert f">{GET_YOUR_READING}</a>" in html
    video = re.search(r"<video[^>]*>", html).group(0)
    assert 'preload="none"' in video and "controls" in video and "playsinline" in video
    assert "autoplay" not in html
    assert 'poster="https://askvalentina.co.uk/media/library/covers/ig-2.webp"' in video
    # More reels: the older one first, then the newest.
    more = html.split("More reels", 1)[1]
    assert more.index("Oldest") < more.index("Newest")

    video_object = next(block for block in _json_ld(html) if block["@type"] == "VideoObject")
    assert video_object["transcript"] == "Every word said in the reel."
    assert video_object["mainEntityOfPage"] == "https://askvalentina.co.uk/reels/ig-2/"

    assert client.get("/reels/ig-404/").status_code == 404


def test_hidden_reels_and_podcasts_have_no_reel_page(db, storage):
    now = datetime.now(timezone.utc)
    _reel(db, "ig-hidden", published_at=now - timedelta(days=1), enabled=False)
    db.add(
        LibraryItem(
            key="tone", type="meditation", title="A podcast", audio_file_path="library/audio/t.mp3",
            audio_content_type="audio/mpeg", audio_size_bytes=10, audio_sha256="b" * 64,
            duration_seconds=6, enabled=True, published_at=now - timedelta(days=1),
        )
    )
    db.commit()
    client = _client(db)
    assert client.get("/reels/ig-hidden/").status_code == 404
    assert client.get("/reels/tone/").status_code == 404
    empty = client.get("/reels/")
    assert empty.status_code == 200
    assert 'content="noindex,follow"' in empty.text
    assert "No reels yet." in empty.text


def test_reading_button_script_follows_the_apps_sign_in(db, storage):
    _reel(db, "ig-1", published_at=datetime.now(timezone.utc) - timedelta(days=1))
    html = _client(db).get("/reels/").text
    assert "localStorage.getItem('auth_token')" in html
    assert "localStorage.getItem('auth_user')" in html
    assert "user.role==='USER'?'/app/readers':'/psychics-browse'" in html


def test_sitemap_lists_the_reels_pages_only_when_there_are_reels(db, storage, monkeypatch):
    monkeypatch.setattr("app.routers.public_seo.get_psychics", lambda db, filters: {"items": []})
    client = _client(db)
    assert "/reels/" not in client.get("/sitemap.xml").text

    now = datetime.now(timezone.utc)
    _reel(db, "ig-1", published_at=now - timedelta(days=1))
    _reel(db, "ig-hidden", published_at=now - timedelta(days=1), enabled=False)
    sitemap = client.get("/sitemap.xml").text
    assert "<loc>https://askvalentina.co.uk/reels/</loc>" in sitemap
    assert "<loc>https://askvalentina.co.uk/reels/ig-1/</loc>" in sitemap
    assert "ig-hidden" not in sitemap
