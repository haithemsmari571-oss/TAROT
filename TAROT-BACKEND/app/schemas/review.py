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


class PublicReviewResponse(BaseModel):
    """A review as a public page shows it, and nothing more. The writer is her
    first letter only (for example "S."), under the key the old pages already
    read (PsychicDetails.tsx and MyReviews.tsx show review.username)."""

    id: int
    psychic_id: int
    rating: int
    comment: str | None = None
    created_at: datetime
    username: str | None = None


class MyReviewResponse(PublicReviewResponse):
    """Her own review, plus the reader's display name (her username, as the
    inbox serves it at services/client_inbox.py:139)."""

    psychic_name: str | None = None


#  Psychic Review Summary


class PsychicReviewSummary(BaseModel):
    psychic_id: int
    total_reviews: int
    average_rating: float
    rating_distribution: dict[int, int]  # {5: 10, 4: 5, 3: 2, 2: 1, 1: 0}
