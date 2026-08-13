import pytest
from pydantic import ValidationError

from app.schemas.articles import ArticleDraftInput


BASE = {
    "slug": "synthetic-numerology-guide",
    "category": "Numerology",
    "title": "A synthetic numerology guide",
    "excerpt": "Synthetic copy used only to verify the private draft contract.",
    "body": "## A safe heading\n\nThis is synthetic Markdown content with <script>alert(1)</script> kept as inert text.",
    "author": "Synthetic Editor",
    "seo_title": "Synthetic Numerology Guide",
    "meta_description": "A sufficiently long synthetic description used to validate the article draft schema.",
    "idempotency_key": "synthetic-test-key-0001",
}


def test_article_schema_accepts_safe_synthetic_draft():
    draft = ArticleDraftInput(**BASE)
    assert draft.slug == "synthetic-numerology-guide"
    assert draft.category == "Numerology"


@pytest.mark.parametrize("slug", ["UPPER", "../escape", "spaces are unsafe"])
def test_article_slug_rejects_unsafe_or_unstable_forms(slug):
    with pytest.raises(ValidationError):
        ArticleDraftInput(**{**BASE, "slug": slug})


def test_article_category_is_closed_to_supported_public_taxonomy():
    with pytest.raises(ValidationError):
        ArticleDraftInput(**{**BASE, "category": "Thin SEO Dump"})


@pytest.mark.parametrize("field", ["canonical_override", "social_image"])
@pytest.mark.parametrize("value", ["http://example.com/page", "javascript:alert(1)", "https://user:secret@example.com/page"])
def test_article_external_urls_require_credential_free_https(field, value):
    with pytest.raises(ValidationError):
        ArticleDraftInput(**{**BASE, field: value})
