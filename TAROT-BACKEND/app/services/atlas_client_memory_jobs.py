"""Durable, non-blocking post-session Atlas client-memory jobs."""
from __future__ import annotations

import asyncio
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Protocol

import httpx
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.config import get_app_settings
from app.database.client import SessionLocal
from app.logging_config import get_logger
from app.models.atlas_client_memory_job import AtlasClientMemoryJob
from app.models.chat import Chat
from app.models.chat_session import ChatSession
from app.models.message import Message
from app.models.session_intervals import SessionInterval
from app.models.user import User
from app.services.atlas_client_memory_summary import (
    AtlasClientMemorySummarizer,
    AtlasSummaryGenerationInput,
    AtlasSummaryGenerationResult,
    AtlasTranscriptLine,
)
from app.services.atlas_memory_numerology import calculate_atlas_memory_numerology


logger = get_logger(__name__)
ATLAS_CLIENT_MEMORY_TIMEOUT_SECONDS = 5.0
ATLAS_CLIENT_MEMORY_STALE_PROCESSING_MINUTES = 60
ATLAS_CLIENT_MEMORY_SWEEP_LIMIT = 20
ATLAS_CLIENT_MEMORY_MAX_RECOVERY_CYCLES = 3
ATLAS_CLIENT_MEMORY_RECOVERY_DELAYS_MINUTES = (15, 60, 360)
_active_tasks: dict[int, asyncio.Task] = {}


class AtlasClientMemoryTransport(Protocol):
    def read(self, source_user_id: int, source_psychic_id: int) -> dict[str, Any]: ...

    def write(self, payload: dict[str, Any]) -> dict[str, Any]: ...


class AtlasClientMemoryHttpTransport:
    def __init__(self):
        settings = get_app_settings()
        self._base_url = str(getattr(settings, "ATLAS_DOSSIER_BASE_URL", "") or "").rstrip("/")
        self._internal_key = str(getattr(settings, "ATLAS_INTERNAL_KEY", "") or "").strip()
        if not self._base_url or not self._internal_key:
            raise RuntimeError("Atlas client memory is not configured.")

    @property
    def _headers(self) -> dict[str, str]:
        return {"X-Atlas-Internal-Key": self._internal_key}

    def read(self, source_user_id: int, source_psychic_id: int) -> dict[str, Any]:
        with httpx.Client(timeout=ATLAS_CLIENT_MEMORY_TIMEOUT_SECONDS) as client:
            response = client.get(
                f"{self._base_url}/internal/atlas/client-memory/{source_user_id}/{source_psychic_id}",
                headers=self._headers,
            )
            response.raise_for_status()
            body = response.json()
        if not isinstance(body, dict) or not isinstance(body.get("factsBlock"), dict):
            raise RuntimeError("Atlas returned an invalid client-memory response.")
        if not isinstance(body.get("narrativeDocument"), str):
            raise RuntimeError("Atlas returned an invalid narrative document.")
        return body

    def write(self, payload: dict[str, Any]) -> dict[str, Any]:
        with httpx.Client(timeout=ATLAS_CLIENT_MEMORY_TIMEOUT_SECONDS) as client:
            response = client.post(
                f"{self._base_url}/internal/atlas/client-memory",
                headers=self._headers,
                json=payload,
            )
            response.raise_for_status()
            body = response.json()
        current = body.get("current") if isinstance(body, dict) else None
        if not isinstance(current, dict) or not isinstance(current.get("versionNumber"), int):
            raise RuntimeError("Atlas did not confirm the stored memory version.")
        return body


@dataclass(frozen=True)
class AtlasClientMemoryJobDependencies:
    atlas: AtlasClientMemoryTransport
    summarizer: AtlasClientMemorySummarizer
    now: Callable[[], datetime] = lambda: datetime.now(timezone.utc)


def default_dependencies() -> AtlasClientMemoryJobDependencies:
    return AtlasClientMemoryJobDependencies(
        atlas=AtlasClientMemoryHttpTransport(),
        summarizer=AtlasClientMemorySummarizer(),
    )


