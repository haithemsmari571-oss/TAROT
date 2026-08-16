"""Per-session state for the reading pipeline, and the metadata computed for Sabri.

Backend-core scope: this models the session (transcript, held-back buffer,
delivery queue, counters) and computes the metadata Sabri uses to detect a talker
vs a listener. The store is in-memory and the state is a plain dataclass so it can
be persisted for reconnect when the real-time layer is built (later phase).
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Dict, List, Optional

from app.logging_config import get_logger
from app.services.ai.reading_contracts import DeliveryItem, HeldItem

logger = get_logger(__name__)


@dataclass
class ReadingSessionState:
    session_id: str
    client_id: Optional[int] = None
    chat_id: Optional[int] = None
    client_file: Optional[str] = None
    # None means Atlas has not been attempted for this reading; "" is a completed
    # empty/failed fetch and is deliberately cached so later turns never retry it.
    atlas_memory_text: Optional[str] = None
    is_first_session: bool = True
    session_start: Optional[datetime] = None
    last_activity_at: Optional[datetime] = None
    chat_transcript: List[dict] = field(default_factory=list)  # {role, content, timestamp}
    held_back_buffer: List[HeldItem] = field(default_factory=list)
    # Two-role engine (READING_ENGINE=two_role): the Valentina content Sabri chose NOT to
    # send this turn, held VERBATIM for later turns. Replaced on a fresh-content (NEW) turn,
    # shrunk as Sabri releases from it on follow-up (CONTINUE) turns. Empty for other engines.
    reserve: str = ""
    delivery_queue: List[DeliveryItem] = field(default_factory=list)
    queue_position: int = 0
    messages_sent_count: int = 0
    client_response_lengths: List[int] = field(default_factory=list)  # chars per client msg
    client_response_times: List[float] = field(default_factory=list)  # reply latency, seconds
    sabri_correction_count: int = 0
    # Commitments (openly named cards, timing windows) regex-extracted from
    # DELIVERED turns only — never from discarded/regenerated drafts. Appended
    # by reading_ledger.record_commitments, re-injected into Valentina's next
    # turn so early-session commitments outlive the transcript window.
    commitment_ledger: List[dict] = field(default_factory=list)
    # ── Session capsule (services/ai/reading_capsule.py) ────────────────────
    # The running summary of the part of the conversation that has scrolled out of the
    # verbatim window, and how far along chat_transcript it has consumed. Additive only:
    # capsule_narrative is only ever appended to, never rewritten, and capsule_folded_upto
    # only ever moves forward. Both persist, so a restart mid-reading does not amnesia the
    # first two hours of it.
    capsule_narrative: str = ""
    capsule_folded_upto: int = 0
    # ── Pre-session reading (services/ai/reading_pre_session.py) ────────────
    # Valentina writes the reading from her request text while she waits to be accepted,
    # before any session exists and before anything is billed. These record where that got
    # to, so the CRM's auto-accept can wait on the reading instead of on a random timer.
    pre_reading_status: Optional[str] = None
    pre_reading_requested_at: Optional[datetime] = None
    pre_reading_ready_at: Optional[datetime] = None
    pre_reading_message_id: Optional[int] = None
    # True while delivery is parked at a wait_for_response barrier — a reconnect
    # must NOT cross it; only a new client message (which re-plans) may.
    waiting_for_response: bool = False


def create_session_state(
    session_id: str,
    *,
    client_id: Optional[int] = None,
    chat_id: Optional[int] = None,
    client_file: Optional[str] = None,
    is_first_session: bool = True,
    now: Optional[datetime] = None,
) -> ReadingSessionState:
    now = now or datetime.now()
    return ReadingSessionState(
        session_id=session_id,
        client_id=client_id,
        chat_id=chat_id,
        client_file=client_file,
        is_first_session=is_first_session,
        session_start=now,
        last_activity_at=now,
    )


def record_client_message(
    state: ReadingSessionState, content: str, now: Optional[datetime] = None
) -> None:
    """Append an inbound client message and record its length + reply latency."""
    now = now or datetime.now()
    latency = (
        (now - state.last_activity_at).total_seconds() if state.last_activity_at else 0.0
    )
    state.chat_transcript.append(
        {"role": "client", "content": content, "timestamp": now.isoformat()}
    )
    state.client_response_lengths.append(len(content or ""))
    state.client_response_times.append(max(0.0, latency))
    state.last_activity_at = now
    # A name, a date of birth or a sign SHE gives is as load-bearing as one the reader
    # names, and must survive into the capsule's facts block. Pure regex over the string —
    # no database, no IO — so this is safe on the inbound path.
    try:
        from app.services.ai.reading_ledger import record_client_facts

        record_client_facts(state, content)
    except Exception:  # noqa: BLE001 — memory upkeep must never reject a client message
        logger.warning("client_fact_record_failed", session_id=state.session_id)


def record_sent_message(
    state: ReadingSessionState, content: str, now: Optional[datetime] = None
) -> None:
    """Append an outbound (Logan/reader) message that was actually sent."""
    now = now or datetime.now()
    state.chat_transcript.append(
        {"role": "logan", "content": content, "timestamp": now.isoformat()}
    )
    state.messages_sent_count += 1
    state.last_activity_at = now


def _length_bucket(avg_chars: float) -> str:
    if avg_chars < 20:
        return "short"
    if avg_chars <= 100:
        return "medium"
    return "long"


def _speed_bucket(latency_seconds: Optional[float]) -> str:
    if latency_seconds is None:
        return "silent"
    if latency_seconds < 30:
        return "fast"
    if latency_seconds <= 120:
        return "normal"
    if latency_seconds <= 300:
        return "slow"
    return "silent"


def compute_metadata(state: ReadingSessionState, now: Optional[datetime] = None) -> dict:
    """Session metadata passed to Sabri on every call."""
    now = now or datetime.now()
    duration_min = (
        (now - state.session_start).total_seconds() / 60 if state.session_start else 0.0
    )
    lengths = state.client_response_lengths
    avg_len = sum(lengths) / len(lengths) if lengths else 0.0
    latest_latency = state.client_response_times[-1] if state.client_response_times else None
    return {
        "is_first_session": state.is_first_session,
        "session_duration_minutes": round(duration_min, 2),
        "messages_sent_count": state.messages_sent_count,
        "client_avg_response_length": _length_bucket(avg_len),
        "client_response_speed": _speed_bucket(latest_latency),
    }


# ── durability: write-through + rehydrate to reading_session_states (keyed by chat_id) ──
# The persisted messages/chats tables already hold delivered content; this layer persists
# ONLY the ephemeral engine state (reserve, held-back buffer, delivery queue + position,
# working transcript, counters) so a restart resumes a reading instead of starting empty
# (and resume_delivery no longer silently no-ops). Persistence NEVER breaks a turn: any DB
# error degrades to pure in-memory. DB availability is probed once and cached so a down or
# absent DB can't slow the hot path (or the test suite) with repeated slow connects.
def _chat_id_of(session_id: str) -> Optional[int]:
    if session_id and session_id.startswith("chat:"):
        try:
            return int(session_id.split(":", 1)[1])
        except ValueError:
            return None
    return None


def _state_to_row_fields(state: ReadingSessionState) -> dict:
    return dict(
        chat_id=state.chat_id,
        session_id=state.session_id,
        client_id=state.client_id,
        is_first_session=state.is_first_session,
        reserve=state.reserve or "",
        held_back_buffer=json.dumps([asdict(h) for h in state.held_back_buffer]),
        delivery_queue=json.dumps([asdict(d) for d in state.delivery_queue]),
        queue_position=state.queue_position,
        chat_transcript=json.dumps(state.chat_transcript or []),
        messages_sent_count=state.messages_sent_count,
        client_response_lengths=json.dumps(state.client_response_lengths or []),
        client_response_times=json.dumps(state.client_response_times or []),
        sabri_correction_count=state.sabri_correction_count,
        commitment_ledger=json.dumps(state.commitment_ledger or []),
        capsule_narrative=state.capsule_narrative or "",
        capsule_folded_upto=state.capsule_folded_upto or 0,
        pre_reading_status=state.pre_reading_status,
        pre_reading_requested_at=state.pre_reading_requested_at,
        pre_reading_ready_at=state.pre_reading_ready_at,
        pre_reading_message_id=state.pre_reading_message_id,
        waiting_for_response=state.waiting_for_response,
        session_start=state.session_start,
        last_activity_at=state.last_activity_at,
    )


def _naive_local(value: Optional[datetime]) -> Optional[datetime]:
    """Normalise a rehydrated datetime to the engine's NAIVE-local convention.

    The engine uses naive ``datetime.now()`` throughout, but Postgres returns
    timezone-AWARE datetimes for the store's timestamptz columns — mixing the two
    raises "can't subtract offset-naive and offset-aware datetimes" on the first
    ``record_client_message`` after a restart rehydration (the bug that silently
    killed every hybrid/duo turn post-restart). SQLite returns naive values, which
    pass through untouched — which is also why the restart test alone missed this."""
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone().replace(tzinfo=None)


def _row_to_state(row) -> ReadingSessionState:
    return ReadingSessionState(
        session_id=row.session_id,
        client_id=row.client_id,
        chat_id=row.chat_id,
        is_first_session=row.is_first_session,
        reserve=row.reserve or "",
        held_back_buffer=[HeldItem(**h) for h in json.loads(row.held_back_buffer or "[]")],
        delivery_queue=[DeliveryItem(**d) for d in json.loads(row.delivery_queue or "[]")],
        queue_position=row.queue_position,
        chat_transcript=json.loads(row.chat_transcript or "[]"),
        messages_sent_count=row.messages_sent_count,
        client_response_lengths=json.loads(row.client_response_lengths or "[]"),
        client_response_times=json.loads(row.client_response_times or "[]"),
        sabri_correction_count=row.sabri_correction_count,
        commitment_ledger=json.loads(getattr(row, "commitment_ledger", None) or "[]"),
        capsule_narrative=getattr(row, "capsule_narrative", None) or "",
        capsule_folded_upto=int(getattr(row, "capsule_folded_upto", None) or 0),
        pre_reading_status=getattr(row, "pre_reading_status", None),
        pre_reading_requested_at=_naive_local(getattr(row, "pre_reading_requested_at", None)),
        pre_reading_ready_at=_naive_local(getattr(row, "pre_reading_ready_at", None)),
        pre_reading_message_id=getattr(row, "pre_reading_message_id", None),
        waiting_for_response=row.waiting_for_response,
        session_start=_naive_local(row.session_start),
        last_activity_at=_naive_local(row.last_activity_at),
    )


class SessionStore:
    """Session store keyed by session_id, write-through to ``reading_session_states`` and
    rehydrating from it on an in-memory miss — so a backend restart resumes a reading
    instead of starting empty. ``session_factory`` is injectable for tests; the process
    singleton uses the app's ``SessionLocal``. Persistence degrades gracefully to pure
    in-memory (the prior behaviour) on any DB error, probing availability once and caching
    it so a down/absent DB never slows the hot path."""

    def __init__(self, session_factory=None) -> None:
        self._sessions: Dict[str, ReadingSessionState] = {}
        self._session_factory = session_factory  # None -> app SessionLocal (lazy)
        self._db_ok: Optional[bool] = None        # None=unprobed; cached True/False after

    def _open(self):
        if self._session_factory is not None:
            return self._session_factory()
        from app.database.client import SessionLocal

        return SessionLocal()

    # ── in-memory + durable ──────────────────────────────────────────────────
    def get(self, session_id: str) -> Optional[ReadingSessionState]:
        state = self._sessions.get(session_id)
        if state is not None:
            return state
        return self._rehydrate(session_id)  # cold miss -> the DB (post-restart resume)

    def put(self, state: ReadingSessionState) -> None:
        self._sessions[state.session_id] = state
        self._persist(state)  # write-through

    def get_or_create(self, session_id: str, **kwargs) -> ReadingSessionState:
        state = self.get(session_id)  # rehydrate-aware
        if state is None:
            state = create_session_state(session_id, **kwargs)
            self.put(state)
        return state

    def delete(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)
        self._delete_row(_chat_id_of(session_id))

    # ── durability helpers (never raise into a turn) ─────────────────────────
    def _persist(self, state: ReadingSessionState) -> None:
        if state.chat_id is None or self._db_ok is False:
            return
        try:
            from app.models.reading_session_state import ReadingSessionStateRow

            fields = _state_to_row_fields(state)
            with self._open() as db:
                row = db.get(ReadingSessionStateRow, state.chat_id)
                if row is None:
                    db.add(ReadingSessionStateRow(**fields))
                else:
                    for key, value in fields.items():
                        setattr(row, key, value)
                db.commit()
            self._db_ok = True
        except Exception as e:  # noqa: BLE001 — persistence must never break a turn
            if self._db_ok is None:
                self._db_ok = False  # DB down/absent this process -> stop retrying
            logger.warning("reading_session_persist_failed", chat_id=state.chat_id, error=str(e))

    def _rehydrate(self, session_id: str) -> Optional[ReadingSessionState]:
        chat_id = _chat_id_of(session_id)
        if chat_id is None or self._db_ok is False:
            return None
        try:
            from app.models.reading_session_state import ReadingSessionStateRow

            with self._open() as db:
                row = db.get(ReadingSessionStateRow, chat_id)
            self._db_ok = True
            if row is None:
                return None
            state = _row_to_state(row)
            self._sessions[session_id] = state
            return state
        except Exception as e:  # noqa: BLE001
            if self._db_ok is None:
                self._db_ok = False
            logger.warning("reading_session_rehydrate_failed", chat_id=chat_id, error=str(e))
            return None

    def _delete_row(self, chat_id: Optional[int]) -> None:
        if chat_id is None or self._db_ok is False:
            return
        try:
            from app.models.reading_session_state import ReadingSessionStateRow

            with self._open() as db:
                row = db.get(ReadingSessionStateRow, chat_id)
                if row is not None:
                    db.delete(row)
                    db.commit()
        except Exception as e:  # noqa: BLE001
            logger.warning("reading_session_delete_failed", chat_id=chat_id, error=str(e))


_STORE = SessionStore()


def get_session_store() -> SessionStore:
    return _STORE
