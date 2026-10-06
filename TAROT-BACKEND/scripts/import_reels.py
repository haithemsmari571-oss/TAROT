"""Put Valentina's Instagram videos on the site as reels (ROUND67).

It runs on the owner's own Windows PC with the Python already installed there
and nothing else (the standard library only; it never imports the backend). It
reads the Instagram export folder, signs in as the owner (the password is typed
into the window, hidden, and kept in memory only), and for every video not yet
on the site does what the owner's New post screen does
(tarot-landing-web/src/features/owner/ownerLibraryApi.ts):

  1. asks the site for one signed upload address,
  2. sends the video straight to storage (R2); it never passes the site,
  3. registers it, hidden, with its title, caption, the words spoken in it and
     its Instagram date (routers/library_items.py POST /video),
  4. adds its cover picture and shows it, in one step (PATCH).

Each reel's key is "ig-" and its Instagram id. A second run therefore finds
what is already on the site and skips it, and a run that stopped half way
carries on: a reel registered but never shown (hidden and without a cover) gets
its cover and is shown. A reel the owner hid herself keeps its cover and stays
hidden.

Commands, from the checkout's folder:

    python TAROT-BACKEND\\scripts\\import_reels.py preview   (no sign-in: every title and caption as the site shows it)
    python TAROT-BACKEND\\scripts\\import_reels.py check     (signs in, checks storage, counts what is there)
    python TAROT-BACKEND\\scripts\\import_reels.py import    (puts every missing video on the site)

--site (the live site by default) and --folder (the export folder on this PC by
default) say where it works. For an unattended run on the local stack only, the
sign-in may come from AV_IMPORT_EMAIL and AV_IMPORT_PASSWORD; they are ignored
for any other site.
"""

from __future__ import annotations

import argparse
import base64
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import struct
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

LIVE_SITE = "https://askvalentina.co.uk"
EXPORT_FOLDER = r"C:\Users\Haithem\Desktop\videtest\askvalentina_instagram\FOR_WEBSITE"
LOCAL_HOSTS = {"localhost", "127.0.0.1"}
KEY_PREFIX = "ig-"
REEL_TYPE = "reel"
VIDEO_CONTENT_TYPE = "video/mp4"
COVER_CONTENT_TYPE = "image/jpeg"
OWNER_ROLE = "SUPERADMIN"
# The server's MAX_LIBRARY_ITEM_TITLE_LENGTH (app/schemas/library_item.py).
# tests/test_import_reels.py holds the two equal.
MAX_TITLE_LENGTH = 100
# Instagram gives a day, not a time. Every reel is placed at midday UTC, the
# same day in the UK and in America, and the reels of one day a second apart
# in posts.json's order (newest first), so the site keeps Instagram's order.
POST_HOUR_UTC = 12
HASH_CHUNK_BYTES = 4 * 1024 * 1024
USER_AGENT = "AskValentina-reel-import/1"
API_TIMEOUT_SECONDS = 60
UPLOAD_TIMEOUT_SECONDS = 600


# ── Title and caption: decision 2 of ROUND67 ─────────────────────────────────
#
# The caption keeps every word except Instagram's call to action: the sentences
# that ask people to comment, follow, like, message, save or share on
# Instagram, the dated Instagram-only free reading offers, and the promise that
# answers a comment ("I will read for you", "The first one is free") when it
# directly follows such a sentence. The site's own "Get your reading" button
# takes their place.

