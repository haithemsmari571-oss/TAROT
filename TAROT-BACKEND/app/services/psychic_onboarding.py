"""Bulk psychic onboarding — create-first-then-review, NO AI.

The operator uploads a manifest (CSV/spreadsheet) plus image files (and optional
bio text files). Each manifest row maps an image + display name + per-minute rate
+ bio to one psychic. We parse and match, stage the results for review, and only
an explicit confirm creates real PSYCHIC accounts (offline by default).

Manifest columns (header row, case-insensitive; common aliases accepted):
  image_filename | image | photo      -> the exact uploaded image file name (required)
  display_name   | name                -> shown to customers (required)
  price_per_minute | rate | price      -> per-minute rate in points (required, > 0)
  bio                                   -> inline bio text (or use bio_filename)
  bio_filename                          -> name of an uploaded .txt holding the bio
  categories                            -> comma-separated category titles (optional)
  email                                 -> override the generated placeholder (optional)
  username                              -> override the generated slug (optional)

Rate is entered per MINUTE (how the admin My-Profile screen works) and stored as
price_per_second = price_per_minute / 60.
"""

from __future__ import annotations

import csv
import io
import re
import secrets
import uuid
from dataclasses import dataclass, field
from typing import Optional

from sqlalchemy.orm import Session

from app.enums.role import Role
from app.enums.user_status import UserStatus
from app.models.category import Category
from app.models.psychic_categories import PsychicCategory
from app.models.psychic_onboarding_draft import PsychicOnboardingDraft
from app.models.user import User
from app.services.medias import MEDIA_DIR
from app.utils.security import hash_password

GENERATED_EMAIL_DOMAIN = "readers.askvalentina.co.uk"

_COLUMN_ALIASES = {
    "image_filename": {"image_filename", "image", "photo", "picture", "image_file"},
    "display_name": {"display_name", "name", "psychic_name", "reader_name"},
    "price_per_minute": {"price_per_minute", "rate", "price", "per_minute", "rate_per_minute"},
    "bio": {"bio", "biography", "description"},
    "bio_filename": {"bio_filename", "bio_file"},
    "categories": {"categories", "category", "specialties", "tags"},
    "email": {"email"},
    "username": {"username", "handle"},
}


def _canonical(header: str) -> Optional[str]:
    norm = header.strip().lower().replace(" ", "_")
    for canon, aliases in _COLUMN_ALIASES.items():
        if norm in aliases:
            return canon
    return None


@dataclass
class ParsedRow:
    row_index: int
    image_filename: str = ""
    display_name: str = ""
    price_per_minute: Optional[float] = None
    bio: str = ""
    categories: str = ""
    email: str = ""
    username: str = ""
    problems: list[str] = field(default_factory=list)

    @property
    def has_errors(self) -> bool:
        return bool(self.problems)


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").strip().lower()).strip("-")
    return slug or "reader"