def enqueue_atlas_client_memory_job(db: Session, chat_session_id: int) -> bool:
    """Add the job to the caller's transaction; never commits independently."""
    existing = db.get(AtlasClientMemoryJob, chat_session_id)
    if existing is not None:
        return False
    db.add(AtlasClientMemoryJob(
        chat_session_id=chat_session_id,
        status="PENDING",
        attempts=0,
    ))
    db.flush()
    return True


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _for_column(db: Session, value: datetime) -> datetime:
    bind = db.get_bind()
    if bind is not None and bind.dialect.name == "sqlite":
        return _aware(value).astimezone(timezone.utc).replace(tzinfo=None)
    return _aware(value)


def build_session_transcript(
    db: Session,
    session: ChatSession,
    chat: Chat,
) -> list[AtlasTranscriptLine]:
    intervals = (
        db.query(SessionInterval)
        .filter(SessionInterval.session_id == session.id)
        .order_by(SessionInterval.started_at.asc(), SessionInterval.id.asc())
        .all()
    )
    windows = [
        (interval.started_at, interval.ended_at)
        for interval in intervals
        if interval.started_at is not None and interval.ended_at is not None
    ]
    if not windows:
        raise RuntimeError("The completed reading has no closed transcript interval.")
    predicates = [
        Message.created_at.between(_for_column(db, started), _for_column(db, ended))
        for started, ended in windows
    ]
    messages = (
        db.query(Message)
        .filter(Message.chat_id == chat.id, or_(*predicates))
        .order_by(Message.id.asc())
        .all()
    )
    transcript: list[AtlasTranscriptLine] = []
    for message in messages:
        if message.is_system:
            speaker = "SYSTEM"
        elif message.sender_id == chat.user_id:
            speaker = "CLIENT"
        elif message.sender_id == chat.psychic_id:
            speaker = "PSYCHIC"
        else:
            speaker = "OPERATOR"
        transcript.append(AtlasTranscriptLine(
            message_id=str(message.id),
            speaker=speaker,
            timestamp=_aware(message.created_at).isoformat(),
            text=message.content,
        ))
    if not transcript:
        raise RuntimeError("The completed reading has no transcript messages.")
    return transcript


def _account_profile(user: User) -> dict[str, Any]:
    return {
        "userId": str(user.id),
        "clientCode": user.client_code,
        "username": user.username,
        "dateOfBirth": user.date_of_birth.isoformat() if user.date_of_birth else None,
        "bio": user.bio,
    }


def _computed_numerology(
    account: User,
    facts_block: dict[str, Any],
    as_of: date,
) -> dict[str, Any]:
    values: dict[str, Any] = {"accountProfile": None, "people": {}}
    if account.date_of_birth:
        values["accountProfile"] = asdict(
            calculate_atlas_memory_numerology(account.date_of_birth, as_of)
        )
    people = facts_block.get("people")
    if isinstance(people, list):
        for person in people:
            if not isinstance(person, dict) or not person.get("dateOfBirth") or not person.get("factId"):
                continue
            values["people"][str(person["factId"])] = asdict(
                calculate_atlas_memory_numerology(str(person["dateOfBirth"]), as_of)
            )
    return values


def _generation_input(
    db: Session,
    session: ChatSession,
    chat: Chat,
    user: User,
    atlas_memory: dict[str, Any],
) -> AtlasSummaryGenerationInput:
    intervals = db.query(SessionInterval).filter(SessionInterval.session_id == session.id).all()
    ended_at = max(_aware(item.ended_at) for item in intervals if item.ended_at is not None)
    facts_block = atlas_memory["factsBlock"]
    return AtlasSummaryGenerationInput(
        facts_block=facts_block,
        narrative_document=atlas_memory["narrativeDocument"],
        transcript=build_session_transcript(db, session, chat),
        computed_numerology=_computed_numerology(user, facts_block, ended_at.date()),
        account_profile=_account_profile(user),
        session_date=ended_at.date().isoformat(),
    )