_SENTENCE_BREAK = re.compile(r"(?<=[.!?])(?<!\bvs\.)\s+")
_SENTENCE_END = re.compile(r"(?<!\bvs)[.!?](?=\s|$)")
_CALL_TO_ACTION = re.compile(
    r"\bcomments?\b|\bfollow\b|\blike (?:the|this) video\b|\blike first\b|\bDM\b|"
    r"\bsave this\b|\bshare (?:it|this|with)\b|\bsend it to\b|"
    r"\bdrop (?:it|your sign|a comment)\b|\bopening space for free\b|\boffering free\b|"
    r"\bto claim yours\b|@\w",
    re.IGNORECASE,
)
# A sentence about commenting rather than a request to comment.
_ABOUT_COMMENTING = re.compile(r"^\W*when you comment\b", re.IGNORECASE)
_ANSWER_TO_A_COMMENT = re.compile(
    r"^\W*(?:I will (?:read|reach|tell)\b|I(?:’|')ll (?:read|reach|tell)\b|"
    r"(?:the|your) first (?:one|reading) is free\b|come back tomorrow\b|"
    r"that is all the universe needs\b|let(?:’|')s uncover\b)",
    re.IGNORECASE,
)
# A line left with only bullets or dots (the spacers once between the hashtags).
_HAS_CONTENT = re.compile(r"[^\s•·.\-–—]")


def _is_call_to_action(sentence: str) -> bool:
    return bool(_CALL_TO_ACTION.search(sentence)) and not _ABOUT_COMMENTING.match(sentence)


def remove_calls_to_action(text: str) -> str:
    """The text without its Instagram call to action, line breaks kept."""
    lines: list[str] = []
    after_call = False
    for line in text.replace("\r\n", "\n").split("\n"):
        if not line.strip():
            after_call = False
            lines.append("")
            continue
        kept = []
        for sentence in _SENTENCE_BREAK.split(line.strip()):
            if not sentence:
                continue
            if _is_call_to_action(sentence):
                after_call = True
                continue
            if after_call and _ANSWER_TO_A_COMMENT.match(sentence):
                continue
            after_call = False
            kept.append(sentence)
        joined = " ".join(kept)
        if _HAS_CONTENT.search(joined):
            lines.append(joined)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def _ends_a_sentence(text: str) -> bool:
    return bool(text) and _SENTENCE_END.search(text, len(text) - 1) is not None


def reel_title(caption: str, instagram_title: str) -> tuple[str, str]:
    """The reel's title, and the opening of the caption it already says.

    posts.json's title is the caption's first sentence, cut at 90 characters,
    across line breaks and at "vs.". The site takes the caption's first line
    when the title spans lines, the whole first sentence when it fits the title
    column, and otherwise cuts it at a word with an ellipsis. The opening is
    left out of the description, as the owner's own posts split title and
    caption (tarot-landing-web/src/features/owner/ownerCaption.ts); it is empty
    when the title had to be cut, so the description keeps the whole caption.
    """
    first_line = caption.strip().split("\n", 1)[0].strip()
    title = instagram_title.strip().split("\n", 1)[0].strip()
    if title == first_line or (first_line.startswith(title) and _ends_a_sentence(title)):
        return title, title
    end = _SENTENCE_END.search(first_line, len(title))
    sentence = first_line[: end.end()] if end else first_line
    if len(sentence) <= MAX_TITLE_LENGTH:
        return sentence, sentence
    cut = sentence[: MAX_TITLE_LENGTH - 1].rsplit(" ", 1)[0].rstrip(" ,;:–—")
    return cut + "…", ""


def reel_description(caption: str, opening: str) -> str | None:
    text = caption.replace("\r\n", "\n").strip()
    if opening and text.startswith(opening):
        text = text[len(opening):]
    return remove_calls_to_action(text) or None


# ── The export folder ────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Reel:
    key: str
    instagram_id: str
    title: str
    description: str | None
    transcript: str | None
    published_at: datetime
    video: Path
    poster: Path
    width: int | None
    height: int | None
    caption: str
    instagram_title: str
    listed_duration: float | None