def parse_manifest(
    manifest_text: str,
    image_names: set[str],
    bio_files: Optional[dict[str, str]] = None,
) -> list[ParsedRow]:
    """Pure parse+validate. `image_names` is the set of uploaded image filenames;
    `bio_files` maps an uploaded .txt filename to its text. No DB, no I/O."""
    bio_files = bio_files or {}
    # Normalise newlines so a spreadsheet export with \r\n parses cleanly.
    reader = csv.DictReader(io.StringIO(manifest_text.replace("\r\n", "\n").replace("\r", "\n")))
    if reader.fieldnames is None:
        return []

    header_map = {name: _canonical(name) for name in reader.fieldnames}
    if "image_filename" not in header_map.values() or "display_name" not in header_map.values():
        # Signal a structural problem as a single synthetic row so the operator
        # sees a clear message instead of an empty batch.
        bad = ParsedRow(row_index=0)
        bad.problems.append(
            "Manifest must have at least an image column (image_filename/image/photo) and a name column (display_name/name)."
        )
        return [bad]

    rows: list[ParsedRow] = []
    for i, raw in enumerate(reader):
        canon: dict[str, str] = {}
        for original, value in raw.items():
            key = header_map.get(original)
            if key:
                canon[key] = (value or "").strip()

        row = ParsedRow(row_index=i)
        row.image_filename = canon.get("image_filename", "")
        row.display_name = canon.get("display_name", "")
        row.categories = canon.get("categories", "")
        row.email = canon.get("email", "")
        row.username = canon.get("username", "")

        # Skip fully-blank lines (trailing newline in the CSV).
        if not any([row.image_filename, row.display_name, canon.get("price_per_minute"), canon.get("bio")]):
            continue

        # Bio: inline wins; else pull from the referenced uploaded file.
        row.bio = canon.get("bio", "")
        if not row.bio and canon.get("bio_filename"):
            fname = canon["bio_filename"]
            if fname in bio_files:
                row.bio = bio_files[fname].strip()
            else:
                row.problems.append(f"bio_filename '{fname}' was not among the uploaded files.")

        # Rate → validate positive number.
        rate_raw = canon.get("price_per_minute", "")
        if not rate_raw:
            row.problems.append("Missing per-minute rate.")
        else:
            try:
                row.price_per_minute = round(float(rate_raw), 2)
                if row.price_per_minute <= 0:
                    row.problems.append("Rate must be greater than 0.")
            except ValueError:
                row.problems.append(f"Rate '{rate_raw}' is not a number.")

        if not row.display_name:
            row.problems.append("Missing display name.")

        if not row.image_filename:
            row.problems.append("Missing image filename.")
        elif row.image_filename not in image_names:
            row.problems.append(f"Image '{row.image_filename}' was not among the uploaded files.")

        rows.append(row)

    return rows


def _unique_username(db: Session, base: str, taken: set[str]) -> str:
    candidate = base
    n = 1
    while (
        candidate in taken
        or db.query(User).filter(User.username == candidate).first() is not None
    ):
        n += 1
        candidate = f"{base}-{n}"
    taken.add(candidate)
    return candidate


def _save_image_bytes(filename: str, data: bytes) -> str:
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid.uuid4()}_{filename}"
    path = MEDIA_DIR / safe_name
    with path.open("wb") as f:
        f.write(data)
    return str(path)


def stage_batch(
    db: Session,
    manifest_text: str,
    image_data: dict[str, bytes],
    bio_files: Optional[dict[str, str]] = None,
) -> str:
    """Parse the manifest, save each matched image, and stage draft rows for
    review. Returns the batch_id. Nothing is created in the users table here."""
    batch_id = uuid.uuid4().hex
    parsed = parse_manifest(manifest_text, set(image_data.keys()), bio_files)

    taken_usernames: set[str] = set()
    for row in parsed:
        username = row.username or _unique_username(db, slugify(row.display_name), taken_usernames)
        if row.username:
            taken_usernames.add(row.username)
        email = row.email or f"{username}@{GENERATED_EMAIL_DOMAIN}"

        picture_path: Optional[str] = None
        if row.image_filename and row.image_filename in image_data:
            picture_path = _save_image_bytes(row.image_filename, image_data[row.image_filename])

        draft = PsychicOnboardingDraft(
            batch_id=batch_id,
            row_index=row.row_index,
            status="error" if row.has_errors else "pending",
            error_reason="; ".join(row.problems) if row.problems else None,
            display_name=row.display_name or None,
            price_per_minute=row.price_per_minute,
            bio=row.bio or None,
            categories_csv=row.categories or None,
            username=username,
            email=email,
            image_filename=row.image_filename or None,
            profile_picture_path=picture_path,
        )
        db.add(draft)

    db.commit()
    return batch_id


def list_batch(db: Session, batch_id: str) -> list[PsychicOnboardingDraft]:
    return (
        db.query(PsychicOnboardingDraft)
        .filter(PsychicOnboardingDraft.batch_id == batch_id)
        .order_by(PsychicOnboardingDraft.row_index)
        .all()
    )


