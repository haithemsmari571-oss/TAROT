from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from typing import List

from app.services.reviews import (
    get_review,
    get_psychic_reviews,
    get_user_reviews,
    create_review,
    update_review,
    delete_review,
    get_psychic_review_summary,
)
from app.schemas.review import (
    ReviewCreate,
    ReviewUpdate,
    ReviewResponse,
    PublicReviewResponse,
    MyReviewResponse,
    PsychicReviewSummary,
)
from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.models.review import Review
from app.models.user import User

router = APIRouter()


def _public_review_fields(review: Review, writer_username: str | None) -> dict:
    """Field by field, never jsonable_encoder(review): the services load the
    writer's or the reader's whole users row onto the review, and encoding
    the object would put that row (email, password_hash and the rest) in the
    JSON. The writer is her first letter only, for example "S."."""
    name = (writer_username or "").strip()
    return {
        "id": review.id,
        "psychic_id": review.psychic_id,
        "rating": review.rating,
        "comment": review.comment,
        "created_at": review.created_at,
        "username": f"{name[0].upper()}." if name else None,
    }


@router.post("/", response_model=ReviewResponse)
def create_review_endpoint(
    review: ReviewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new review for a psychic.

    - Users can only review psychics (not other users)
    - Users cannot review themselves
    - Users can only review each psychic once
    """
    new_review = create_review(db, current_user.id, review)

    # Add username to response
    response_data = jsonable_encoder(new_review)
    response_data["username"] = current_user.username

    return JSONResponse(content=response_data)


@router.get("/psychic/{psychic_id}", response_model=List[PublicReviewResponse])
def get_psychic_reviews_endpoint(
    psychic_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """
    Get all reviews for a specific psychic.

    Returns reviews sorted by creation date (newest first). Public, so each
    review carries only PublicReviewResponse's fields.
    """
    reviews = get_psychic_reviews(db, psychic_id, skip=skip, limit=limit)
    return [
        PublicReviewResponse(
            **_public_review_fields(review, review.user.username if review.user else None)
        )
        for review in reviews
    ]


@router.get("/psychic/{psychic_id}/summary", response_model=PsychicReviewSummary)
def get_psychic_review_summary_endpoint(
    psychic_id: int,
    db: Session = Depends(get_db),
):
    """
    Get review summary statistics for a psychic.

    Returns:
    - Total number of reviews
    - Average rating
    - Rating distribution (count per star rating)
    """
    summary = get_psychic_review_summary(db, psychic_id)
    return JSONResponse(content=jsonable_encoder(summary))


@router.get("/my-reviews", response_model=List[MyReviewResponse])
def get_my_reviews_endpoint(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all reviews written by the current user.

    Returns reviews sorted by creation date (newest first), each with
    MyReviewResponse's fields only.
    """
    reviews = get_user_reviews(db, current_user.id, skip=skip, limit=limit)
    return [
        MyReviewResponse(
            **_public_review_fields(review, current_user.username),
            psychic_name=review.psychic.username if review.psychic else None,
        )
        for review in reviews
    ]


@router.get("/{review_id}", response_model=PublicReviewResponse)
def get_review_endpoint(
    review_id: int,
    db: Session = Depends(get_db),
):
    """Get a specific review by ID. Public, so PublicReviewResponse's fields only."""
    review = get_review(db, review_id)
    return PublicReviewResponse(
        **_public_review_fields(review, review.user.username if review.user else None)
    )


@router.put("/{review_id}", response_model=ReviewResponse)
def update_review_endpoint(
    review_id: int,
    review_data: ReviewUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update a review.

    Users can only update their own reviews.
    """
    updated_review = update_review(db, review_id, current_user.id, review_data)

    response_data = jsonable_encoder(updated_review)
    response_data["username"] = current_user.username

    return JSONResponse(content=response_data)


@router.delete("/{review_id}")
def delete_review_endpoint(
    review_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a review.

    Users can only delete their own reviews.
    """
    delete_review(db, review_id, current_user.id)
    return JSONResponse(content={"message": "Review deleted successfully"})
