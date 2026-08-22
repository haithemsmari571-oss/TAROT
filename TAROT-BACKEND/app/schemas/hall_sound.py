from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

MAX_HALL_SOUND_NAME_LENGTH = 18


class HallSoundPublic(BaseModel):
    """Exactly what the site needs to offer and play a loop. Nothing else."""

    model_config = ConfigDict(extra="forbid")

    key: str
    name: str
    url: str
    level: float


class HallSoundAdmin(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    name: str
    sort_order: int
    enabled: bool
    file_path: str
    url: str
    content_type: str
    size_bytes: int
    sha256: str
    duration_seconds: float
    level: float
    original_filename: str | None
    created_at: datetime
    updated_at: datetime


class HallSoundUpdate(BaseModel):
    """Only the owner-editable fields. The key and the file are set once at upload."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=MAX_HALL_SOUND_NAME_LENGTH)
    sort_order: int | None = None
    enabled: bool | None = None
    level: float | None = Field(default=None, ge=0.0, le=1.0)