def _claim_job(db: Session, chat_session_id: int, now: datetime) -> AtlasClientMemoryJob | None:
    job = (
        db.query(AtlasClientMemoryJob)
        .filter(AtlasClientMemoryJob.chat_session_id == chat_session_id)
        .with_for_update()
        .first()
    )
    if job is None or job.status == "COMPLETED":
        return None
    if job.status == "FAILED":
        retry_at = _aware(job.next_retry_at) if job.next_retry_at is not None else None
        if (
            job.recovery_cycles >= ATLAS_CLIENT_MEMORY_MAX_RECOVERY_CYCLES
            or retry_at is None
            or retry_at > _aware(now)
        ):
            return None
        job.status = "RETRY_PENDING"
        job.attempts = 0
        job.recovery_cycles += 1
        job.next_retry_at = None
        db.commit()
        db.refresh(job)
    stale_before = now - timedelta(minutes=ATLAS_CLIENT_MEMORY_STALE_PROCESSING_MINUTES)
    if (
        job.status == "PROCESSING"
        and job.processing_started_at is not None
        and _aware(job.processing_started_at) > stale_before
    ):
        return None
    if job.attempts >= 2:
        job.status = "FAILED"
        job.last_error_code = "ATTEMPT_LIMIT_REACHED"
        db.commit()
        return None
    job.status = "PROCESSING"
    job.attempts += 1
    job.processing_started_at = now
    job.last_error_code = None
    db.commit()
    db.refresh(job)
    return job


def process_atlas_client_memory_job_attempt(
    chat_session_id: int,
    dependencies: AtlasClientMemoryJobDependencies | None = None,
    session_factory=SessionLocal,
) -> str:
    """Run one durable attempt. Errors become retry state and never escape."""
    db = session_factory()
    deps = dependencies
    try:
        deps = deps or default_dependencies()
        now = deps.now()
        job = _claim_job(db, chat_session_id, now)
        if job is None:
            stored = db.get(AtlasClientMemoryJob, chat_session_id)
            return stored.status if stored else "ABSENT"

        session = db.get(ChatSession, chat_session_id)
        if session is None:
            raise RuntimeError("The memory job has no reading session.")
        chat = db.get(Chat, session.chat_id)
        if chat is None:
            raise RuntimeError("The memory job has no chat.")
        user = db.get(User, chat.user_id)
        if user is None:
            raise RuntimeError("The memory job has no client account.")

        atlas_memory = deps.atlas.read(chat.user_id, chat.psychic_id)
        summary: AtlasSummaryGenerationResult = deps.summarizer.generate(
            db,
            _generation_input(db, session, chat, user, atlas_memory),
        )
        current = atlas_memory.get("current")
        expected_version = current.get("versionNumber", 0) if isinstance(current, dict) else 0
        stored = deps.atlas.write({
            "sourceUserId": str(chat.user_id),
            "sourcePsychicId": str(chat.psychic_id),
            "sourceSessionId": str(session.id),
            "expectedVersion": expected_version,
            "narrativeDocument": summary.narrative_document,
            "proposedFacts": summary.proposed_facts,
            "instructionVersion": f"{summary.instruction_version}:prompt-{summary.prompt_version}",
            "modelIdentifier": summary.model_identifier,
        })
        job = db.get(AtlasClientMemoryJob, chat_session_id)
        job.status = "COMPLETED"
        job.completed_at = deps.now()
        job.processing_started_at = None
        job.last_error_code = None
        job.next_retry_at = None
        job.atlas_version_number = int(stored["current"]["versionNumber"])
        job.input_tokens = summary.input_tokens
        job.output_tokens = summary.output_tokens
        job.cost_usd = summary.cost_usd
        db.commit()
        logger.info(
            "atlas_client_memory_job_completed",
            chat_session_id=chat_session_id,
            attempt=job.attempts,
            atlas_version=job.atlas_version_number,
        )
        return "COMPLETED"
    except Exception as error:  # noqa: BLE001 - background memory must fail closed
        db.rollback()
        job = db.get(AtlasClientMemoryJob, chat_session_id)
        if job is None:
            logger.warning(
                "atlas_client_memory_job_missing",
                chat_session_id=chat_session_id,
                error_type=type(error).__name__,
            )
            return "ABSENT"
        job.status = "FAILED" if job.attempts >= 2 else "RETRY_PENDING"
        job.processing_started_at = None
        job.last_error_code = type(error).__name__[:120]
        if job.status == "FAILED" and job.recovery_cycles < ATLAS_CLIENT_MEMORY_MAX_RECOVERY_CYCLES:
            delay_minutes = ATLAS_CLIENT_MEMORY_RECOVERY_DELAYS_MINUTES[job.recovery_cycles]
            job.next_retry_at = deps.now() + timedelta(minutes=delay_minutes)
        elif job.status == "FAILED":
            job.next_retry_at = None
        db.commit()
        logger.warning(
            "atlas_client_memory_job_failed",
            chat_session_id=chat_session_id,
            attempt=job.attempts,
            terminal=job.status == "FAILED",
            error_type=job.last_error_code,
        )
        return job.status
    finally:
        db.close()


