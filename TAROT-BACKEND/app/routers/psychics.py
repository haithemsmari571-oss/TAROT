from typing import Optional

from fastapi import APIRouter, Body, Depends, File, Form, UploadFile, Response
from sqlalchemy.orm import Session

import app.services.psychics as psychic_service
from app.database.client import get_db
from app.filters.psychic import build_psychics_filters
from app.schemas.psychic import (
    PsychicCreate,
    PsychicFilter,
    PsychicUpdate,
    PaginatedResponse,
    PsychicRead,
)

router = APIRouter()


@router.get("/", response_model=PaginatedResponse[PsychicRead])
def get_psychic_endpoint(
    filters: PsychicFilter = Depends(),
    db: Session = Depends(get_db),
):
    sql_filters = build_psychics_filters(filters)
    result = psychic_service.get_psychics(
        db, sql_filters, skip=filters.skip, limit=filters.limit
    )
    return result


@router.post("/")
def create_psychic_endpoint(
    psychic_data: PsychicCreate = Body(...),
    profile_picture: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    psychic = psychic_service.create_psychic(db, psychic_data, profile_picture)
    return psychic


@router.patch("/{psychic_id}")
def update_psychic_endpoint(
    psychic_id: int,
    db: Session = Depends(get_db),
    psychic_data: Optional[PsychicUpdate] = Form(None),
    profile_picture: Optional[UploadFile] = File(None),
):
    psychic = psychic_service.update_psychic(
        db, psychic_id, psychic_data, profile_picture
    )
    return psychic


@router.get("/{psychic_id}")
def read_psychic_endpoint(psychic_id: int, db: Session = Depends(get_db)):
    psychic = psychic_service.read_psychic(db, psychic_id)
    return psychic


@router.delete("/{psychic_id}", status_code=204)
def delete_psychic_endpoint(psychic_id: int, db: Session = Depends(get_db)):
    psychic_service.delete_psychic(db, psychic_id)
    return Response(status_code=204)
