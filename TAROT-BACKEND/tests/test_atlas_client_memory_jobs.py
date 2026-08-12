from datetime import date, datetime, timedelta, timezone
import inspect

from sqlalchemy.orm import sessionmaker

from app.enums.chat_session_status import ChatSessionStatus
from app.enums.chat_status import ChatStatus
from app.enums.role import Role
from app.models.atlas_client_memory_job import AtlasClientMemoryJob
from app.models.chat import Chat
from app.models.chat_session import ChatSession
from app.models.message import Message
from app.models.session_intervals import SessionInterval
from app.services.atlas_client_memory_jobs import (
    AtlasClientMemoryJobDependencies,
    enqueue_atlas_client_memory_job,
    pending_atlas_client_memory_job_ids,
    process_atlas_client_memory_job_attempt,
)
from app.services.atlas_client_memory_summary import AtlasSummaryGenerationResult
from app.services.session_manager import SessionManager


class FakeAtlas:
    def __init__(self):
        self.reads = []
        self.writes = []

    def read(self, source_user_id, source_psychic_id):
        self.reads.append((source_user_id, source_psychic_id))
        return {
            "current": None,
            "factsBlock": {"schemaVersion": 1, "people": [], "clientFacts": []},
            "narrativeDocument": "",
        }

    def write(self, payload):
        self.writes.append(payload)
        return {"current": {"versionNumber": 1}, "idempotentReplay": False}


class FakeSummarizer:
    def __init__(self, fail=False):
        self.fail = fail
        self.inputs = []

    def generate(self, db, value):
        self.inputs.append(value)
        if self.fail:
            raise RuntimeError("synthetic provider failure")
        return AtlasSummaryGenerationResult(
            narrative_document="## HEADER\nSynthetic generated memory.",
            proposed_facts=[],
            prompt_key="atlas.client-memory-summary",
            prompt_version=3,
            instruction_version="post-session-summary-v1",
            model_identifier="deterministic-fake",
            input_tokens=100,
            output_tokens=200,
            cost_usd=0.001,
        )


def create_finished_session(db, make_user, *, suffix=1):
    client = make_user(role=Role.USER)
    client.date_of_birth = date(1992, 7, 22)
    client.bio = "Synthetic account bio."
    psychic = make_user(role=Role.PSYCHIC)
    chat = Chat(user_id=client.id, psychic_id=psychic.id, status=ChatStatus.ENDED)
    db.add(chat)
    db.flush()
    reading = ChatSession(chat_id=chat.id, status=ChatSessionStatus.COMPLETED)
    db.add(reading)
    db.flush()
    started = datetime(2042, 1, suffix, 10, 0, tzinfo=timezone.utc)
    ended = started + timedelta(minutes=10)
    db.add(SessionInterval(
        session_id=reading.id,
        started_at=started,
        ended_at=ended,
        is_billed=True,
    ))
    db.add_all([
        Message(
            chat_id=chat.id,
            sender_id=client.id,
            content="Synthetic client statement.",
            is_system=False,
            created_at=started + timedelta(minutes=1),
        ),
        Message(
            chat_id=chat.id,
            sender_id=psychic.id,
            content="Synthetic psychic output.",
            is_system=False,
            created_at=started + timedelta(minutes=2),
        ),
        Message(
            chat_id=chat.id,
            sender_id=None,
            content="Synthetic system event.",
            is_system=True,
            created_at=started + timedelta(minutes=3),
        ),
        Message(
            chat_id=chat.id,
            sender_id=client.id,
            content="Outside this paid session.",
            is_system=False,
            created_at=ended + timedelta(minutes=1),
        ),
    ])
    enqueue_atlas_client_memory_job(db, reading.id)
    db.commit()
    return reading.id, client.id, psychic.id


def factory_for(db):
    return sessionmaker(bind=db.get_bind(), expire_on_commit=False)


