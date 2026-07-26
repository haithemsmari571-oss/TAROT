"""SELECT-only projection of client situation records for the Second Brain CRM.

Phase A2 of Atlas Track A. Sibling of second_brain_readonly (whose v1 snapshot
is a locked contract projecting the chat stream); this projects the NEW
client_situation_records table. Same security posture:

- Dedicated bearer token (require_second_brain_readonly_access), fail-closed.
- Scope: a record is visible only when the record's OWN psychic_id is
  allowlisted. SELECT-only. No write path exists anywhere in this module or its
  router.

Records are siloed per (client, psychic). Scoping used to be "clients with >=1
chat handled by an allowed psychic", which combined with the old one-row-per-
client shape meant an allowlisted psychic's scope returned a document containing
a DIFFERENT psychic's conversations with that client. Filtering on the record's
own psychic_id is both simpler and the thing that actually prevents the leak.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from app.models.client_situation_record import ClientSituationRecord
from app.models.user import User
from app.services.client_code import is_client_code

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200


@dataclass(frozen=True, slots=True)
class SituationRecordOut:
    client_id: int
    client_code: Optional[str]
    psychic_id: int
    situation: dict
    source: str
    chat_id: Optional[int]
    updated_at: Optional[str]


def _to_out(record: ClientSituationRecord, client: User) -> SituationRecordOut:
    return SituationRecordOut(
        client_id=record.client_id,
        client_code=client.client_code,
        psychic_id=record.psychic_id,
        situation=record.situation or {},
        source=record.source.value if hasattr(record.source, "value") else str(record.source),
        chat_id=record.chat_id,
        updated_at=record.updated_at.isoformat() if getattr(record, "updated_at", None) else None,
    )


def _in_scope(query, allowed_psychic_ids: frozenset[int]):
    """Only records owned by an allowlisted psychic. An empty allowlist sees
    nothing (in_([]) is false for every row) — fail-closed by construction."""

    return query.filter(
        ClientSituationRecord.psychic_id.in_(sorted(allowed_psychic_ids))
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
    base = _in_scope(
        db.query(ClientSituationRecord, User).join(
            User, User.id == ClientSituationRecord.client_id
        ),
        allowed_psychic_ids,
    )
    total = base.count()
    rows = (
        base.order_by(ClientSituationRecord.updated_at.desc(), ClientSituationRecord.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [_to_out(record, client) for record, client in rows], total


def get_situation_records(
    db: Session,
    allowed_psychic_ids: frozenset[int],
    ref: str,
    *,
    psychic_id: Optional[int] = None,
) -> list[SituationRecordOut]:
    """In-scope records for one client, by client_code (AV-XXXXXX) or numeric id.

    Returns a LIST because a client can now have one record per psychic they
    have seen. Pass `psychic_id` to get exactly one reader's silo — which is
    what any future briefing path must do; omitting it returns every silo the
    caller is allowed to see, which is only ever the owner's CRM view.
    """

    query = _in_scope(
        db.query(ClientSituationRecord, User).join(
            User, User.id == ClientSituationRecord.client_id
        ),
        allowed_psychic_ids,
    )
    if is_client_code(ref):
        query = query.filter(User.client_code == ref)
    elif ref.isdigit():
        query = query.filter(ClientSituationRecord.client_id == int(ref))
    else:
        return []
    if psychic_id is not None:
        query = query.filter(ClientSituationRecord.psychic_id == int(psychic_id))
    rows = query.order_by(
        ClientSituationRecord.updated_at.desc(), ClientSituationRecord.id.desc()
    ).all()
    return [_to_out(record, client) for record, client in rows]
