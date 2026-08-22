from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


MAX_LIBRARY_ITEM_TYPE_LENGTH = 80
MAX_LIBRARY_ITEM_TITLE_LENGTH = 100


class LibraryItemPublic(BaseModel):
    """The complete and deliberately narrow public library contract."""

    model_config = ConfigDict(extra="forbid")

    key: str
    type: str
    title: str
    description: str | None
    audio_url: str
    cover_url: str | None
    duration_seconds: float
    published_at: datetime


class LibraryItemAdmin(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    type: str
    title: str
    description: str | None
    audio_file_path: str
    audio_url: str
    audio_content_type: str
    audio_size_bytes: int
    audio_sha256: str
    duration_seconds: float
    cover_image_path: str | None
    cover_url: str | None
    cover_content_type: str | None
    cover_size_bytes: int | None
    sort_order: int
    enabled: bool
    published_at: datetime | None
    original_filename: str | None
    created_at: datetime
    updated_at: datetime


class LibraryItemUpdate(BaseModel):
    """Editable metadata only. The stable key is intentionally absent."""

    model_config = ConfigDict(extra="forbid")

    type: str | None = Field(default=None, min_length=1, max_length=MAX_LIBRARY_ITEM_TYPE_LENGTH)
    title: str | None = Field(default=None, min_length=1, max_length=MAX_LIBRARY_ITEM_TITLE_LENGTH)
    description: str | None = None
    sort_order: int | None = None
    enabled: bool | None = None
    published_at: datetime | None = None

    @field_validator("type", "title")
    @classmethod
    def strip_required_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @model_validator(mode="after")
    def required_text_cannot_be_cleared(self):
        for field in ("type", "title"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be cleared")
        return self
