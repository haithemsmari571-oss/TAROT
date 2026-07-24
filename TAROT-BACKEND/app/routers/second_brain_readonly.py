"""Private, disabled-by-default Second Brain read-only projection route."""

from __future__ import annotations

from collections.abc import Generator
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.dependencies.second_brain_readonly_auth import (
    SecondBrainReadonlyScope,
    require_second_brain_readonly_access,
)
from app.schemas.second_brain_readonly import ValentinaReadonlySnapshotInput
from app.services.second_brain_readonly import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    InvalidSecondBrainReadonlyCursor,
    SecondBrainReadonlyProjectionInvariantError,
    project_valentina_readonly_snapshot,
)

router = APIRouter()

_NO_STORE_HEADERS = {"Cache-Control": "no-store"}


def get_second_brain_readonly_db(
    _scope: Annotated[
        SecondBrainReadonlyScope,
        Depends(require_second_brain_readonly_access),
    ],
) -> Generator[Session, None, None]:
    """Open a database session only after the isolated auth gate succeeds."""

    from app.database.client import SessionLocal

    db = SessionLocal()
    try:
        yield db
    finally:
        db.rollback()
        db.close()


@router.get(
    "/snapshot",
    response_model=ValentinaReadonlySnapshotInput,
    response_model_by_alias=True,
    include_in_schema=False,
)
def get_valentina_readonly_snapshot(
    response: Response,
    scope: Annotated[
        SecondBrainReadonlyScope,
        Depends(require_second_brain_readonly_access),
    ],
    db: Annotated[Session, Depends(get_second_brain_readonly_db)],
    limit: Annotated[str, Query()] = str(DEFAULT_PAGE_SIZE),
    cursor: Annotated[str | None, Query()] = None,
) -> ValentinaReadonlySnapshotInput:
    """Return one deterministic page of the locked Valentina v1 projection."""

    response.headers["Cache-Control"] = "no-store"
    page_size = _parse_page_size(limit)
    try:
        return project_valentina_readonly_snapshot(
            db,
            allowed_psychic_ids=scope.allowed_psychic_ids,
            page_size=page_size,
            cursor=cursor,
        )
    except InvalidSecondBrainReadonlyCursor as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cursor",
            headers=_NO_STORE_HEADERS,
        ) from error
    except SecondBrainReadonlyProjectionInvariantError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Projection unavailable",
            headers=_NO_STORE_HEADERS,
        ) from error


def _parse_page_size(value: str) -> int:
    if not value.isascii() or not value.isdecimal():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid page size",
            headers=_NO_STORE_HEADERS,
        )
    page_size = int(value)
    if page_size < 1 or page_size > MAX_PAGE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid page size",
            headers=_NO_STORE_HEADERS,
        )
    return page_size
