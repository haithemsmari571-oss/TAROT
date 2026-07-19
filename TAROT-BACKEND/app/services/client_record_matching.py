"""Auto-matcher: propose tarot-client → vault-record mappings for human review.

For every client-role user, compare their platform identity (username + email
local-part) against every vault record's name candidates, corroborated by DOB
where both sides have one. The best candidate above threshold becomes a PENDING
ClientRecordMapping row. Nothing proposed here is ever used until a human
confirms it — the scanner is allowed to be approximate, the review gate is not.

Scoring:
  * name similarity = max difflib ratio over (user candidates × vault candidates)
  * both DOBs known and EQUAL      → method "name+dob", propose at score >= 0.5
  * both DOBs known and DIFFERENT  → candidate skipped outright (same name,
    different person — exactly the two-Christines case this design exists for)
  * either DOB missing             → method "name_only", propose at score >= 0.72
    (tentative by design; the vault's one DOB-less record still gets a shot)

Existing rows: CONFIRMED/REJECTED are never touched; PENDING rows are refreshed
in place when re-scanning (the proposal may improve as vault files evolve).
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import List, Optional

from sqlalchemy.orm import Session

from app.enums.client_record_mapping_status import ClientRecordMappingStatus
from app.enums.role import Role
from app.logging_config import get_logger
from app.models.client_record_mapping import ClientRecordMapping
from app.models.user import User
from app.services.client_records_vault import VaultRecord, list_records

logger = get_logger(__name__)

_SCORE_WITH_DOB = 0.5
_SCORE_NAME_ONLY = 0.72


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z]", "", (text or "").lower())


def _user_name_candidates(user: User) -> List[str]:
    """Normalized name strings for a tarot user: username plus the email
    local-part (with trailing digits dropped — "nwilliams532" → "nwilliams")."""
    candidates = [_normalize(user.username)]
    local = (user.email or "").split("@")[0]
    candidates.append(_normalize(local))
    candidates.append(_normalize(re.sub(r"[0-9]+$", "", local)))
    # test/dev suffixes ("mia_test") would otherwise drag scores down
    candidates.append(_normalize(re.sub(r"(test|dev)$", "", _normalize(user.username))))
    return [c for c in dict.fromkeys(candidates) if c]


def _name_score(user_names: List[str], record: VaultRecord) -> float:
    return max(
        (
            SequenceMatcher(None, u, v).ratio()
            for u in user_names
            for v in record.names
        ),
        default=0.0,
    )


def _best_candidate(user: User, records: List[VaultRecord]):
    """(record, score, method) for the strongest plausible match, or None."""
    user_names = _user_name_candidates(user)
    best = None
    for record in records:
        if user.date_of_birth and record.dob:
            if user.date_of_birth != record.dob:
                continue  # same-ish name, different person — never propose
            method, threshold = "name+dob", _SCORE_WITH_DOB
        else:
            method, threshold = "name_only", _SCORE_NAME_ONLY
        score = _name_score(user_names, record)
        if score < threshold:
            continue
        # "name+dob" outranks "name_only" at equal score
        rank = (1 if method == "name+dob" else 0, score)
        if best is None or rank > (1 if best[2] == "name+dob" else 0, best[1]):
            best = (record, score, method)
    return best


def scan_and_propose(db: Session) -> dict:
    """Run the matcher over all client users; upsert PENDING proposals.

    Returns a summary dict for the review endpoint. Read-only against the
    vault; writes only to this backend's own client_record_mappings table.
    """
    records = list_records()
    if not records:
        return {"vault_files": 0, "proposed": 0, "refreshed": 0, "skipped_reviewed": 0}

    users = db.query(User).filter(User.role == Role.USER).all()
    existing = {m.user_id: m for m in db.query(ClientRecordMapping).all()}
    proposed = refreshed = skipped_reviewed = 0

    for user in users:
        row = existing.get(user.id)
        if row is not None and row.status != ClientRecordMappingStatus.PENDING.value:
            skipped_reviewed += 1
            continue
        best = _best_candidate(user, records)
        if best is None:
            continue
        record, score, method = best
        if row is None:
            row = ClientRecordMapping(user_id=user.id)
            db.add(row)
            proposed += 1
        else:
            refreshed += 1
        row.vault_filename = record.filename
        row.vault_client_uid = record.client_uid
        row.vault_dob = record.dob
        row.dob_tier = record.dob_tier
        row.match_method = method
        row.match_score = round(score, 4)
        row.status = ClientRecordMappingStatus.PENDING.value

    db.commit()
    summary = {
        "vault_files": len(records),
        "proposed": proposed,
        "refreshed": refreshed,
        "skipped_reviewed": skipped_reviewed,
    }
    logger.info("client_record_scan", **summary)
    return summary


def review_mapping(
    db: Session, mapping_id: int, *, confirm: bool, reviewer_id: int
) -> Optional[ClientRecordMapping]:
    """Confirm or reject one proposal. Returns the row, or None if not found."""
    row = db.query(ClientRecordMapping).filter(ClientRecordMapping.id == mapping_id).first()
    if row is None:
        return None
    row.status = (
        ClientRecordMappingStatus.CONFIRMED.value
        if confirm
        else ClientRecordMappingStatus.REJECTED.value
    )
    row.reviewed_by = reviewer_id
    row.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    logger.info(
        "client_record_mapping_reviewed",
        mapping_id=mapping_id, status=row.status, by=reviewer_id,
    )
    return row
