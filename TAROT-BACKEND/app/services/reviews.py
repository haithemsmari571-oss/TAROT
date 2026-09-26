from typing import List
from sqlalchemy import select, func, and_
from sqlalchemy.orm import Session, aliased, joinedload
from sqlalchemy.exc import IntegrityError

from app.exceptions.domain import DomainError
from app.exceptions.reviews import (
    ReviewNotFoundError,
    UnauthorizedReviewAccessError,
    InvalidPsychicError,
    CannotReviewSelfError,
    DuplicateReviewError,
    ReviewNotEarnedError,
)
from app.models.chat import Chat
from app.models.message import Message
from app.models.review import Review, REVIEW_APPROVED, REVIEW_PENDING
from app.models.transaction import Transaction
from app.models.user import User
from app.enums.author_type import AuthorType
from app.enums.role import Role
from app.enums.transaction_status import TransactionStatus
from app.enums.transaction_type import TransactionType
from app.schemas.review import ReviewCreate, ReviewUpdate, PsychicReviewSummary


def get_review(db: Session, review_id: int) -> Review:
    """Get a review by ID."""
    review = db.get(Review, review_id)
    if review is None:
        raise ReviewNotFoundError(review_id=review_id)
    return review


def get_public_review(db: Session, review_id: int) -> Review:
    """A review as anyone may read it: approved, or not found."""
    review = db.get(Review, review_id)
    if review is None or review.status != REVIEW_APPROVED:
        raise ReviewNotFoundError(review_id=review_id)
    return review


def get_psychic_reviews(
    db: Session, psychic_id: int, skip: int = 0, limit: int = 100
) -> List[Review]:
    """Get the approved reviews for a specific psychic."""
    stmt = (
        select(Review)
        .where(Review.psychic_id == psychic_id, Review.status == REVIEW_APPROVED)
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


def get_reviews_for_owner(
    db: Session, status: str | None = None, skip: int = 0, limit: int = 100
) -> List[Review]:
    """The owner's list: every review, or those in one status, newest first,
    with the writer and the reader loaded."""
    stmt = (
        select(Review)
        .options(joinedload(Review.user), joinedload(Review.psychic))
        .order_by(Review.created_at.desc(), Review.id.desc())
        .offset(skip)
        .limit(limit)
    )
    if status is not None:
        stmt = stmt.where(Review.status == status)
    return list(db.scalars(stmt))


def has_answered_paid_message(db: Session, client_id: int, psychic_id: int) -> bool:
    """Whether the reader has answered at least one of this client's paid messages.

    Paid: the message's msg_fee debit is still COMPLETED, so a refunded one
    (REVERSED) does not count. Answered: after that message, the same chat
    holds a message from the reader that is not the opener or a system row
    (the opener is author_type SYSTEM, per_message_start.py), and is not the
    notice that a failed reply was refunded (reading_single.py)."""
    from app.services.ai.reading_single import UNREACHABLE_NOTICE

    reply = aliased(Message)
    answered = (
        select(Transaction.id)
        .join(Chat, Chat.id == Transaction.related_chat_id)
        .join(reply, reply.chat_id == Chat.id)
        .where(
            Transaction.user_id == client_id,
            Transaction.transaction_type == TransactionType.DEBIT,
            Transaction.status == TransactionStatus.COMPLETED,
            Transaction.idempotency_key.like("msg_fee:%"),
            Chat.user_id == client_id,
            Chat.psychic_id == psychic_id,
            reply.sender_id == psychic_id,
            reply.is_system.is_(False),
            reply.author_type != AuthorType.SYSTEM,
            reply.content != UNREACHABLE_NOTICE,
            reply.id > Transaction.related_message_id,
        )
        .limit(1)
    )
    return db.scalar(answered) is not None


def review_refusal(db: Session, user: User, psychic_id: int) -> DomainError | None:
    """Why this user may not write a new review of this reader, or None.

    The one rule, for create_review and for the reader profile's can_review
    (services/psychics.py, read_psychic)."""
    # Check if psychic exists and is actually a psychic
    psychic = db.get(User, psychic_id)
    if not psychic or psychic.role != Role.PSYCHIC:
        return InvalidPsychicError()

    # Check if user is trying to review themselves
    if user.id == psychic_id:
        return CannotReviewSelfError()

    # A client, after the reader has answered one of her paid messages
    if user.role != Role.USER or not has_answered_paid_message(db, user.id, psychic_id):
        return ReviewNotEarnedError()

    # Check if user already reviewed this psychic
    existing_review = db.scalar(
        select(Review).where(
            and_(Review.user_id == user.id, Review.psychic_id == psychic_id)
        )
    )
    if existing_review:
        return DuplicateReviewError()
    return None


def may_review(db: Session, user: User | None, psychic_id: int) -> bool:
    """Whether this viewer may write a new review of this reader now."""
    return user is not None and review_refusal(db, user, psychic_id) is None


def create_review(db: Session, user: User, review_data: ReviewCreate) -> Review:
    """Create a new review. It waits, pending, for the owner's approval."""
    refusal = review_refusal(db, user, review_data.psychic_id)
    if refusal is not None:
        raise refusal

    review = Review(
        user_id=user.id,
        psychic_id=review_data.psychic_id,
        rating=review_data.rating,
        comment=review_data.comment,
        status=REVIEW_PENDING,
    )
    db.add(review)
    try:
        db.commit()
        db.refresh(review)
    except IntegrityError:
        db.rollback()
        # Two sends at once: the database's one-review-per-reader pair
        # (unique_user_psychic_review) refused the second.
        if db.scalar(
            select(Review.id).where(
                Review.user_id == user.id, Review.psychic_id == review_data.psychic_id
            )
        ) is not None:
            raise DuplicateReviewError()
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
    changed = False
    for field, value in review_data.model_dump(exclude_unset=True).items():
        changed = changed or getattr(review, field) != value
        setattr(review, field, value)
    # New words wait for the owner again, as a new review does.
    if changed:
        review.status = REVIEW_PENDING

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


def set_review_status(db: Session, review_id: int, status: str) -> Review:
    """The owner's word on a review: approved shows it, hidden keeps it off."""
    review = get_review(db, review_id)
    review.status = status
    db.commit()
    db.refresh(review)
    return review


def get_psychic_review_summary(db: Session, psychic_id: int) -> PsychicReviewSummary:
    """Get summary statistics for a psychic's approved reviews."""
    # Get total reviews and average rating
    stats = db.execute(
        select(
            func.count(Review.id).label("total"),
            func.avg(Review.rating).label("average"),
        ).where(Review.psychic_id == psychic_id, Review.status == REVIEW_APPROVED)
    ).first()

    total_reviews = stats.total or 0
    average_rating = float(stats.average) if stats.average else 0.0

    # Get rating distribution
    rating_dist_query = db.execute(
        select(Review.rating, func.count(Review.id).label("count"))
        .where(Review.psychic_id == psychic_id, Review.status == REVIEW_APPROVED)
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