def update_draft(db: Session, draft_id: int, fields: dict) -> PsychicOnboardingDraft:
    draft = db.get(PsychicOnboardingDraft, draft_id)
    if draft is None:
        raise ValueError("Draft not found.")
    if draft.status == "created":
        raise ValueError("This draft was already created and cannot be edited.")

    for key in ("display_name", "bio", "username", "email", "categories_csv"):
        if key in fields and fields[key] is not None:
            setattr(draft, key, fields[key])
    if fields.get("price_per_minute") is not None:
        draft.price_per_minute = round(float(fields["price_per_minute"]), 2)

    # Re-validate the editable fields so a fixed row flips out of "error".
    problems: list[str] = []
    if not draft.display_name:
        problems.append("Missing display name.")
    if draft.price_per_minute is None or draft.price_per_minute <= 0:
        problems.append("Rate must be greater than 0.")
    if not draft.profile_picture_path:
        problems.append("No image was matched for this row.")
    draft.status = "error" if problems else "pending"
    draft.error_reason = "; ".join(problems) if problems else None

    db.commit()
    db.refresh(draft)
    return draft


def _resolve_categories(db: Session, categories_csv: Optional[str]) -> list[int]:
    if not categories_csv:
        return []
    ids: list[int] = []
    for token in categories_csv.split(","):
        token = token.strip()
        if not token:
            continue
        if token.isdigit():
            if db.get(Category, int(token)):
                ids.append(int(token))
            continue
        cat = db.query(Category).filter(Category.title.ilike(token)).first()
        if cat:
            ids.append(cat.id)
    return ids


def confirm_batch(db: Session, batch_id: str) -> dict:
    """Create real PSYCHIC accounts from every non-error, not-yet-created draft.
    Offline by default (is_online=False) so nothing shows to customers until the
    operator flips it live. Idempotent: already-created drafts are skipped."""
    drafts = list_batch(db, batch_id)
    created, skipped, failed = 0, 0, 0
    results = []

    for draft in drafts:
        if draft.status == "created":
            skipped += 1
            results.append({"draft_id": draft.id, "outcome": "already_created", "user_id": draft.created_user_id})
            continue
        if draft.status == "error":
            skipped += 1
            results.append({"draft_id": draft.id, "outcome": "skipped_error", "reason": draft.error_reason})
            continue

        # Guard against collisions at create time (another draft/user took it).
        if db.query(User).filter(User.email == draft.email).first():
            draft.status = "error"
            draft.error_reason = f"Email {draft.email} already exists."
            failed += 1
            results.append({"draft_id": draft.id, "outcome": "failed", "reason": draft.error_reason})
            continue
        if db.query(User).filter(User.username == draft.username).first():
            draft.status = "error"
            draft.error_reason = f"Username {draft.username} already exists."
            failed += 1
            results.append({"draft_id": draft.id, "outcome": "failed", "reason": draft.error_reason})
            continue

        psychic = User(
            role=Role.PSYCHIC,
            email=draft.email,
            username=draft.username,
            price_per_second=round(float(draft.price_per_minute) / 60.0, 6),
            password_hash=hash_password(secrets.token_urlsafe(24)),
            bio=draft.bio,
            profile_picture_path=draft.profile_picture_path,
            is_online=False,  # created dark; operator flips live when ready
            is_verified=True,
            status=UserStatus.ACTIVE,
            order=9999,
        )
        db.add(psychic)
        db.flush()

        for category_id in _resolve_categories(db, draft.categories_csv):
            db.add(PsychicCategory(psychic_id=psychic.id, category_id=category_id))

        draft.status = "created"
        draft.created_user_id = psychic.id
        created += 1
        results.append({"draft_id": draft.id, "outcome": "created", "user_id": psychic.id})

    db.commit()
    return {"batch_id": batch_id, "created": created, "skipped": skipped, "failed": failed, "results": results}
