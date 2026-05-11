from typing import Sequence

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.buy_option import BuyOption
from app.schemas.buy_option import BuyOptionCreate, BuyOptionUpdate


def get_buy_options(db: Session, only_active: bool = False) -> Sequence[BuyOption]:
    query = select(BuyOption).order_by(BuyOption.sort_order, BuyOption.id)
    if only_active:
        query = query.where(BuyOption.is_active.is_(True))
    result = db.execute(query)
    return result.scalars().all()


def get_buy_option(db: Session, option_id: int) -> BuyOption:
    option = db.get(BuyOption, option_id)
    if not option:
        raise HTTPException(status_code=404, detail="Buy option not found")
    return option


def _bump_sort_order(
    db: Session, from_order: int, exclude_id: int | None = None
) -> None:
    """Increment sort_order of all options >= from_order to make room."""
    query = (
        select(BuyOption)
        .where(BuyOption.sort_order >= from_order)
        .order_by(BuyOption.sort_order.desc(), BuyOption.id.desc())
    )
    if exclude_id is not None:
        query = query.where(BuyOption.id != exclude_id)
    to_bump = db.execute(query).scalars().all()
    for opt in to_bump:
        opt.sort_order += 1
    db.flush()


def create_buy_option(db: Session, data: BuyOptionCreate) -> BuyOption:
    sort_order = data.sort_order

    existing = (
        db.execute(select(BuyOption).where(BuyOption.sort_order == sort_order))
        .scalars()
        .first()
    )

    if existing:
        _bump_sort_order(db, sort_order)

    option = BuyOption(
        label=data.label,
        points=data.points,
        is_active=data.is_active,
        sort_order=sort_order,
    )
    db.add(option)
    db.commit()
    db.refresh(option)
    return option


def update_buy_option(db: Session, option_id: int, data: BuyOptionUpdate) -> BuyOption:
    option = get_buy_option(db, option_id)
    update_data = data.model_dump(exclude_unset=True)

    new_sort_order = update_data.get("sort_order")
    if new_sort_order is not None and new_sort_order != option.sort_order:
        conflict = (
            db.execute(
                select(BuyOption).where(
                    BuyOption.sort_order == new_sort_order,
                    BuyOption.id != option_id,
                )
            )
            .scalars()
            .first()
        )
        if conflict:
            _bump_sort_order(db, new_sort_order, exclude_id=option_id)

    for field, value in update_data.items():
        setattr(option, field, value)
    db.commit()
    db.refresh(option)
    return option


def delete_buy_option(db: Session, option_id: int) -> None:
    option = get_buy_option(db, option_id)
    db.delete(option)
    db.commit()
