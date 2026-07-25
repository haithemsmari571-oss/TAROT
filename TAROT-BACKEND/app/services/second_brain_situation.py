"""SELECT-only projection of client situation records for the Second Brain CRM.

Phase A2 of Atlas Track A. Sibling of second_brain_readonly (whose v1 snapshot
is a locked contract projecting the chat stream); this projects the NEW
client_situation_records table. Same security posture:

- Dedicated bearer token (require_second_brain_readonly_access), fail-closed.
- Scope: only clients who have at least one chat with an allowlisted psychic
  are visible — the same allowed_psychic_ids semantics v1 uses.
- SELECT-only. No write path exists anywhere in this module or its router.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.chat import Chat
from app.models.client_situation_record import ClientSituationRecord
from app.models.user import User
from app.services.client_code import is_client_code

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200


@dataclass(frozen=True, slots=True)
class SituationRecordOut:
    client_id: int
    client_code: Optional[str]
    situation: dict
    source: str
    chat_id: Optional[int]
    updated_at: Optional[str]


def _visible_client_ids_query(allowed_psychic_ids: frozenset[int]):
    """Clients in scope = clients with ≥1 chat handled by an allowed psychic."""

    return (
        select(Chat.user_id)
        .where(Chat.psychic_id.in_(sorted(allowed_psychic_ids)))
        .distinct()
    )


def _to_out(record: ClientSituationRecord, client: User) -> SituationRecordOut:
    return SituationRecordOut(
        client_id=record.client_id,
        client_code=client.client_code,
        situation=record.situation or {},
        source=record.source.value if hasattr(record.source, "value") else str(record.source),
        chat_id=record.chat_id,
        updated_at=record.updated_at.isoformat() if getattr(record, "updated_at", None) else None,
    )


def list_situation_records(
    db: Session,
    allowed_psychic_ids: frozenset[int],
    *,
    limit: int = DEFAULT_PAGE_SIZE,
    offset: int = 0,
) -> tuple[list[SituationRecordOut], int]:
    """Page through in-scope situation records (newest update first)."""

    limit = max(1, min(int(limit), MAX_PAGE_SIZE))
    offset = max(0, int(offset))
    visible = _visible_client_ids_query(allowed_psychic_ids)
    base = (
        db.query(ClientSituationRecord, User)
        .join(User, User.id == ClientSituationRecord.client_id)
        .filter(ClientSituationRecord.client_id.in_(visible))
    )
    total = base.count()
    rows = (
        base.order_by(ClientSituationRecord.updated_at.desc(), ClientSituationRecord.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [_to_out(record, client) for record, client in rows], total


def get_situation_record(
    db: Session,
    allowed_psychic_ids: frozenset[int],
    ref: str,
) -> Optional[SituationRecordOut]:
    """Fetch one in-scope record by client_code (AV-XXXXXX) or numeric client id."""

    query = (
        db.query(ClientSituationRecord, User)
        .join(User, User.id == ClientSituationRecord.client_id)
        .filter(ClientSituationRecord.client_id.in_(_visible_client_ids_query(allowed_psychic_ids)))
    )
    if is_client_code(ref):
        query = query.filter(User.client_code == ref)
    elif ref.isdigit():
        query = query.filter(ClientSituationRecord.client_id == int(ref))
    else:
        return None
    row = query.first()
    if row is None:
        return None
    record, client = row
    return _to_out(record, client)
