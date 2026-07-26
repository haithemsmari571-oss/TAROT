"""Private v2 situation-record projection for the Second Brain CRM (read-only).

Atlas Track A, phase A2. Mounted at
``/api/integrations/second-brain/valentina/v2`` — a SIBLING of the locked v1
snapshot route, reusing the identical fail-closed bearer gate
(require_second_brain_readonly_access). GET is the only verb registered here;
there is deliberately no write path of any kind.
"""

from __future__ import annotations

from collections.abc import Generator
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.dependencies.second_brain_readonly_auth import (
    SecondBrainReadonlyScope,
    require_second_brain_readonly_access,
)
from app.services.second_brain_situation import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    get_situation_records,
    list_situation_records,
)

router = APIRouter()

_NO_STORE_HEADERS = {"Cache-Control": "no-store"}


def get_situation_scope(
    scope: Annotated[
        SecondBrainReadonlyScope,
        Depends(require_second_brain_readonly_access),
    ],
) -> SecondBrainReadonlyScope:
    return scope


def get_situation_db(
    _scope: Annotated[SecondBrainReadonlyScope, Depends(get_situation_scope)],
) -> Generator[Session, None, None]:
    """Open a session only after the auth gate succeeds; roll back on exit so
    this route can never leave a write behind."""

    from app.database.client import SessionLocal

    db = SessionLocal()
    try:
        yield db
    finally:
        db.rollback()
        db.close()


def _record_payload(record) -> dict[str, Any]:
    return {
        "client_id": record.client_id,
        "client_code": record.client_code,
        # Which reader's silo this is. Consumers must key on (client, psychic),
        # never on client alone.
        "psychic_id": record.psychic_id,
        "situation": record.situation,
        "source": record.source,
        "chat_id": record.chat_id,
        "updated_at": record.updated_at,
    }


@router.get("/situations")
def list_situations(
    scope: Annotated[SecondBrainReadonlyScope, Depends(get_situation_scope)],
    db: Annotated[Session, Depends(get_situation_db)],
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = DEFAULT_PAGE_SIZE,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    records, total = list_situation_records(
        db, scope.allowed_psychic_ids, limit=limit, offset=offset
    )
    from fastapi.responses import JSONResponse

    return JSONResponse(
        content={
            "records": [_record_payload(record) for record in records],
            "total": total,
            "limit": limit,
            "offset": offset,
        },
        headers=_NO_STORE_HEADERS,
    )


@router.get("/situations/{ref}")
def get_situation(
    ref: str,
    scope: Annotated[SecondBrainReadonlyScope, Depends(get_situation_scope)],
    db: Annotated[Session, Depends(get_situation_db)],
    psychic_id: Annotated[int | None, Query(ge=1)] = None,
):
    """One client's situation records — one per psychic they have seen.

    Returns a LIST, because memory is siloed per reader. Pass ?psychic_id= to
    narrow to a single reader's silo; a briefing path MUST do that rather than
    reading the whole list.
    """

    records = get_situation_records(
        db, scope.allowed_psychic_ids, ref, psychic_id=psychic_id
    )
    if not records:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No situation record for that client reference.",
            headers=_NO_STORE_HEADERS,
        )
    from fastapi.responses import JSONResponse

    return JSONResponse(
        content={
            "records": [_record_payload(record) for record in records],
            "total": len(records),
        },
        headers=_NO_STORE_HEADERS,
    )
