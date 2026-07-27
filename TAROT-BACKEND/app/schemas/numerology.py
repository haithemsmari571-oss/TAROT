from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class NumerologyProfileRequest(BaseModel):
    birth_date: str = Field(min_length=8, max_length=10)
    full_name: str | None = Field(default=None, max_length=160)
    y_consonant_indexes: list[int] = Field(default_factory=list)
    as_of: date = Field(default_factory=date.today)


class FullReadingRequest(BaseModel):
    """Public request. Client-calculated values are deliberately not accepted."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    date_of_birth: str = Field(alias="dateOfBirth", min_length=10, max_length=10)
    full_name: str | None = Field(default=None, alias="fullName", max_length=160)
    y_consonant_indexes: list[int] = Field(
        default_factory=list, alias="yConsonantIndexes", max_length=16
    )
    locale: Literal["en-GB"] = "en-GB"

    @field_validator("full_name")
    @classmethod
    def tidy_optional_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split())
        return cleaned or None


class StrictReportModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LifePathReading(StrictReportModel):
    central_character: str = Field(min_length=40)
    natural_strengths: list[str] = Field(min_length=2, max_length=8)
    challenges: list[str] = Field(min_length=1, max_length=8)
    growth_lessons: list[str] = Field(min_length=1, max_length=8)
    practical_guidance: list[str] = Field(min_length=1, max_length=8)


class BirthdayNumberReading(StrictReportModel):
    overview: str = Field(min_length=40)
    natural_gifts: list[str] = Field(min_length=1, max_length=6)
    growth_edge: str = Field(min_length=30)


class PersonalYearReading(StrictReportModel):
    current_period: str = Field(min_length=20)
    central_theme: str = Field(min_length=40)
    relationships: str = Field(min_length=30)
    work_money: str = Field(min_length=30)
    opportunities: list[str] = Field(min_length=1, max_length=8)
    cautions: list[str] = Field(min_length=1, max_length=8)
    practical_timing_guidance: list[str] = Field(min_length=1, max_length=8)


class NumerologyGridReading(StrictReportModel):
    overview: str = Field(min_length=40)
    arrows: list[str] = Field(default_factory=list, max_length=12)
    practical_guidance: list[str] = Field(default_factory=list, max_length=8)


class NameNumerologyReading(StrictReportModel):
    expression_destiny: str = Field(min_length=40)
    soul_urge: str = Field(min_length=40)
    personality: str = Field(min_length=40)
    synthesis: str = Field(min_length=40)


class RelationshipsReading(StrictReportModel):
    overview: str = Field(min_length=40)
    strengths: list[str] = Field(min_length=1, max_length=8)
    watch_points: list[str] = Field(min_length=1, max_length=8)
    guidance: list[str] = Field(min_length=1, max_length=8)


class CareerPurposeMoneyReading(StrictReportModel):
    overview: str = Field(min_length=40)
    natural_contributions: list[str] = Field(min_length=1, max_length=8)
    money_patterns: list[str] = Field(min_length=1, max_length=8)
    practical_guidance: list[str] = Field(min_length=1, max_length=8)


class CombinedSynthesisReading(StrictReportModel):
    overview: str = Field(min_length=60)
    reinforcing_patterns: list[str] = Field(min_length=1, max_length=8)
    creative_tensions: list[str] = Field(min_length=1, max_length=8)
    integration: str = Field(min_length=40)


class PracticalGuidanceReading(StrictReportModel):
    priorities: list[str] = Field(min_length=2, max_length=10)
    next_steps: list[str] = Field(min_length=2, max_length=10)
    timing_notes: list[str] = Field(min_length=1, max_length=8)


class NumerologyReport(StrictReportModel):
    personal_overview: str = Field(min_length=80)
    life_path: LifePathReading
    birthday_number: BirthdayNumberReading
    personal_year: PersonalYearReading
    numerology_grid: NumerologyGridReading | None = None
    name_numerology: NameNumerologyReading | None = None
    relationships: RelationshipsReading
    career_purpose_money: CareerPurposeMoneyReading
    combined_synthesis: CombinedSynthesisReading
    practical_guidance: PracticalGuidanceReading
    reflection_questions: list[str] = Field(min_length=3, max_length=12)
    disclaimer: str = Field(min_length=40)


class FullReadingResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    calculation_snapshot: dict[str, Any] = Field(alias="calculationSnapshot")
    report: NumerologyReport
    calculation_version: str = Field(alias="calculationVersion")
    prompt_key: str = Field(alias="promptKey")
    prompt_version: int = Field(alias="promptVersion")
    model: str
    generated_at: datetime = Field(alias="generatedAt")
    cached: bool
