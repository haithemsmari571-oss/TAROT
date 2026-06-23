from datetime import time
import json
from typing import List, Optional, Generic, TypeVar

from pydantic import (
    BaseModel,
    EmailStr,
    field_validator,
    model_validator,
)

from app.schemas.psychic_availability import PsychicAvailiabilityCreate

T = TypeVar("T")


class PsychicBase(BaseModel):
    username: str
    email: EmailStr
    price_per_second: float | None = None
    bio: str | None = None
    order: int | None = None


class PsychicCategoryRead(BaseModel):
    id: int
    title: str


class PsychicAvailabilityRead(BaseModel):
    id: int
    day_of_the_week: str
    start_at: time
    end_at: time


class PsychicRead(PsychicBase):
    id: int
    is_verified: bool
    categories: List[PsychicCategoryRead]
    availability: List[PsychicAvailabilityRead]
    profile_picture_url: str | None = None
    is_online: bool

    class Config:
        from_attributes = True


class PsychicCreate(PsychicBase):
    is_online: bool
    password: str
    categories_ids: List[int]
    availability: List[PsychicAvailiabilityCreate]

    @model_validator(mode="before")
    @classmethod
    def validate_to_json(cls, value):
        if isinstance(value, str):
            return cls(**json.loads(value))
        return value


class PsychicUpdate(BaseModel):
    email: EmailStr | None = None
    is_online: bool | None = None
    price_per_second: float | None = None
    categories_ids: List[int] | None = None
    availabilities_create: List[PsychicAvailiabilityCreate] | None = None
    availabilities_ids_to_remove: List[int] | None = None
    bio: str | None = None
    order: int | None = None  # ✅ Captured field

    @field_validator("order", mode="before")
    @classmethod
    def prevent_empty_string_crash(cls, value):
        if value == "" or value is None:
            return 9999
        try:
            return int(value)
        except (TypeError, ValueError):
            return 9999

    @model_validator(mode="before")
    @classmethod
    def validate_to_json(cls, value):
        if isinstance(value, str):
            return json.loads(value)
        return value


class PsychicFilter(BaseModel):
    is_online: Optional[bool] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    categories_ids: Optional[str] = None
    search: Optional[str] = None
    skip: int = 0
    limit: int = 0

    @field_validator("categories_ids", mode="after")
    @classmethod
    def parse_categories(cls, value):
        if isinstance(value, str):
            return [int(x.strip()) for x in value.split(",") if x.strip()]
        if isinstance(value, list):
            return [int(x) for x in value]
        return value


class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    skip: int
    limit: int
