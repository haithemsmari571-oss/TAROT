from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from typing import List

from app.services.landing import (
    get_all_sections,
    get_section,
    upsert_section,
)
from app.schemas.landing import (
    LandingContentRead,
    LandingContentUpdate,
    LandingContentListResponse,
)
from app.database.client import get_db
from app.dependencies.authorization import require_permission
from app.enums.permissions import Permission

router = APIRouter()


@router.get("/landing", response_model=LandingContentListResponse)
def public_list_sections(
    db: Session = Depends(get_db),
):
    sections = get_all_sections(db)
    return JSONResponse(content=jsonable_encoder({"sections": sections}))


@router.get("/landing/{section}", response_model=LandingContentRead)
def public_get_section(
    section: str,
    db: Session = Depends(get_db),
):
    entry = get_section(db, section)
    return JSONResponse(content=jsonable_encoder(entry))


@router.put("/admin/landing/{section}", response_model=LandingContentRead)
def admin_update_section(
    section: str,
    data: LandingContentUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_permission(Permission.MANAGE_SETTINGS)),
):
    entry = upsert_section(db, section, data.content)
    return JSONResponse(content=jsonable_encoder(entry))