def load_reels(folder: Path) -> list[Reel]:
    """The export's videos, newest first, as posts.json lists them. Photos are
    left out (decision 4)."""
    posts = json.loads((folder / "posts.json").read_text(encoding="utf-8"))
    videos = [post for post in posts if post.get("type") == "video"]
    reels = []
    seconds_into_day: dict[str, int] = {}
    for post in videos:
        day = post["date"]
        offset = seconds_into_day.get(day, 0)
        seconds_into_day[day] = offset + 1
        caption = (post.get("caption") or "").strip()
        title, opening = reel_title(caption, post.get("title") or caption)
        published = datetime.fromisoformat(day).replace(hour=POST_HOUR_UTC, tzinfo=timezone.utc)
        reels.append(
            Reel(
                key=f"{KEY_PREFIX}{post['id']}",
                instagram_id=str(post["id"]),
                title=title,
                description=reel_description(caption, opening),
                transcript=(post.get("spoken_text") or "").strip() or None,
                published_at=published - timedelta(seconds=offset),
                video=folder / post["file"],
                poster=folder / post["poster"],
                width=post.get("width"),
                height=post.get("height"),
                caption=caption,
                instagram_title=post.get("title") or "",
                listed_duration=post.get("duration_s"),
            )
        )
    return reels


def _find_box(handle, start: int, end: int, kind: bytes) -> tuple[int, int]:
    position = start
    while position + 8 <= end:
        handle.seek(position)
        size, box = struct.unpack(">I4s", handle.read(8))
        header = 8
        if size == 1:
            size = struct.unpack(">Q", handle.read(8))[0]
            header = 16
        elif size == 0:
            size = end - position
        if size < header:
            break
        if box == kind:
            return position + header, position + size
        position += size
    raise ValueError(f"no {kind.decode()} box")


def mp4_duration_seconds(path: Path) -> float:
    """The length the MP4 itself declares (moov/mvhd), to the millisecond."""
    with path.open("rb") as handle:
        end = os.fstat(handle.fileno()).st_size
        moov_start, moov_end = _find_box(handle, 0, end, b"moov")
        mvhd_start, _ = _find_box(handle, moov_start, moov_end, b"mvhd")
        handle.seek(mvhd_start)
        version = handle.read(4)[0]
        if version == 1:
            handle.seek(16, 1)
            timescale, duration = struct.unpack(">IQ", handle.read(12))
        else:
            handle.seek(8, 1)
            timescale, duration = struct.unpack(">II", handle.read(8))
    if not timescale or not duration:
        raise ValueError("the video declares no length")
    return round(duration / timescale, 3)


def file_hashes(path: Path) -> tuple[str, str]:
    """SHA-256 in hex and MD5 in base64, as the upload grant asks for them."""
    sha256 = hashlib.sha256()
    md5 = hashlib.md5()
    with path.open("rb") as handle:
        while chunk := handle.read(HASH_CHUNK_BYTES):
            sha256.update(chunk)
            md5.update(chunk)
    return sha256.hexdigest(), base64.b64encode(md5.digest()).decode("ascii")


# ── The site ─────────────────────────────────────────────────────────────────


class SiteError(Exception):
    def __init__(self, status: int | None, detail: str) -> None:
        super().__init__(f"{status or 'no answer'}: {detail}")
        self.status = status
        self.detail = detail


def _detail(error: urllib.error.HTTPError) -> str:
    try:
        body = json.loads(error.read() or b"null")
    except ValueError:
        return error.reason or ""
    if isinstance(body, dict) and "detail" in body:
        return str(body["detail"])
    return str(body)


def _open(request: urllib.request.Request, timeout: int):
    try:
        return urllib.request.urlopen(request, timeout=timeout)
    except urllib.error.HTTPError as error:
        raise SiteError(error.code, _detail(error)) from None
    except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
        raise SiteError(None, str(getattr(error, "reason", error))) from None


def _token_role(token: str) -> str | None:
    try:
        payload = token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except (IndexError, ValueError):
        return None
    return claims.get("role")


