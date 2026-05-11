from sqlalchemy import or_
from app.models.psychic_categories import PsychicCategory
from app.models.user import User
from app.schemas.psychic import PsychicFilter


def build_psychics_filters(filters: PsychicFilter):
    sql_filters = []

    if filters.is_online is not None:
        sql_filters.append(User.is_online.is_(filters.is_online))
    if filters.min_price is not None:
        sql_filters.append(User.price_per_second >= filters.min_price)
    if filters.max_price is not None:
        sql_filters.append(User.price_per_second <= filters.max_price)
    if filters.categories_ids:
        for category_id in filters.categories_ids:
            sql_filters.append(
                User.categories.any(PsychicCategory.category_id == category_id)
            )
    if filters.search:
        search_term = f"%{filters.search}%"
        sql_filters.append(
            or_(
                User.username.ilike(search_term),
                User.bio.ilike(search_term),
            )
        )

    return sql_filters
