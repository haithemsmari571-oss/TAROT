"""The AI Prompt Registry — the single source of truth for the WORDS of every
AI feature. Features fetch their prompt by key at run time (cached in-memory,
busted on save). Code owns model/parsing/retries/limits; the registry owns text.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.logging_config import get_logger
from app.models import AiPrompt, AiPromptVersion
from app.services.ai import defaults as ai_defaults

logger = get_logger(__name__)

MAX_VERSIONS = 10

# In-memory cache of key -> current prompt text (busted on save).
_CACHE: dict[str, str] = {}


class PromptNotFound(Exception):
    pass


class PromptValidationError(ValueError):
    pass


class PromptProtectedError(PermissionError):
    pass


def _required_placeholder(variable: dict) -> str:
    return str(variable.get("placeholder") or ("{" + str(variable.get("name")) + "}"))


def validate_prompt_text(row: AiPrompt, text: str) -> None:
    if not text.strip():
        raise PromptValidationError("Prompt cannot be empty.")
    missing = [
        _required_placeholder(variable)
        for variable in row.variables or []
        if variable.get("required") and _required_placeholder(variable) not in text
    ]
    if missing:
        raise PromptValidationError(
            "Required protected placeholder missing: " + ", ".join(missing)
        )


EDITABLE_CLASSIFICATIONS = ("OWNER_EDITABLE", "APPROVAL_EDITABLE")


def _ensure_editable(row: AiPrompt) -> None:
    """Gate for any write to a prompt's live text, including restores.

    The two editable classifications describe HOW a change is reviewed, not
    whether the prompt may be written at all. Before this, save_prompt demanded
    APPROVAL_EDITABLE while the draft/activate path demanded OWNER_EDITABLE, and
    restore_default/restore_version both routed through save_prompt — so an
    OWNER_EDITABLE prompt could be edited but never rolled back to its shipped
    default. PROTECTED still refuses every write.
    """
    if row.classification not in EDITABLE_CLASSIFICATIONS:
        raise PromptProtectedError(
            "This prompt is protected from direct draft/activation changes."
        )


def _ensure_owner_editable(row: AiPrompt) -> None:
    if row.classification != "OWNER_EDITABLE":
        raise PromptProtectedError(
            "This prompt is protected from direct draft/activation changes."
        )


def _next_version(db: Session, prompt_id: int) -> int:
    latest = (
        db.query(func.max(AiPromptVersion.version))
        .filter(AiPromptVersion.prompt_id == prompt_id)
        .scalar()
    )
    return int(latest or 0) + 1


def seed_prompts(db: Session) -> None:
    """Ensure every shipped prompt exists in the DB. Keeps ``default_prompt``,
    model and description in sync with code, but NEVER overwrites the owner's
    edited ``prompt`` text."""
    for spec in ai_defaults.registered_prompts():
        row = db.query(AiPrompt).filter(AiPrompt.key == spec["key"]).first()
        if row is None:
            row = AiPrompt(
                key=spec["key"],
                name=spec["name"],
                description=spec["description"],
                model=spec["model"],
                prompt=spec["default_prompt"],
                default_prompt=spec["default_prompt"],
                variables=spec["variables"],
                output_schema=spec.get("output_schema"),
                output_schema_version=spec.get("output_schema_version"),
                classification=spec.get("classification", "PROTECTED"),
                active_version=1,
                status="ACTIVE",
            )
            db.add(row)
            db.flush()
            db.add(
                AiPromptVersion(
                    prompt_id=row.id,
                    version=1,
                    text=row.prompt,
                    state="ACTIVE",
                    activated_at=datetime.now(timezone.utc),
                )
            )
        else:
            # Keep metadata + the shipped default current; leave live prompt alone.
            row.name = spec["name"]
            row.description = spec["description"]
            row.model = spec["model"]
            row.default_prompt = spec["default_prompt"]
            row.variables = spec["variables"]
            row.output_schema = spec.get("output_schema")
            row.output_schema_version = spec.get("output_schema_version")
            row.classification = spec.get("classification", "PROTECTED")
            if not row.versions:
                row.active_version = 1
                db.add(
                    AiPromptVersion(
                        prompt_id=row.id,
                        version=1,
                        text=row.prompt,
                        state="ACTIVE",
                        activated_at=datetime.now(timezone.utc),
                    )
                )
    db.commit()
    _CACHE.clear()


def get_prompt(db: Session, key: str) -> AiPrompt:
    row = db.query(AiPrompt).filter(AiPrompt.key == key).first()
    if row is None:
        raise PromptNotFound(key)
    return row


def resolve_prompt_text(row: AiPrompt) -> str:
    """The text a feature should actually run with.

    Resolution order — this is the HARD RULE of the registry:

      1. ``is_default`` set  -> the SHIPPED default (``default_prompt``, which
         ``seed_prompts`` keeps in step with the code constant).
      2. otherwise           -> the owner's edited ``prompt``.

    Before this existed the DB row was authoritative from the first seed, so a
    later edit to the code constant was silently ignored forever on any database
    that had already been seeded: the feature kept running the ORIGINAL shipped
    text while the source said something else. Mirrors the CRM registry, where
    the same rule is what makes a default-state read byte-identical to the
    hardcoded constant.
    """
    if getattr(row, "is_default", 0):
        return row.default_prompt
    return row.prompt


def get_prompt_text(db: Session, key: str) -> str:
    """Current prompt text for a key, from cache when possible."""
    if key in _CACHE:
        return _CACHE[key]
    text = resolve_prompt_text(get_prompt(db, key))
    _CACHE[key] = text
    return text


def render(db: Session, key: str, **variables) -> str:
    """Fetch a prompt and substitute {var} placeholders. Only the named
    variables are replaced — literal braces (e.g. JSON) are left untouched."""
    text = get_prompt_text(db, key)
    for name, value in variables.items():
        text = text.replace("{{" + name + "}}", str(value))
        text = text.replace("{" + name + "}", str(value))
    return text


def render_text(text: str, **variables) -> str:
    for name, value in variables.items():
        text = text.replace("{{" + name + "}}", str(value))
        text = text.replace("{" + name + "}", str(value))
    return text


def list_prompts(db: Session) -> list[AiPrompt]:
    return db.query(AiPrompt).order_by(AiPrompt.name.asc()).all()


def save_prompt(db: Session, key: str, new_text: str) -> AiPrompt:
    """Save new prompt text: snapshot it as a version (keeping the last 10),
    update the live prompt, and bust the cache so callers pick it up at once."""
    row = get_prompt(db, key)
    _ensure_editable(row)
    validate_prompt_text(row, new_text)
    now = datetime.now(timezone.utc)
    for version in row.versions:
        if version.state == "ACTIVE":
            version.state = "SUPERSEDED"
    next_version = _next_version(db, row.id)
    row.prompt = new_text
    row.active_version = next_version
    row.draft_version = None
    # An explicit save is the moment the row stops tracking the shipped default.
    row.is_default = 0
    db.add(
        AiPromptVersion(
            prompt_id=row.id,
            version=next_version,
            text=new_text,
            state="ACTIVE",
            activated_at=now,
        )
    )
    db.flush()
    _trim_versions(db, row.id)
    db.commit()
    db.refresh(row)
    _CACHE[key] = new_text
    logger.info("ai_prompt_saved", key=key, chars=len(new_text))
    return row


def save_draft(db: Session, key: str, new_text: str) -> AiPromptVersion:
    row = get_prompt(db, key)
    _ensure_owner_editable(row)
    validate_prompt_text(row, new_text)
    for version in row.versions:
        if version.state == "DRAFT":
            version.state = "SUPERSEDED"
    next_version = _next_version(db, row.id)
    draft = AiPromptVersion(
        prompt_id=row.id,
        version=next_version,
        text=new_text,
        state="DRAFT",
    )
    row.draft_version = next_version
    db.add(draft)
    db.flush()
    _trim_versions(db, row.id)
    db.commit()
    db.refresh(draft)
    logger.info("ai_prompt_draft_saved", key=key, version=next_version, chars=len(new_text))
    return draft


def activate_draft(
    db: Session, key: str, version_number: int | None = None
) -> AiPrompt:
    row = get_prompt(db, key)
    _ensure_owner_editable(row)
    selected = version_number if version_number is not None else row.draft_version
    if selected is None:
        raise PromptValidationError("There is no saved draft to activate.")
    version = (
        db.query(AiPromptVersion)
        .filter(
            AiPromptVersion.prompt_id == row.id,
            AiPromptVersion.version == selected,
            AiPromptVersion.state == "DRAFT",
        )
        .first()
    )
    if version is None:
        raise PromptNotFound(f"draft version {selected}")
    validate_prompt_text(row, version.text)
    for existing in row.versions:
        if existing.state == "ACTIVE":
            existing.state = "SUPERSEDED"
    version.state = "ACTIVE"
    version.activated_at = datetime.now(timezone.utc)
    row.prompt = version.text
    row.active_version = version.version
    row.draft_version = None
    row.is_default = 0
    db.commit()
    db.refresh(row)
    _CACHE[key] = resolve_prompt_text(row)
    logger.info("ai_prompt_activated", key=key, version=row.active_version)
    return row


def rollback_to_version(db: Session, key: str, version_number: int) -> AiPrompt:
    row = get_prompt(db, key)
    _ensure_owner_editable(row)
    source = (
        db.query(AiPromptVersion)
        .filter(
            AiPromptVersion.prompt_id == row.id,
            AiPromptVersion.version == version_number,
        )
        .first()
    )
    if source is None:
        raise PromptNotFound(f"version {version_number}")
    validate_prompt_text(row, source.text)
    for existing in row.versions:
        if existing.state == "ACTIVE":
            existing.state = "SUPERSEDED"
        elif existing.state == "DRAFT":
            existing.state = "SUPERSEDED"
    next_version = _next_version(db, row.id)
    restored = AiPromptVersion(
        prompt_id=row.id,
        version=next_version,
        text=source.text,
        state="ACTIVE",
        activated_at=datetime.now(timezone.utc),
    )
    db.add(restored)
    row.prompt = source.text
    row.active_version = next_version
    row.draft_version = None
    row.is_default = 0
    db.flush()
    _trim_versions(db, row.id)
    db.commit()
    db.refresh(row)
    _CACHE[key] = row.prompt
    logger.info(
        "ai_prompt_rolled_back",
        key=key,
        source_version=version_number,
        active_version=next_version,
    )
    return row


def _trim_versions(db: Session, prompt_id: int) -> None:
    versions = (
        db.query(AiPromptVersion)
        .filter(AiPromptVersion.prompt_id == prompt_id)
        .order_by(AiPromptVersion.version.desc())
        .all()
    )
    for old in versions[MAX_VERSIONS:]:
        db.delete(old)


def restore_default(db: Session, key: str) -> AiPrompt:
    """Return a prompt to the shipped default AND to tracking it.

    save_prompt clears is_default because an explicit save means the owner has
    taken ownership of the text. A restore is the opposite intent: the row goes
    back to following the code constant, so a later change to that constant
    reaches the model instead of being pinned to today's wording.
    """
    row = get_prompt(db, key)
    restored = save_prompt(db, key, row.default_prompt)
    restored.is_default = 1
    db.commit()
    db.refresh(restored)
    _CACHE[key] = resolve_prompt_text(restored)
    return restored


def get_versions(db: Session, key: str) -> list[AiPromptVersion]:
    row = get_prompt(db, key)
    return (
        db.query(AiPromptVersion)
        .filter(AiPromptVersion.prompt_id == row.id)
        .order_by(AiPromptVersion.version.desc())
        .all()
    )


def restore_version(db: Session, key: str, version_id: int) -> AiPrompt:
    row = get_prompt(db, key)
    version = (
        db.query(AiPromptVersion)
        .filter(
            AiPromptVersion.id == version_id, AiPromptVersion.prompt_id == row.id
        )
        .first()
    )
    if version is None:
        raise PromptNotFound(f"version {version_id}")
    return save_prompt(db, key, version.text)


def get_active_prompt(db: Session, key: str) -> tuple[AiPrompt, AiPromptVersion, str]:
    """The row, its active version row, and THE TEXT TO RUN.

    Callers must use the third element. Executing ``version.text`` instead
    bypasses resolve_prompt_text, which is how the numerology reading ended up
    split-brain: the admin Test button resolved through get_prompt_text while
    production executed the version row, so a prompt could be tested as one
    string and shipped as another. The version row is still returned because
    callers need its number for provenance — not for its text.
    """
    row = get_prompt(db, key)
    version = (
        db.query(AiPromptVersion)
        .filter(
            AiPromptVersion.prompt_id == row.id,
            AiPromptVersion.version == row.active_version,
            AiPromptVersion.state == "ACTIVE",
        )
        .first()
    )
    if version is None:
        raise PromptNotFound(f"active version for {key}")
    text = resolve_prompt_text(row)
    validate_prompt_text(row, text)
    return row, version, text


def record_run(db: Session, key: str, status: str, at: Optional[datetime] = None) -> None:
    row = db.query(AiPrompt).filter(AiPrompt.key == key).first()
    if row is None:
        return
    row.last_run_at = at or datetime.now(timezone.utc)
    row.last_run_status = status[:255]
    db.commit()
