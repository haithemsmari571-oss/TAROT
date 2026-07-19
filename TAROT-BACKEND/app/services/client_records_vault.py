"""Read-only access to the Second Brain CRM's client-records vault.

The vault is a plain local folder of markdown files (one per long-term client),
owned by the CRM — a DIFFERENT repo. This module never writes there: it lists,
parses, and reads files, nothing else. The whole feature is inert unless
CLIENT_RECORDS_VAULT_DIR is set to an existing directory (it is NOT set in the
Docker container, so the deployed backend behaves exactly as before).

Three responsibilities:
  * parse_record()  — extract identity signals (names + DOB) from one file. The
    vault has no frontmatter; DOB lives as prose inside the "## Identity"
    section, so extraction is a best-effort regex ladder. That is acceptable
    because NOTHING here is trusted on its own: every proposed match must be
    human-confirmed (see client_record_matching) before it is ever used.
  * derive_client_uid() — the deterministic client ID: "<file-slug>-<YYYYMMDD>"
    (or "<file-slug>-dob-unknown" when no unambiguous full DOB was found).
  * load_confirmed_record_text() — the ONLY function the reading pipeline
    calls: returns the (size-capped) vault file text for a client whose mapping
    a human has CONFIRMED, else None. Any error → None, never raises.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import List, Optional

from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.logging_config import get_logger

logger = get_logger(__name__)

# Cap on how much of a vault record is merged into Valentina's CLIENT FILE.
# Files run 1.6-10.2 KB today; the median (~5-6 KB ≈ 1.5k tokens) fits whole.
# 8000 chars ≈ 2k tokens — under 5% of the model's context and a few cents per
# draft, while only ever trimming the tail of the largest records.
MAX_RECORD_CHARS = 8000

_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

# DOB extraction ladder, most to least trustworthy. All applied ONLY to the
# "## Identity" section. Tier names surface in the mapping row so the reviewer
# can see how the date was obtained.
#   iso      : "DOB 2006-01-03" (the dominant vault convention, often bolded)
#   d-mon-y  : "dob 15 sep 1969", "born 4 November 1978"
#   dmy-slash: "dob 04/11/1978" — read day-first (vault stamps are DD/MM/YYYY);
#              genuinely ambiguous for days <= 12, which is exactly why the
#              human-confirmation gate exists.
_DOB_PATTERNS = [
    ("iso", re.compile(r"\bDOB\b[*\s:]*([0-9]{4})-([0-9]{2})-([0-9]{2})", re.I)),
    (
        "d-mon-y",
        re.compile(
            r"\b(?:DOB|born)\b[*\s:]*([0-9]{1,2})\s+([A-Za-z]{3,9})\.?,?\s+([0-9]{4})", re.I
        ),
    ),
    (
        "dmy-slash",
        re.compile(r"\b(?:DOB|born)\b[*\s:]*([0-9]{1,2})/([0-9]{1,2})/([0-9]{4})", re.I),
    ),
]


@dataclass
class VaultRecord:
    """Identity signals parsed from one client-records file."""

    filename: str                 # e.g. "christine-radinger.md"
    slug: str                     # filename stem, e.g. "christine-radinger"
    names: List[str] = field(default_factory=list)  # normalized name candidates
    dob: Optional[date] = None
    dob_tier: str = "none"        # iso | d-mon-y | dmy-slash | none

    @property
    def client_uid(self) -> str:
        return derive_client_uid(self.slug, self.dob)


def derive_client_uid(slug: str, dob: Optional[date]) -> str:
    """Deterministic client ID: file slug + DOB, e.g. "christine-20060103".

    The slug (the vault's human-curated filename) carries the name; the DOB
    digits disambiguate same-name clients (the two Christines). No full DOB →
    "<slug>-dob-unknown": still deterministic, visibly weaker, and only ever
    trusted after a human confirms the mapping anyway.
    """
    return f"{slug}-{dob.strftime('%Y%m%d')}" if dob else f"{slug}-dob-unknown"


def get_vault_dir() -> Optional[Path]:
    """The configured vault directory, or None when the feature is disabled."""
    raw = (get_app_settings().CLIENT_RECORDS_VAULT_DIR or "").strip()
    if not raw:
        return None
    path = Path(raw)
    if not path.is_dir():
        logger.warning("client_records_vault_dir_missing", dir=raw)
        return None
    return path


def _normalize_name(text: str) -> str:
    return re.sub(r"[^a-z]", "", text.lower())


def _identity_section(text: str) -> str:
    """The "## Identity" block (to the next "## " heading). Every vault file
    today has one; fall back to the first 40 lines so a future file without it
    still yields name/DOB signals rather than nothing."""
    match = re.search(r"^## Identity\s*$(.*?)(?=^## |\Z)", text, re.M | re.S)
    return match.group(1) if match else "\n".join(text.splitlines()[:40])


def _slug_name_tokens(slug: str) -> List[str]:
    """Name candidates from the filename: "lisa-b1969" → ["lisa"], and the
    joined form "marilyn-martinez" → ["marilynmartinez", "marilyn"]. The
    b<year> suffix is the vault's own same-name disambiguator, not a name."""
    parts = [p for p in slug.split("-") if not re.fullmatch(r"b?[0-9]{2,4}", p)]
    tokens = [_normalize_name("".join(parts))]
    if parts:
        tokens.append(_normalize_name(parts[0]))
    return [t for t in dict.fromkeys(tokens) if t]


def _alias_name_tokens(identity: str) -> List[str]:
    """First name-ish tokens from the "**Name / Alias:**" bullet, if present."""
    match = re.search(r"\*\*Name\s*/\s*Alias:\*\*\s*(.{0,80})", identity)
    if not match:
        return []
    head = re.split(r"[,.(\[]", match.group(1))[0]
    words = re.findall(r"[A-Za-z]{2,}", head)
    tokens = [_normalize_name("".join(words))] if words else []
    if words:
        tokens.append(_normalize_name(words[0]))
    return [t for t in dict.fromkeys(tokens) if t]


# When the record ITSELF says the DOB is missing or contested, abstain before
# pattern-matching — several vault files carry candidate dates alongside markers
# like "DOB unresolved" (conflicting sources); extracting one would launder
# contested data into a confident-looking ID.
_DOB_NEGATIVE = re.compile(
    r"\bDOB\b[*\s]*(?:unresolved|unknown|not given|never given)|\bno\s+DOB\b", re.I
)


def _extract_dob(identity: str):
    """(dob, tier) via the pattern ladder; (None, "none") when nothing full and
    unambiguous is found (e.g. "DOB mid-May 1982" or "No DOB on file")."""
    if _DOB_NEGATIVE.search(identity):
        return None, "none"
    for tier, pattern in _DOB_PATTERNS:
        m = pattern.search(identity)
        if not m:
            continue
        try:
            if tier == "iso":
                y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            elif tier == "d-mon-y":
                mon = _MONTHS.get(m.group(2).lower()[:3])
                if mon is None:
                    continue
                y, mo, d = int(m.group(3)), mon, int(m.group(1))
            else:  # dmy-slash, day-first
                y, mo, d = int(m.group(3)), int(m.group(2)), int(m.group(1))
            if not 1900 <= y <= 2020:
                continue
            return date(y, mo, d), tier
        except ValueError:
            continue
    return None, "none"


def parse_record(path: Path) -> VaultRecord:
    text = path.read_text(encoding="utf-8", errors="replace")
    identity = _identity_section(text)
    slug = path.stem
    dob, tier = _extract_dob(identity)
    names = list(dict.fromkeys(_slug_name_tokens(slug) + _alias_name_tokens(identity)))
    return VaultRecord(filename=path.name, slug=slug, names=names, dob=dob, dob_tier=tier)


def list_records() -> List[VaultRecord]:
    """Parse every .md file in the vault. Empty list when disabled/unreadable."""
    vault = get_vault_dir()
    if vault is None:
        return []
    records = []
    for path in sorted(vault.glob("*.md")):
        try:
            records.append(parse_record(path))
        except OSError:
            logger.warning("client_records_parse_failed", file=path.name)
    return records


def _cap_text(text: str, limit: int = MAX_RECORD_CHARS) -> str:
    if len(text) <= limit:
        return text
    cut = text.rfind("\n", 0, limit)
    cut = cut if cut > 0 else limit
    return text[:cut] + f"\n[... vault record truncated at {limit} characters]"


def load_confirmed_record_text(db: Session, client_id: int) -> Optional[str]:
    """Vault file text for a client with a human-CONFIRMED mapping, else None.

    This is the reading pipeline's single entry point. PENDING/REJECTED
    mappings are ignored by design — an unconfirmed guess must never feed a
    real reading. Every failure path returns None so drafting for unmapped
    clients is byte-for-byte what it was before this feature existed.
    """
    try:
        from app.enums.client_record_mapping_status import ClientRecordMappingStatus
        from app.models.client_record_mapping import ClientRecordMapping

        vault = get_vault_dir()
        if vault is None:
            return None
        mapping = (
            db.query(ClientRecordMapping)
            .filter(
                ClientRecordMapping.user_id == client_id,
                ClientRecordMapping.status == ClientRecordMappingStatus.CONFIRMED.value,
            )
            .first()
        )
        if mapping is None:
            return None
        path = (vault / mapping.vault_filename).resolve()
        # The mapping row stores a bare filename; refuse anything that resolves
        # outside the vault (defense in depth against a tampered row).
        if path.parent != vault.resolve() or not path.is_file():
            logger.warning(
                "client_records_confirmed_file_unavailable",
                client_id=client_id, file=mapping.vault_filename,
            )
            return None
        text = _cap_text(path.read_text(encoding="utf-8", errors="replace").strip())
        logger.info(
            "client_records_vault_merged",
            client_id=client_id, file=mapping.vault_filename, chars=len(text),
        )
        return text
    except Exception:  # noqa: BLE001 — vault problems must never break drafting
        logger.exception("client_records_load_failed", client_id=client_id)
        return None