class Site:
    def __init__(self, site: str) -> None:
        self.site = site.rstrip("/")
        self.api = f"{self.site}/api"
        self.token: str | None = None

    @property
    def is_local(self) -> bool:
        return urllib.parse.urlparse(self.site).hostname in LOCAL_HOSTS

    def _call(self, method: str, path: str, *, body: bytes | None = None, content_type: str | None = None):
        headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
        if content_type:
            headers["Content-Type"] = content_type
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        request = urllib.request.Request(f"{self.api}{path}", data=body, method=method, headers=headers)
        with _open(request, API_TIMEOUT_SECONDS) as response:
            raw = response.read()
        return json.loads(raw) if raw else None

    def _json(self, method: str, path: str, payload: dict):
        return self._call(method, path, body=json.dumps(payload).encode("utf-8"), content_type="application/json")

    def _form(self, method: str, path: str, fields: dict):
        # Form-encoded, as the owner screen sends text: a caption's line breaks
        # stay as typed (ownerLibraryApi.ts textForm).
        values = {name: str(value) for name, value in fields.items() if value is not None}
        return self._call(
            method,
            path,
            body=urllib.parse.urlencode(values).encode("utf-8"),
            content_type="application/x-www-form-urlencoded",
        )

    def sign_in(self, email: str, password: str) -> None:
        tokens = self._json("POST", "/auth/sign-in", {"email": email, "password": password})
        token = tokens["access_token"]
        if _token_role(token) != OWNER_ROLE:
            raise SiteError(403, "This account is not the owner's.")
        self.token = token
        # The server's own word on the role, not only the token's.
        if (self._call("GET", "/profile/me") or {}).get("role") != OWNER_ROLE:
            self.token = None
            raise SiteError(403, "This account is not the owner's.")

    def library(self) -> dict[str, dict]:
        return {item["key"]: item for item in self._call("GET", "/admin/library-items")}

    def upload_grant(self, claim: dict) -> dict:
        return self._json("POST", "/admin/library-items/video-upload-url", claim)

    def register(self, fields: dict) -> dict:
        return self._form("POST", "/admin/library-items/video", fields)

    def finish(self, item_id: int, cover: Path) -> dict:
        boundary = f"----reel-import-{secrets.token_hex(12)}"
        body = (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"enabled\"\r\n\r\ntrue\r\n"
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"cover_image\"; filename=\"{cover.name}\"\r\n"
            f"Content-Type: {COVER_CONTENT_TYPE}\r\n\r\n"
        ).encode("utf-8") + cover.read_bytes() + f"\r\n--{boundary}--\r\n".encode("utf-8")
        return self._call(
            "PATCH",
            f"/admin/library-items/{item_id}",
            body=body,
            content_type=f"multipart/form-data; boundary={boundary}",
        )


def put_to_storage(grant: dict, path: Path, size: int) -> None:
    """One PUT to the signed address with exactly the signed headers. No sign-in
    travels with it: the signature is the permission."""
    headers = {**grant["headers"], "Content-Length": str(size), "User-Agent": USER_AGENT}
    with path.open("rb") as handle:
        request = urllib.request.Request(grant["upload_url"], data=handle, method=grant.get("method", "PUT"), headers=headers)
        with _open(request, UPLOAD_TIMEOUT_SECONDS) as response:
            response.read()


def signed_duration(grant: dict, claim: dict) -> str:
    """The duration exactly as the server signed it, which registration repeats
    byte for byte (ownerLibraryApi.ts signedDuration)."""
    for name, value in grant["headers"].items():
        if name.lower() == "x-amz-meta-duration-seconds":
            return value
    return str(claim["duration_seconds"])


# ── Commands ─────────────────────────────────────────────────────────────────


def _say(line: str = "") -> None:
    print(line, flush=True)


def _megabytes(size: int) -> str:
    return f"{size / (1024 * 1024):.1f} MB"


