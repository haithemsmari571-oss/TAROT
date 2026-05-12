from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from typing import List

from app.dependencies.authorization import require_permission
from app.enums.permissions import Permission
from app.models.user import User
from app.services.categories import (
    get_category,
    get_categories,
    create_category,
    update_category,
    delete_category,
)
from app.schemas.category import CategoryCreate, CategoryRead, CategoryUpdate
from app.database.client import get_db

router = APIRouter()


@router.get("/", response_model=List[CategoryRead])
def list_categories(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    data = get_categories(db, skip=skip, limit=limit)
    return JSONResponse(content=jsonable_encoder(data))


@router.get("/{category_id}", response_model=CategoryRead)
def get_category_detail(category_id: int, db: Session = Depends(get_db)):
    category = get_category(db, category_id)
    return JSONResponse(content=jsonable_encoder(category))


@router.post("/", response_model=CategoryRead)
def create_category_endpoint(
    category: CategoryCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_permission(Permission.MANAGE_CATEGORIES)),
):
    new_category = create_category(db, category)
    return JSONResponse(content=jsonable_encoder(new_category))


@router.put("/{category_id}", response_model=CategoryRead)
def update_category_endpoint(
    category_id: int,
    category: CategoryUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_permission(Permission.MANAGE_CATEGORIES)),
):
    updated_category = update_category(db, category_id, category)
    return JSONResponse(content=jsonable_encoder(updated_category))


@router.delete("/{category_id}")
def delete_category_endpoint(
    category_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_permission(Permission.MANAGE_CATEGORIES)),
):
    delete_category(db, category_id)
    return JSONResponse(content={"message": "Category deleted successfully"})