def test_successful_job_labels_exact_session_messages_and_writes_pair_scope(db, make_user):
    session_id, client_id, psychic_id = create_finished_session(db, make_user)
    atlas = FakeAtlas()
    summarizer = FakeSummarizer()
    dependencies = AtlasClientMemoryJobDependencies(
        atlas=atlas,
        summarizer=summarizer,
        now=lambda: datetime(2042, 1, 1, 12, 0, tzinfo=timezone.utc),
    )
    assert process_atlas_client_memory_job_attempt(
        session_id,
        dependencies,
        factory_for(db),
    ) == "COMPLETED"
    assert atlas.reads == [(client_id, psychic_id)]
    assert len(summarizer.inputs) == 1
    transcript = summarizer.inputs[0].transcript
    assert [line.speaker for line in transcript] == ["CLIENT", "PSYCHIC", "SYSTEM"]
    assert all("Outside" not in line.text for line in transcript)
    assert summarizer.inputs[0].account_profile["dateOfBirth"] == "1992-07-22"
    assert summarizer.inputs[0].computed_numerology["accountProfile"]["life_path"] == 5
    assert atlas.writes == [{
        "sourceUserId": str(client_id),
        "sourcePsychicId": str(psychic_id),
        "sourceSessionId": str(session_id),
        "expectedVersion": 0,
        "narrativeDocument": "## HEADER\nSynthetic generated memory.",
        "proposedFacts": [],
        "instructionVersion": "post-session-summary-v1:prompt-3",
        "modelIdentifier": "deterministic-fake",
    }]
    db.expire_all()
    job = db.get(AtlasClientMemoryJob, session_id)
    assert (job.status, job.attempts, job.atlas_version_number) == ("COMPLETED", 1, 1)
    assert (job.input_tokens, job.output_tokens, job.cost_usd) == (100, 200, 0.001)


def test_completed_job_is_idempotent_and_never_calls_the_model_twice(db, make_user):
    session_id, _, _ = create_finished_session(db, make_user, suffix=2)
    atlas = FakeAtlas()
    summarizer = FakeSummarizer()
    dependencies = AtlasClientMemoryJobDependencies(atlas=atlas, summarizer=summarizer)
    assert process_atlas_client_memory_job_attempt(session_id, dependencies, factory_for(db)) == "COMPLETED"
    assert process_atlas_client_memory_job_attempt(session_id, dependencies, factory_for(db)) == "COMPLETED"
    assert len(summarizer.inputs) == 1
    assert len(atlas.writes) == 1


def test_failure_retries_once_then_moves_on_without_transcript_in_error(db, make_user):
    session_id, _, _ = create_finished_session(db, make_user, suffix=3)
    dependencies = AtlasClientMemoryJobDependencies(atlas=FakeAtlas(), summarizer=FakeSummarizer(fail=True))
    assert process_atlas_client_memory_job_attempt(session_id, dependencies, factory_for(db)) == "RETRY_PENDING"
    assert process_atlas_client_memory_job_attempt(session_id, dependencies, factory_for(db)) == "FAILED"
    assert process_atlas_client_memory_job_attempt(session_id, dependencies, factory_for(db)) == "FAILED"
    db.expire_all()
    job = db.get(AtlasClientMemoryJob, session_id)
    assert (job.attempts, job.last_error_code) == (2, "RuntimeError")
    assert "Synthetic client statement" not in job.last_error_code


def test_sweep_only_finds_feature_jobs_and_never_backfills_completed_sessions(db, make_user):
    pending_id, _, _ = create_finished_session(db, make_user, suffix=4)
    historical_id, _, _ = create_finished_session(db, make_user, suffix=5)
    db.delete(db.get(AtlasClientMemoryJob, historical_id))
    db.commit()
    assert pending_atlas_client_memory_job_ids(
        db,
        datetime(2042, 1, 10, tzinfo=timezone.utc),
    ) == [pending_id]


def test_unprotected_session_end_enqueues_before_commit_and_schedules_after_commit():
    source = inspect.getsource(SessionManager.end_session)
    enqueue = source.index("enqueue_atlas_client_memory_job")
    commit = source.index("db.commit()", enqueue)
    schedule = source.index("schedule_atlas_client_memory_job", commit)
    assert enqueue < commit < schedule
    assert "schedule_memory_merge" not in source


def test_job_migration_is_the_direct_successor_to_existing_memory_summary_migration():
    import importlib.util
    from pathlib import Path

    migration_path = Path(__file__).parents[1] / "alembic" / "versions" / "f8a9b0c1d2e3_add_atlas_client_memory_jobs.py"
    spec = importlib.util.spec_from_file_location("atlas_memory_job_migration", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    assert migration.revision == "f8a9b0c1d2e3"
    assert migration.down_revision == "e6a7b8c9d0e1"