def sign_in(site: Site) -> None:
    email = os.environ.get("AV_IMPORT_EMAIL") if site.is_local else None
    password = os.environ.get("AV_IMPORT_PASSWORD") if site.is_local else None
    if not email:
        email = input("Owner email: ").strip()
    if not password:
        password = getpass.getpass("Password (it stays hidden while you type): ")
    site.sign_in(email, password)
    _say("Signed in as the owner.")


def needs_finishing(item: dict) -> bool:
    """Registered by a run that stopped before its last step: hidden and with
    no cover. A reel the owner hid herself has its cover."""
    return not item.get("enabled") and not item.get("cover_url")


def upload_one(site: Site, reel: Reel) -> dict:
    size = reel.video.stat().st_size
    duration = mp4_duration_seconds(reel.video)
    sha256, md5 = file_hashes(reel.video)
    claim = {
        "content_type": VIDEO_CONTENT_TYPE,
        "size_bytes": size,
        "sha256": sha256,
        "content_md5": md5,
        "duration_seconds": duration,
        "original_filename": reel.video.name,
    }
    if reel.width and reel.height:
        claim.update(width=reel.width, height=reel.height)
    grant = site.upload_grant(claim)
    put_to_storage(grant, reel.video, size)
    return site.register(
        {
            "video_key": grant["object_key"],
            "video_content_type": claim["content_type"],
            "video_size_bytes": size,
            "video_sha256": sha256,
            "video_md5": md5,
            "duration_seconds": signed_duration(grant, claim),
            "video_width": reel.width,
            "video_height": reel.height,
            "video_original_filename": reel.video.name,
            "type": REEL_TYPE,
            "title": reel.title,
            "description": reel.description,
            "transcript": reel.transcript,
            "enabled": "false",
            "published_at": reel.published_at.isoformat(),
            "key": reel.key,
        }
    )


def _words(text: str) -> str:
    return " ".join(text.split())


def command_preview(reels: list[Reel], report: Path | None) -> int:
    lines = []
    changed = 0
    for number, reel in enumerate(reels, start=1):
        shown = reel.title + ("\n" + reel.description if reel.description else "")
        rewritten = _words(shown) != _words(reel.caption)
        changed += rewritten
        lines += [
            f"### {number}. {reel.key} ({reel.published_at.date().isoformat()})",
            "",
            f"- Title on the site: {reel.title}",
            *([f"- posts.json title: {json.dumps(reel.instagram_title, ensure_ascii=False)}"] if reel.instagram_title.strip() != reel.title else []),
            f"- Transcript: {len(reel.transcript or '')} characters",
            "",
            "Before (posts.json caption):",
            "",
            *[f"> {line}" if line else ">" for line in reel.caption.split("\n")],
            "",
            "After (the title, then the description):" if rewritten else "After: every word kept (the title, then the description):",
            "",
            *[f"> {line}" if line else ">" for line in shown.split("\n")],
            "",
        ]
    lines.insert(0, f"{len(reels)} videos; {changed} captions rewritten.\n")
    text = "\n".join(lines)
    if report:
        report.write_text(text, encoding="utf-8")
        _say(f"Wrote {report} ({len(reels)} videos, {changed} captions rewritten).")
    else:
        _say(text)
    return 0


def command_check(site: Site, reels: list[Reel]) -> int:
    sign_in(site)
    on_site = site.library()
    there = [reel for reel in reels if reel.key in on_site]
    missing = [reel for reel in reels if reel.key not in on_site]
    smallest = min(reels, key=lambda reel: reel.video.stat().st_size)
    sha256, md5 = file_hashes(smallest.video)
    try:
        site.upload_grant(
            {
                "content_type": VIDEO_CONTENT_TYPE,
                "size_bytes": smallest.video.stat().st_size,
                "sha256": sha256,
                "content_md5": md5,
                "duration_seconds": mp4_duration_seconds(smallest.video),
                "original_filename": smallest.video.name,
            }
        )
    except SiteError as error:
        _say(f"Storage is NOT ready: the site would not give an upload address ({error}).")
        _say("Nothing was uploaded.")
        return 1
    _say("Storage is ready: the site gave an upload address. Nothing was uploaded.")
    size = sum(reel.video.stat().st_size + reel.poster.stat().st_size for reel in missing)
    _say(f"{len(there)} of the {len(reels)} videos are already on the site; {len(missing)} to upload ({_megabytes(size)}).")
    return 0


