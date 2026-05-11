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
    PsychicReviewSummary,
)
from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.models.user import User

router = APIRouter()


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


@router.get("/psychic/{psychic_id}", response_model=List[ReviewResponse])
def get_psychic_reviews_endpoint(
    psychic_id: int,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """
    Get all reviews for a specific psychic.

    Returns reviews sorted by creation date (newest first).
    """
    reviews = get_psychic_reviews(db, psychic_id, skip=skip, limit=limit)

    # Add usernames to response
    response_data = []
    for review in reviews:
        review_dict = jsonable_encoder(review)
        review_dict["username"] = review.user.username if review.user else None
        response_data.append(review_dict)

    return JSONResponse(content=response_data)


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


@router.get("/my-reviews", response_model=List[ReviewResponse])
def get_my_reviews_endpoint(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all reviews written by the current user.

    Returns reviews sorted by creation date (newest first).
    """
    reviews = get_user_reviews(db, current_user.id, skip=skip, limit=limit)

    # Add usernames
    response_data = []
    for review in reviews:
        review_dict = jsonable_encoder(review)
        review_dict["username"] = current_user.username
        response_data.append(review_dict)

    return JSONResponse(content=response_data)


@router.get("/{review_id}", response_model=ReviewResponse)
def get_review_endpoint(
    review_id: int,
    db: Session = Depends(get_db),
):
    """Get a specific review by ID."""
    review = get_review(db, review_id)

    response_data = jsonable_encoder(review)
    response_data["username"] = review.user.username if review.user else None

    return JSONResponse(content=response_data)


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
