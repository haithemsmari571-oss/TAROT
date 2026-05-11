from datetime import datetime
from pydantic import BaseModel, Field


# Life Path Number Schemas


class LifePathNumberBase(BaseModel):
    number: int = Field(ge=1, le=33)
    title: str
    description: str
    core_strengths: dict
    growth_areas: dict


class LifePathNumberCreate(LifePathNumberBase):
    pass


class LifePathNumberUpdate(BaseModel):
    number: int | None = Field(None, ge=1, le=33)
    title: str | None = None
    description: str | None = None
    core_strengths: dict | None = None
    growth_areas: dict | None = None


class LifePathNumberResponse(LifePathNumberBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


#  Life Path Compatibility Schemas


class LifePathCompatibilityBase(BaseModel):
    life_path_id_1: int
    life_path_id_2: int
    compatibility_score: int = Field(ge=0, le=100)
    compatibility_description: str | None = None


class LifePathCompatibilityCreate(LifePathCompatibilityBase):
    pass


class LifePathCompatibilityUpdate(BaseModel):
    life_path_id_1: int | None = None
    life_path_id_2: int | None = None
    compatibility_score: int | None = Field(None, ge=0, le=100)
    compatibility_description: str | None = None


class LifePathCompatibilityResponse(LifePathCompatibilityBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


#  Life Path Reading Request/Response


class LifePathReadingRequest(BaseModel):
    birthdate: str = Field(
        ..., description="Format: DD/MM/YYYY", pattern=r"^\d{2}/\d{2}/\d{4}$"
    )


class CompatibleLifePath(BaseModel):
    number: int
    title: str
    compatibility_score: int


class LifePathReadingResponse(BaseModel):
    life_path_number: int
    title: str
    description: str
    core_strengths: list[str]
    growth_areas: list[str]
    compatible_life_paths: list[CompatibleLifePath]
