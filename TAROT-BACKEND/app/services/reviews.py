from typing import List
from sqlalchemy import select, func, and_
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError

from app.exceptions.reviews import (
    ReviewNotFoundError,
    UnauthorizedReviewAccessError,
    InvalidPsychicError,
    CannotReviewSelfError,
    DuplicateReviewError,
)
from app.models.review import Review
from app.models.user import User
from app.enums.role import Role
from app.schemas.review import ReviewCreate, ReviewUpdate, PsychicReviewSummary


def get_review(db: Session, review_id: int) -> Review:
    """Get a review by ID."""
    review = db.get(Review, review_id)
    if review is None:
        raise ReviewNotFoundError(review_id=review_id)
    return review


def get_psychic_reviews(
    db: Session, psychic_id: int, skip: int = 0, limit: int = 100
) -> List[Review]:
    """Get all reviews for a specific psychic."""
    stmt = (
        select(Review)
        .where(Review.psychic_id == psychic_id)
        .options(joinedload(Review.user))
        .order_by(Review.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(db.scalars(stmt))


def get_user_reviews(
    db: Session, user_id: int, skip: int = 0, limit: int = 100
) -> List[Review]:
    """Get all reviews written by a specific user."""
    stmt = (
        select(Review)
        .where(Review.user_id == user_id)
        .options(joinedload(Review.psychic))
        .order_by(Review.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return list(db.scalars(stmt))


def create_review(db: Session, user_id: int, review_data: ReviewCreate) -> Review:
    """Create a new review."""
    # Check if psychic exists and is actually a psychic
    psychic = db.get(User, review_data.psychic_id)
    if not psychic or psychic.role != Role.PSYCHIC:
        raise InvalidPsychicError()

    # Check if user is trying to review themselves
    if user_id == review_data.psychic_id:
        raise CannotReviewSelfError()

    # Check if user already reviewed this psychic
    existing_review = db.scalar(
        select(Review).where(
            and_(Review.user_id == user_id, Review.psychic_id == review_data.psychic_id)
        )
    )
    if existing_review:
        raise DuplicateReviewError()

    review = Review(
        user_id=user_id,
        psychic_id=review_data.psychic_id,
        rating=review_data.rating,
        comment=review_data.comment,
    )
    db.add(review)
    try:
        db.commit()
        db.refresh(review)
    except IntegrityError:
        db.rollback()
        raise
    return review


def update_review(
    db: Session, review_id: int, user_id: int, review_data: ReviewUpdate
) -> Review:
    """Update a review (only by the user who created it)."""
    review = get_review(db, review_id)

    # Check if user owns this review
    if review.user_id != user_id:
        raise UnauthorizedReviewAccessError()

    # Update fields
    for field, value in review_data.model_dump(exclude_unset=True).items():
        setattr(review, field, value)

    db.commit()
    db.refresh(review)
    return review


def delete_review(db: Session, review_id: int, user_id: int) -> None:
    """Delete a review (only by the user who created it)."""
    review = get_review(db, review_id)

    # Check if user owns this review
    if review.user_id != user_id:
        raise UnauthorizedReviewAccessError()

    db.delete(review)
    db.commit()


def get_psychic_review_summary(db: Session, psychic_id: int) -> PsychicReviewSummary:
    """Get summary statistics for a psychic's reviews."""
    # Get total reviews and average rating
    stats = db.execute(
        select(
            func.count(Review.id).label("total"),
            func.avg(Review.rating).label("average"),
        ).where(Review.psychic_id == psychic_id)
    ).first()

    total_reviews = stats.total or 0
    average_rating = float(stats.average) if stats.average else 0.0

    # Get rating distribution
    rating_dist_query = db.execute(
        select(Review.rating, func.count(Review.id).label("count"))
        .where(Review.psychic_id == psychic_id)
        .group_by(Review.rating)
    )

    # Initialize all ratings to 0
    rating_distribution = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
    for row in rating_dist_query:
        rating_distribution[row.rating] = row.count

    return PsychicReviewSummary(
        psychic_id=psychic_id,
        total_reviews=total_reviews,
        average_rating=round(average_rating, 2),
        rating_distribution=rating_distribution,
    )
