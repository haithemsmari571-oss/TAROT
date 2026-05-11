from typing import List
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.exceptions.categories import CategoryAlreadyExistsError, CategoryNotFoundError
from app.models.category import Category
from app.schemas.category import CategoryCreate, CategoryUpdate

def get_category(db: Session, category_id: int) -> Category:
    category = db.get(Category, category_id)
    if category is None:
        raise CategoryNotFoundError(f"Category with id {category_id} not found")
    return category

def get_categories(db: Session, skip: int = 0, limit: int = 100) -> List[Category]:
    stmt = select(Category).offset(skip).limit(limit)
    return list(db.scalars(stmt))

def create_category(db: Session, category_data: CategoryCreate) -> Category:
    category = Category(**category_data.model_dump())
    db.add(category)
    try:
        db.commit()
        db.refresh(category)
    except IntegrityError:
        db.rollback()
        raise CategoryAlreadyExistsError("Category already exists with unique fields")
    return category

def update_category(db: Session, category_id: int, category_data: CategoryUpdate) -> Category:
    category = get_category(db, category_id)
    for field, value in category_data.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    db.commit()
    db.refresh(category)
    return category

def delete_category(db: Session, category_id: int) -> None:
    category = get_category(db, category_id)
    db.delete(category)
    db.commit()
