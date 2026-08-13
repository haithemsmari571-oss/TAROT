"""Safe rendering helpers for owner-authored article content.

Existing versions remain Markdown. New visual-editor versions are stored as
sanitized HTML and carry an explicit ``body_format`` so version history is
never rewritten or guessed.
"""

from html import escape
from html.parser import HTMLParser
import re

import bleach


ALLOWED_TAGS = {
    "p", "h2", "h3", "strong", "em", "ul", "ol", "li", "blockquote",
    "a", "img", "br", "hr",
}
ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "title"],
}
ALLOWED_PROTOCOLS = {"https", "mailto"}


def _safe_link_attributes(attrs: dict[tuple[str, str], str | None], new: bool = False):
    """Bleach callback: external links cannot control the opener window."""
    href = attrs.get((None, "href"), "") or ""
    if href.startswith("https://"):
        attrs[(None, "target")] = "_blank"
        attrs[(None, "rel")] = "noopener noreferrer"
    return attrs


def sanitize_article_html(value: str) -> str:
    cleaned = bleach.clean(
        value,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
        strip_comments=True,
    )
    return bleach.linkifier.Linker(callbacks=[_safe_link_attributes]).linkify(cleaned)


def render_legacy_markdown(value: str) -> str:
    """Render the small safe Markdown subset used by the original CMS."""
    blocks: list[str] = []
    for raw in re.split(r"\n{2,}", value):
        text = raw.strip()
        if not text:
            continue
        if text.startswith("## "):
            blocks.append(f"<h2>{escape(text[3:])}</h2>")
        elif text.startswith("# "):
            # An article body never needs a second H1.
            blocks.append(f"<h2>{escape(text[2:])}</h2>")
        elif text.startswith("> "):
            blocks.append(f"<blockquote>{escape(text[2:])}</blockquote>")
        else:
            blocks.append(f"<p>{escape(text).replace(chr(10), '<br>')}</p>")
    return "".join(blocks)


def _slugify_heading(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    return slug[:80] or "section"


def _add_heading_ids(value: str) -> tuple[str, list[dict[str, str | int]]]:
    seen: dict[str, int] = {}
    toc: list[dict[str, str | int]] = []

    def replace(match: re.Match[str]) -> str:
        level = int(match.group(1))
        inner = match.group(2)
        text = re.sub(r"<[^>]+>", "", inner)
        base = _slugify_heading(text)
        seen[base] = seen.get(base, 0) + 1
        anchor = base if seen[base] == 1 else f"{base}-{seen[base]}"
        toc.append({"level": level, "text": text, "id": anchor})
        return f'<h{level} id="{anchor}">{inner}</h{level}>'

    rendered = re.sub(r"<h([23])>(.*?)</h\1>", replace, value, flags=re.IGNORECASE | re.DOTALL)
    return rendered, toc


def render_article_body(value: str, body_format: str) -> tuple[str, list[dict[str, str | int]]]:
    if body_format == "html":
        rendered = sanitize_article_html(value)
    else:
        rendered = render_legacy_markdown(value)
    return _add_heading_ids(rendered)


class _TextCounter(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def estimated_reading_minutes(value: str, body_format: str) -> int:
    rendered, _ = render_article_body(value, body_format)
    parser = _TextCounter()
    parser.feed(rendered)
    word_count = len(re.findall(r"\b[\w'-]+\b", " ".join(parser.parts), flags=re.UNICODE))
    return max(1, round(word_count / 220))