async def _run_job(chat_session_id: int) -> None:
    for _ in range(2):
        status = await asyncio.to_thread(process_atlas_client_memory_job_attempt, chat_session_id)
        if status != "RETRY_PENDING":
            return


def schedule_atlas_client_memory_job(chat_session_id: int) -> None:
    existing = _active_tasks.get(chat_session_id)
    if existing and not existing.done():
        return
    try:
        task = asyncio.create_task(_run_job(chat_session_id))
    except RuntimeError:
        logger.warning("atlas_client_memory_no_event_loop", chat_session_id=chat_session_id)
        return
    _active_tasks[chat_session_id] = task
    task.add_done_callback(lambda _: _active_tasks.pop(chat_session_id, None))


def pending_atlas_client_memory_job_ids(
    db: Session,
    now: datetime | None = None,
) -> list[int]:
    current = now or datetime.now(timezone.utc)
    stale_before = _for_column(
        db,
        current - timedelta(minutes=ATLAS_CLIENT_MEMORY_STALE_PROCESSING_MINUTES),
    )
    rows = (
        db.query(AtlasClientMemoryJob)
        .filter(
            or_(
                and_(
                    AtlasClientMemoryJob.attempts < 2,
                    or_(
                        AtlasClientMemoryJob.status.in_(("PENDING", "RETRY_PENDING")),
                        (
                            (AtlasClientMemoryJob.status == "PROCESSING")
                            & or_(
                                AtlasClientMemoryJob.processing_started_at.is_(None),
                                AtlasClientMemoryJob.processing_started_at <= stale_before,
                            )
                        ),
                    ),
                ),
                and_(
                    AtlasClientMemoryJob.status == "FAILED",
                    AtlasClientMemoryJob.recovery_cycles < ATLAS_CLIENT_MEMORY_MAX_RECOVERY_CYCLES,
                    AtlasClientMemoryJob.next_retry_at.is_not(None),
                    AtlasClientMemoryJob.next_retry_at <= _for_column(db, current),
                ),
            ),
        )
        .order_by(AtlasClientMemoryJob.created_at.asc(), AtlasClientMemoryJob.chat_session_id.asc())
        .limit(ATLAS_CLIENT_MEMORY_SWEEP_LIMIT)
        .all()
    )
    return [row.chat_session_id for row in rows]


def schedule_atlas_client_memory_sweep() -> int:
    db = SessionLocal()
    try:
        session_ids = pending_atlas_client_memory_job_ids(db)
    finally:
        db.close()
    for session_id in session_ids:
        schedule_atlas_client_memory_job(session_id)
    return len(session_ids)