def command_import(site: Site, reels: list[Reel], assume_yes: bool) -> int:
    sign_in(site)
    on_site = site.library()
    to_do = [reel for reel in reels if reel.key not in on_site or needs_finishing(on_site[reel.key])]
    _say(f"{len(reels)} videos in the folder; {len(reels) - len(to_do)} already on the site; {len(to_do)} to do.")
    if to_do and not assume_yes:
        answer = input(f"Type YES to put {len(to_do)} videos on {site.site}: ").strip()
        if answer != "YES":
            _say("Stopped. Nothing was changed.")
            return 1
    created = finished = skipped = failed = 0
    for number, reel in enumerate(reels, start=1):
        label = f"[{number:>2}/{len(reels)}] {reel.key}"
        existing = on_site.get(reel.key)
        if existing is not None and not needs_finishing(existing):
            skipped += 1
            _say(f"{label}  already on the site, skipped")
            continue
        try:
            if existing is None:
                item = upload_one(site, reel)
                site.finish(item["id"], reel.poster)
                created += 1
                _say(f"{label}  uploaded {_megabytes(reel.video.stat().st_size)} and shown: {reel.title}")
            else:
                site.finish(existing["id"], reel.poster)
                finished += 1
                _say(f"{label}  was hidden without its cover: cover added and shown")
        except SiteError as error:
            if error.status == 409 and "key already exists" in error.detail:
                skipped += 1
                _say(f"{label}  already on the site, skipped")
                continue
            failed += 1
            _say(f"{label}  FAILED: {error}")
            if error.status in (401, 403):
                _say("The sign-in was refused. Run the same command again: it carries on where it stopped.")
                break
        except (OSError, ValueError) as error:
            failed += 1
            _say(f"{label}  FAILED: {error}")
    _say()
    _say(f"Done: {created} created, {finished} finished, {skipped} skipped, {failed} failed.")
    if failed:
        _say("Run the same command again: it skips what is on the site and tries the rest.")
    return 1 if failed else 0


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(description="Put the Instagram videos on the site as reels.")
    parser.add_argument("command", choices=["preview", "check", "import"])
    parser.add_argument("--site", default=LIVE_SITE, help=f"the site (default {LIVE_SITE})")
    parser.add_argument("--folder", default=EXPORT_FOLDER, help="the export folder holding posts.json")
    parser.add_argument("--report", type=Path, help="preview: write the titles and captions to this file")
    parser.add_argument("--yes", action="store_true", help="import: do not ask before starting")
    args = parser.parse_args(argv)

    folder = Path(args.folder)
    if not (folder / "posts.json").is_file():
        _say(f"No posts.json in {folder}.")
        return 1
    reels = load_reels(folder)
    missing_files = [str(path) for reel in reels for path in (reel.video, reel.poster) if not path.is_file()]
    if missing_files:
        _say("These files are missing from the folder:\n  " + "\n  ".join(missing_files))
        return 1
    if args.command == "preview":
        return command_preview(reels, args.report)
    site = Site(args.site)
    _say(f"Site: {site.site}")
    try:
        if args.command == "check":
            return command_check(site, reels)
        return command_import(site, reels, args.yes)
    except SiteError as error:
        if error.status in (400, 401) and site.token is None:
            _say("The site refused that email or password.")
        else:
            _say(f"Stopped: {error}")
        return 1
    except KeyboardInterrupt:
        _say("\nStopped. Run the same command again to carry on.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
