"""Human-readable client codes (Atlas Track A, phase A0).

A client code is the VISIBLE identifier the Second Brain CRM shows for a
customer — never the enumerable integer primary key. Format: ``AV-`` plus six
characters from a confusion-free alphabet (no 0/O, 1/I/L, U), e.g. ``AV-7F3K9Q``.

30^6 ≈ 729 million combinations. At this platform's scale the collision chance
per generation is negligible; the unique index on users.client_code is the
final guarantee, and ``generate_unique_client_code`` retries against the DB
when a session is available (migration backfill + any explicit assignment).
"""

from __future__ import annotations

import secrets

CLIENT_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"
CLIENT_CODE_PREFIX = "AV-"
CLIENT_CODE_SUFFIX_LENGTH = 6


def generate_client_code() -> str:
    """One random, human-readable client code (no uniqueness check)."""

    suffix = "".join(
        secrets.choice(CLIENT_CODE_ALPHABET) for _ in range(CLIENT_CODE_SUFFIX_LENGTH)
    )
    return f"{CLIENT_CODE_PREFIX}{suffix}"


def is_client_code(value: str) -> bool:
    """True when ``value`` looks like a client code (used by lookups that accept
    either a code or a numeric id)."""

    if not value.startswith(CLIENT_CODE_PREFIX):
        return False
    suffix = value[len(CLIENT_CODE_PREFIX) :]
    return len(suffix) == CLIENT_CODE_SUFFIX_LENGTH and all(
        ch in CLIENT_CODE_ALPHABET for ch in suffix
    )


def generate_unique_client_code(db) -> str:
    """Generate a code verified unused in ``users.client_code`` (retry loop)."""

    from app.models.user import User

    for _ in range(20):
        candidate = generate_client_code()
        exists = db.query(User.id).filter(User.client_code == candidate).first()
        if not exists:
            return candidate
    raise RuntimeError("Could not generate a unique client code after 20 attempts.")
