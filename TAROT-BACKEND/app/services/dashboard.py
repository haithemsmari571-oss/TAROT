from datetime import datetime, timedelta
from typing import Any, Dict, List

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.enums.chat_status import ChatStatus
from app.enums.role import Role
from app.enums.transaction_status import TransactionStatus
from app.enums.transaction_type import TransactionType
from app.models.chat import Chat
from app.models.review import Review
from app.models.settings import Settings
from app.models.transaction import Transaction
from app.models.user import User


def get_admin_dashboard_stats(db: Session) -> Dict[str, Any]:
    total_users = db.query(func.count(User.id)).scalar() or 0
    total_psychics = (
        db.query(func.count(User.id)).filter(User.role == Role.PSYCHIC).scalar() or 0
    )
    total_admins = (
        db.query(func.count(User.id)).filter(User.role == Role.ADMIN).scalar() or 0
    )
    total_superadmins = (
        db.query(func.count(User.id)).filter(User.role == Role.SUPERADMIN).scalar() or 0
    )

    total_revenue = (
        db.query(func.coalesce(func.sum(Transaction.amount), 0))
        .filter(
            Transaction.transaction_type == TransactionType.CREDIT,
            Transaction.status == TransactionStatus.COMPLETED,
        )
        .scalar()
    ) or 0

    total_transactions = db.query(func.count(Transaction.id)).scalar() or 0

    transaction_status_counts = {}
    for status in TransactionStatus:
        count = (
            db.query(func.count(Transaction.id))
            .filter(Transaction.status == status)
            .scalar()
        ) or 0
        transaction_status_counts[status.value] = count

    chat_status_counts = {}
    for status in ChatStatus:
        count = (
            db.query(func.count(Chat.id)).filter(Chat.status == status).scalar()
        ) or 0
        chat_status_counts[status.value] = count

    top_psychics_query = (
        db.query(
            User.id,
            User.username,
            User.email,
            User.profile_picture_path,
            func.coalesce(func.sum(Transaction.amount), 0).label("totalEarnings"),
            func.count(Transaction.id).label("totalSessions"),
        )
        .join(Chat, Chat.psychic_id == User.id)
        .join(Transaction, Transaction.related_chat_id == Chat.id)
        .filter(
            User.role == Role.PSYCHIC,
            Transaction.transaction_type == TransactionType.DEBIT,
            Transaction.status == TransactionStatus.COMPLETED,
        )
        .group_by(User.id)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(5)
        .all()
    )

    psychic_ids = [p.id for p in top_psychics_query]
    rating_map: Dict[int, float] = {}
    if psychic_ids:
        ratings = (
            db.query(
                Review.psychic_id,
                func.avg(Review.rating).label("averageRating"),
            )
            .filter(Review.psychic_id.in_(psychic_ids))
            .group_by(Review.psychic_id)
            .all()
        )
        for r in ratings:
            rating_map[r.psychic_id] = (
                round(r.averageRating, 1) if r.averageRating else 0.0
            )

    top_psychics = []
    for p in top_psychics_query:
        top_psychics.append(
            {
                "id": p.id,
                "username": p.username,
                "email": p.email,
                "profile_picture_path": p.profile_picture_path,
                "totalEarnings": p.totalEarnings,
                "totalSessions": p.totalSessions,
                "averageRating": rating_map.get(p.id, 0.0),
            }
        )

    recent_transactions = (
        db.query(Transaction).order_by(Transaction.created_at.desc()).limit(10).all()
    )
    recent = []
    for t in recent_transactions:
        recent.append(
            {
                "id": t.id,
                "userId": t.user_id,
                "username": t.user.username if t.user else None,
                "transactionType": t.transaction_type.value,
                "amount": t.amount,
                "status": t.status.value,
                "description": t.description,
                "createdAt": t.created_at.isoformat() if t.created_at else None,
            }
        )

    ninety_days_ago = datetime.utcnow() - timedelta(days=90)
    signups = (
        db.query(
            func.date(User.created_at).label("date"),
            func.count(User.id).label("count"),
        )
        .filter(User.created_at >= ninety_days_ago)
        .group_by(func.date(User.created_at))
        .order_by(func.date(User.created_at))
        .all()
    )
    signups_by_day = [{"date": str(s.date), "count": s.count} for s in signups]

    unit_price_setting = (
        db.query(Settings).filter(Settings.key == "unit_price_cents").first()
    )
    unit_price_cents = int(unit_price_setting.value) if unit_price_setting else 100

    return {
        "totalUsers": total_users,
        "totalPsychics": total_psychics,
        "totalAdmins": total_admins,
        "totalSuperadmins": total_superadmins,
        "totalRevenue": total_revenue,
        "totalTransactions": total_transactions,
        "transactionStatusCounts": transaction_status_counts,
        "chatStatusCounts": chat_status_counts,
        "topPsychics": top_psychics,
        "recentTransactions": recent,
        "signupsByDay": signups_by_day,
        "unitPriceCents": unit_price_cents,
    }
