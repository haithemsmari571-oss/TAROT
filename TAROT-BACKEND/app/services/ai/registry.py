"""The AI Prompt Registry — the single source of truth for the WORDS of every
AI feature. Features fetch their prompt by key at run time (cached in-memory,
busted on save). Code owns model/parsing/retries/limits; the registry owns text.
"""

from datetime import datetime, timezone
from typing import Optional

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
                status="ACTIVE",
            )
            db.add(row)
            db.flush()
            db.add(AiPromptVersion(prompt_id=row.id, text=row.prompt))
        else:
            # Keep metadata + the shipped default current; leave live prompt alone.
            row.name = spec["name"]
            row.description = spec["description"]
            row.model = spec["model"]
            row.default_prompt = spec["default_prompt"]
            row.variables = spec["variables"]
    db.commit()
    _CACHE.clear()


def get_prompt(db: Session, key: str) -> AiPrompt:
    row = db.query(AiPrompt).filter(AiPrompt.key == key).first()
    if row is None:
        raise PromptNotFound(key)
    return row


def get_prompt_text(db: Session, key: str) -> str:
    """Current prompt text for a key, from cache when possible."""
    if key in _CACHE:
        return _CACHE[key]
    text = get_prompt(db, key).prompt
    _CACHE[key] = text
    return text


def render(db: Session, key: str, **variables) -> str:
    """Fetch a prompt and substitute {var} placeholders. Only the named
    variables are replaced — literal braces (e.g. JSON) are left untouched."""
    text = get_prompt_text(db, key)
    for name, value in variables.items():
        text = text.replace("{" + name + "}", str(value))
    return text


def list_prompts(db: Session) -> list[AiPrompt]:
    return db.query(AiPrompt).order_by(AiPrompt.name.asc()).all()


def save_prompt(db: Session, key: str, new_text: str) -> AiPrompt:
    """Save new prompt text: snapshot it as a version (keeping the last 10),
    update the live prompt, and bust the cache so callers pick it up at once."""
    row = get_prompt(db, key)
    row.prompt = new_text
    db.add(AiPromptVersion(prompt_id=row.id, text=new_text))
    db.flush()
    _trim_versions(db, row.id)
    db.commit()
    db.refresh(row)
    _CACHE[key] = new_text
    logger.info("ai_prompt_saved", key=key, chars=len(new_text))
    return row


def _trim_versions(db: Session, prompt_id: int) -> None:
    versions = (
        db.query(AiPromptVersion)
        .filter(AiPromptVersion.prompt_id == prompt_id)
        .order_by(AiPromptVersion.id.desc())
        .all()
    )
    for old in versions[MAX_VERSIONS:]:
        db.delete(old)


def restore_default(db: Session, key: str) -> AiPrompt:
    row = get_prompt(db, key)
    return save_prompt(db, key, row.default_prompt)


def get_versions(db: Session, key: str) -> list[AiPromptVersion]:
    row = get_prompt(db, key)
    return (
        db.query(AiPromptVersion)
        .filter(AiPromptVersion.prompt_id == row.id)
        .order_by(AiPromptVersion.id.desc())
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


def record_run(db: Session, key: str, status: str, at: Optional[datetime] = None) -> None:
    row = db.query(AiPrompt).filter(AiPrompt.key == key).first()
    if row is None:
        return
    row.last_run_at = at or datetime.now(timezone.utc)
    row.last_run_status = status[:255]
    db.commit()
