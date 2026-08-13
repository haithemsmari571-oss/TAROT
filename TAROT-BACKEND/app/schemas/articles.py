from pydantic import BaseModel, Field, field_validator
from typing import Literal
from urllib.parse import urlparse
import re

CATEGORIES = {"Numerology", "Tarot", "Love & Relationships", "Psychic Guidance"}


class ArticleDraftInput(BaseModel):
    slug: str = Field(min_length=3, max_length=180)
    category: str
    title: str = Field(min_length=3, max_length=220)
    excerpt: str = Field(min_length=10, max_length=500)
    body: str = Field(min_length=20, max_length=100_000)
    body_format: Literal["markdown", "html"] = "markdown"
    author: str = Field(min_length=2, max_length=120)
    seo_title: str = Field(default="", max_length=220)
    meta_description: str = Field(default="", max_length=320)
    canonical_override: str | None = Field(default=None, max_length=500)
    cover_image: str | None = Field(default=None, max_length=500)
    cover_alt: str | None = Field(default=None, max_length=300)
    social_image: str | None = Field(default=None, max_length=500)
    series_name: str | None = Field(default=None, max_length=180)
    series_part: int | None = Field(default=None, ge=1, le=999)
    featured: bool = False
    calculator_cta: str | None = None
    reading_cta: str | None = None
    related_slugs: list[str] = Field(default_factory=list, max_length=12)
    idempotency_key: str = Field(min_length=12, max_length=80)
    expected_latest_version: int | None = Field(default=None, ge=0)

    @field_validator("slug")
    @classmethod
    def valid_slug(cls, value):
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value):
            raise ValueError("Use lowercase words separated by hyphens.")
        return value

    @field_validator("category")
    @classmethod
    def valid_category(cls, value):
        if value not in CATEGORIES:
            raise ValueError("Choose a supported article category.")
        return value

    @field_validator("canonical_override")
    @classmethod
    def valid_canonical_url(cls, value):
        if value in (None, ""):
            return None
        if value != value.strip() or re.search(r"[\x00-\x1f\x7f]", value):
            raise ValueError("Use a clean HTTPS URL without spaces or control characters.")
        parsed = urlparse(value)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
            raise ValueError("Use a complete HTTPS URL without embedded credentials.")
        try:
            parsed.port
        except ValueError as error:
            raise ValueError("Use a valid HTTPS URL.") from error
        return value

    @field_validator("cover_image", "social_image")
    @classmethod
    def valid_image_url(cls, value):
        if value in (None, ""):
            return None
        if value != value.strip() or re.search(r"[\x00-\x1f\x7f]", value):
            raise ValueError("Use a clean image address without spaces or control characters.")
        if re.fullmatch(r"/api/media/uploads/article_[a-f0-9-]+\.(?:jpg|jpeg|png|webp)", value):
            return value
        parsed = urlparse(value)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
            raise ValueError("Choose an uploaded article image or a complete HTTPS image URL.")
        return value

    @field_validator("cover_alt", "series_name")
    @classmethod
    def clean_optional_text(cls, value):
        if value in (None, ""):
            return None
        return value.strip()

    @field_validator("related_slugs")
    @classmethod
    def valid_related_slugs(cls, values):
        if len(set(values)) != len(values):
            raise ValueError("Choose each related article once.")
        if any(not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value) for value in values):
            raise ValueError("Related article addresses must be lowercase slugs.")
        return values

    @field_validator("calculator_cta")
    @classmethod
    def valid_calculator_cta(cls, value):
        if value not in (None, "", "numerology"):
            raise ValueError("Choose a supported calculator link.")
        return value or None

    @field_validator("reading_cta")
    @classmethod
    def valid_reading_cta(cls, value):
        if value not in (None, "", "personal-reading"):
            raise ValueError("Choose a supported reading link.")
        return value or None


class ArticleTransitionInput(BaseModel):
    idempotency_key: str = Field(min_length=12, max_length=80)
    expected_status: Literal["draft", "published", "archived"]
    expected_version_id: int | None = None
