from datetime import datetime
from pydantic import BaseModel, Field


#  Zodiac Sign Schemas


class ZodiacSignBase(BaseModel):
    name: str
    element: str
    modality: str
    ruling_planet: str
    date_range_start: str
    date_range_end: str
    core_trait: str
    signature_trait: str
    description: str | None = None


class ZodiacSignCreate(ZodiacSignBase):
    pass


class ZodiacSignUpdate(BaseModel):
    name: str | None = None
    element: str | None = None
    modality: str | None = None
    ruling_planet: str | None = None
    date_range_start: str | None = None
    date_range_end: str | None = None
    core_trait: str | None = None
    signature_trait: str | None = None
    description: str | None = None


class ZodiacSignResponse(ZodiacSignBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


#  Zodiac Compatibility Schemas


class ZodiacCompatibilityBase(BaseModel):
    sign_id_1: int
    sign_id_2: int
    love_percentage: int = Field(ge=0, le=100)
    communication_percentage: int = Field(ge=0, le=100)
    emotional_bond_percentage: int = Field(ge=0, le=100)
    overall_harmony_percentage: int = Field(ge=0, le=100)
    elemental_insight: str
    compatibility_description: str | None = None


class ZodiacCompatibilityCreate(ZodiacCompatibilityBase):
    pass


class ZodiacCompatibilityUpdate(BaseModel):
    sign_id_1: int | None = None
    sign_id_2: int | None = None
    love_percentage: int | None = Field(None, ge=0, le=100)
    communication_percentage: int | None = Field(None, ge=0, le=100)
    emotional_bond_percentage: int | None = Field(None, ge=0, le=100)
    overall_harmony_percentage: int | None = Field(None, ge=0, le=100)
    elemental_insight: str | None = None
    compatibility_description: str | None = None


class ZodiacCompatibilityResponse(ZodiacCompatibilityBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


#  Birthday Compatibility Request/Response


class BirthdayCompatibilityRequest(BaseModel):
    user_birthday: str = Field(
        ..., description="Format: DD/MM/YYYY", pattern=r"^\d{2}/\d{2}/\d{4}$"
    )
    partner_birthday: str = Field(
        ..., description="Format: DD/MM/YYYY", pattern=r"^\d{2}/\d{2}/\d{4}$"
    )


class SignCompatibilityRequest(BaseModel):
    sign_id_1: int
    sign_id_2: int


class CosmicBondResponse(BaseModel):
    user_sign: str
    partner_sign: str
    love_percentage: int
    communication_percentage: int
    emotional_bond_percentage: int
    overall_harmony_percentage: int
    elemental_insight: str
    compatibility_description: str | None = None


# Full Chart Response


class SignCompatibilityDetail(BaseModel):
    sign_name: str
    sign_id: int
    compatibility_percentage: int
    elemental_insight: str


class FullChartResponse(BaseModel):
    sign_name: str
    element: str
    modality: str
    ruling_planet: str
    date_range: str
    core_trait: str
    signature_trait: str
    description: str | None
    best_matches: list[SignCompatibilityDetail]
    good_matches: list[SignCompatibilityDetail]
    challenging_matches: list[SignCompatibilityDetail]
