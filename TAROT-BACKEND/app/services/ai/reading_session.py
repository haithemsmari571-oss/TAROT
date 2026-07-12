"""Per-session state for the reading pipeline, and the metadata computed for Sabri.

Backend-core scope: this models the session (transcript, held-back buffer,
delivery queue, counters) and computes the metadata Sabri uses to detect a talker
vs a listener. The store is in-memory and the state is a plain dataclass so it can
be persisted for reconnect when the real-time layer is built (later phase).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional

from app.services.ai.reading_contracts import DeliveryItem, HeldItem


@dataclass
class ReadingSessionState:
    session_id: str
    client_id: Optional[int] = None
    chat_id: Optional[int] = None
    client_file: Optional[str] = None
    is_first_session: bool = True
    session_start: Optional[datetime] = None
    last_activity_at: Optional[datetime] = None
    chat_transcript: List[dict] = field(default_factory=list)  # {role, content, timestamp}
    held_back_buffer: List[HeldItem] = field(default_factory=list)
    delivery_queue: List[DeliveryItem] = field(default_factory=list)
    queue_position: int = 0
    messages_sent_count: int = 0
    client_response_lengths: List[int] = field(default_factory=list)  # chars per client msg
    client_response_times: List[float] = field(default_factory=list)  # reply latency, seconds
    sabri_correction_count: int = 0
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


class SessionStore:
    """In-memory session store, keyed by session_id. Swap for a persisted store
    when reconnect support lands with the real-time layer."""

    def __init__(self) -> None:
        self._sessions: Dict[str, ReadingSessionState] = {}

    def get(self, session_id: str) -> Optional[ReadingSessionState]:
        return self._sessions.get(session_id)

    def put(self, state: ReadingSessionState) -> None:
        self._sessions[state.session_id] = state

    def get_or_create(self, session_id: str, **kwargs) -> ReadingSessionState:
        state = self._sessions.get(session_id)
        if state is None:
            state = create_session_state(session_id, **kwargs)
            self._sessions[session_id] = state
        return state

    def delete(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)


_STORE = SessionStore()


def get_session_store() -> SessionStore:
    return _STORE
