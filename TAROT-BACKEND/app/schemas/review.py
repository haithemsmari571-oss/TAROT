from datetime import datetime
from pydantic import BaseModel, Field


#  Review Schemas


class ReviewBase(BaseModel):
    psychic_id: int
    rating: int = Field(ge=1, le=5, description="Rating from 1 to 5 stars")
    comment: str | None = Field(None, max_length=1000)


class ReviewCreate(ReviewBase):
    pass


class ReviewUpdate(BaseModel):
    rating: int | None = Field(None, ge=1, le=5, description="Rating from 1 to 5 stars")
    comment: str | None = Field(None, max_length=1000)


class ReviewResponse(ReviewBase):
    id: int
    user_id: int
    username: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


#  Psychic Review Summary


class PsychicReviewSummary(BaseModel):
    psychic_id: int
    total_reviews: int
    average_rating: float
    rating_distribution: dict[int, int]  # {5: 10, 4: 5, 3: 2, 2: 1, 1: 0}
