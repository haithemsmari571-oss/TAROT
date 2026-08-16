"""The reading is written while she waits to be accepted, not while she is being billed.

Every session used to start empty. The first minute went on getting to a starting point —
what is going on, who is he, when was he born — with the client connected and the meter
running. She paid for the intake.

She now writes it once, in the box on the request, and Valentina writes the whole reading
from it before anyone accepts. That happens in the gap that already exists between
requesting and being accepted, where nothing is billed and no session is open, and it reads
as the psychic preparing for her rather than as a form.

ACCEPTANCE ITSELF IS NOT HERE. It lives in the Second Brain CRM, which already claims
requests server-side from the owner's cockpit switch. Building a second accepter here would
put two of them in a race for the same request. What this module provides instead is the
answer to the only question the CRM's timer was ever standing in for: is her reading ready
yet? See ``acceptance_signal``.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from app.logging_config import get_logger

logger = get_logger(__name__)

# Never accept sooner than this, however fast generation was. A request answered the instant
# it arrives reads as a machine, and the whole point is that it reads as a person preparing.
MIN_HOLD_SECONDS = 10
# Accept anyway at this point. A slow or broken pre-reading must cost her a normal session,
# never a hung request: past here the answer is "go", and the session opens exactly as it
# did before any of this existed.
MAX_HOLD_SECONDS = 120

PENDING = "PENDING"
READY = "READY"
FAILED = "FAILED"
NONE = "NONE"

# The one global stop. Stored in the existing key/value settings table so it can be turned
# off through the admin settings route without a deploy. Absent means on.
AUTO_ACCEPT_SETTING_KEY = "reading_auto_accept_enabled"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def auto_accept_enabled(db) -> bool:
    """The global switch. Anything but an explicit 'false' means acceptance may proceed."""
    from app.models.settings import Settings

    try:
        row = db.query(Settings).filter(Settings.key == AUTO_ACCEPT_SETTING_KEY).first()
    except Exception:  # noqa: BLE001 — a missing/unreadable switch must not stop readings
        return True
    if row is None:
        return True
    return str(row.value).strip().lower() not in ("false", "0", "off", "no")


# ─────────────────────────────────────────────────────────────────────────────
# Writing the reading, before the session exists
# ─────────────────────────────────────────────────────────────────────────────
def _mark(chat_id: int, status: str, *, ready_at: Optional[datetime] = None) -> None:
    """Record where the pre-reading has got to, on the chat's engine state."""
    from app.services.ai.reading_session import get_session_store

    store = get_session_store()
    state = store.get(f"chat:{chat_id}")
    if state is None:
        return
    state.pre_reading_status = status
    if ready_at is not None:
        state.pre_reading_ready_at = ready_at
    store.put(state)


async def write_pre_reading(chat_id: int, client_id: int, psychic_id: int,
                            request_text: str, message_id: Optional[int] = None) -> None:
    """Run Valentina against her request text and bank it. Never raises.

    Fire-and-forget from the request endpoint: the client's request must return immediately,
    and a failure here has to degrade to exactly the old behaviour — an empty session that
    opens normally."""
    import asyncio

    from app.services.ai import reading_duo
    from app.services.ai.reading_session import (
        create_session_state, get_session_store, record_client_message,
    )

    started = _now()
    try:
        store = get_session_store()
        state = store.get(f"chat:{chat_id}")
        if state is None:
            state = create_session_state(
                f"chat:{chat_id}", client_id=client_id, chat_id=chat_id,
                is_first_session=True,
            )
        # Her own words go on the transcript here, so the reading is written against them
        # and so the capsule already knows what she said before a single message is sent.
        if not any(
            entry.get("role") == "client" and entry.get("content") == request_text
            for entry in (state.chat_transcript or [])
        ):
            record_client_message(state, request_text)
        state.pre_reading_status = PENDING
        state.pre_reading_requested_at = started
        state.pre_reading_message_id = message_id
        await asyncio.to_thread(store.put, state)

        gender = await asyncio.to_thread(_load_gender, client_id)
        trigger = state.chat_transcript[-1] if state.chat_transcript else None
        text = await reading_duo._write_valentina_turn(
            chat_id, request_text, trigger, state, client_id,
            psychic_id=psychic_id, gender=gender,
        )
        if not (text or "").strip():
            raise RuntimeError("Valentina returned nothing for the pre-reading")

        # Banked exactly the way her writing is banked mid-session: accumulated, never
        # replaced, so the session opens with a full reading already in hand.
        state = store.get(f"chat:{chat_id}") or state
        state.reserve = reading_duo.accumulate_reserve(state.reserve or "", text)
        state.pre_reading_status = READY
        state.pre_reading_ready_at = _now()
        await asyncio.to_thread(store.put, state)
        logger.info(
            "reading_pre_session_ready", chat_id=chat_id, chars=len(text),
            seconds=round((_now() - started).total_seconds(), 2),
        )
    except Exception as error:  # noqa: BLE001 — a failed pre-reading is a normal session
        logger.error(
            "reading_pre_session_failed", chat_id=chat_id,
            error_type=type(error).__name__, error=str(error)[:200],
        )
        try:
            await asyncio.to_thread(_mark, chat_id, FAILED)
        except Exception:  # noqa: BLE001
            pass


def _load_gender(client_id: int):
    from app.database.client import SessionLocal
    from app.models.user import User

    try:
        with SessionLocal() as db:
            row = db.query(User.gender).filter(User.id == client_id).first()
        return getattr(row[0], "value", None) if row else None
    except Exception:  # noqa: BLE001
        return None


def schedule_pre_reading(chat_id: int, client_id: int, psychic_id: int,
                         request_text: str, message_id: Optional[int] = None) -> None:
    """Start it without making the client's request wait on a model call."""
    import asyncio

    if not (request_text or "").strip():
        return
    try:
        task = asyncio.create_task(
            write_pre_reading(chat_id, client_id, psychic_id, request_text, message_id)
        )
    except RuntimeError:
        logger.warning("reading_pre_session_no_event_loop", chat_id=chat_id)
        return
    task.add_done_callback(lambda done: done.cancelled() or done.exception())


# ─────────────────────────────────────────────────────────────────────────────
# Opening the session she has already written to
# ─────────────────────────────────────────────────────────────────────────────
async def open_first_turn(chat_id: int, chat_session_id: int,
                          psychic_id: Optional[int] = None) -> bool:
    """Start the reading from what she wrote on the request, at normal conversation pace.

    Her request message is re-pointed onto the live session and handed to the ordinary burst
    coordinator, which is the whole trick: she then gets exactly what any other turn gets,
    in the same order and at the same speed. Sabri's opening line, warm and specific to what
    she actually wrote, with one ask if the reading needs something. Then the read pause.
    Then the typing indicator. Then the reading itself, revealed at typing speed from the
    reserve that was banked while she was waiting.

    What she must NOT get is the whole reading the instant she connects. It is already
    written, and if it simply appeared she would know no one had read anything.

    Returns True when it drove the turn, so the caller knows not to send the generic hello
    as well. Never raises — a failure here leaves an ordinary empty session."""
    import asyncio

    from app.database.client import SessionLocal
    from app.models.message import Message
    from app.services.ai import reading_burst
    from app.services.ai.reading_session import get_session_store

    try:
        state = get_session_store().get(f"chat:{chat_id}")
        if state is None or not (state.reserve or "").strip():
            return False       # nothing was banked: an ordinary session, opened the old way

        def _adopt() -> Optional[tuple]:
            """Move her request message onto the live session so the engine can see it."""
            with SessionLocal() as db:
                row = None
                if getattr(state, "pre_reading_message_id", None):
                    row = db.get(Message, state.pre_reading_message_id)
                if row is None or row.chat_id != chat_id:
                    row = (
                        db.query(Message)
                        .filter(Message.chat_id == chat_id, Message.is_system.is_(False))
                        .order_by(Message.id.desc())
                        .first()
                    )
                if row is None:
                    return None
                if row.chat_session_id != chat_session_id:
                    row.chat_session_id = chat_session_id
                    db.commit()
                return int(row.id), str(row.content or "")

        adopted = await asyncio.to_thread(_adopt)
        if adopted is None:
            return False
        message_id, content = adopted
        logger.info(
            "reading_pre_session_first_turn", chat_id=chat_id,
            chat_session_id=chat_session_id, message_id=message_id,
            reserve_chars=len((state.reserve or "").strip()),
        )
        # From here it is an ordinary turn in every respect.
        await reading_burst.note_client_message(
            chat_id, chat_session_id, message_id, content=content, psychic_id=psychic_id,
        )
        return True
    except Exception as error:  # noqa: BLE001 — never break a join
        logger.warning(
            "reading_pre_session_first_turn_failed", chat_id=chat_id,
            error_type=type(error).__name__,
        )
        return False


# ─────────────────────────────────────────────────────────────────────────────
# The signal the CRM waits on instead of a random timer
# ─────────────────────────────────────────────────────────────────────────────
def acceptance_signal(db, chat_id: int) -> dict:
    """Everything the CRM's auto-accept needs to decide whether to claim this request now.

    The policy lives here rather than there, because the state it depends on lives here:
    the CRM asks one question and gets one answer. ``accept_now`` already accounts for the
    ten-second floor, the two-minute ceiling, a failed pre-reading and the global switch,
    so the CRM's side of this is "poll, and accept when it says yes"."""
    from app.enums.chat_status import ChatStatus
    from app.enums.response_mode import ResponseMode
    from app.models.chat import Chat
    from app.services.ai.reading_session import get_session_store

    chat = db.query(Chat).filter(Chat.id == chat_id).first()
    if chat is None:
        return {"chat_id": chat_id, "found": False}

    state = get_session_store().get(f"chat:{chat_id}")
    status = getattr(state, "pre_reading_status", None) or NONE
    ready_at = _aware(getattr(state, "pre_reading_ready_at", None))
    requested_at = _aware(getattr(state, "pre_reading_requested_at", None))

    now = _now()
    waited = (now - requested_at).total_seconds() if requested_at else None
    enabled = auto_accept_enabled(db)
    is_automatic = chat.response_mode == ResponseMode.SABRI
    is_pending = chat.status == ChatStatus.REQUESTED

    # The floor applies to everything; past the ceiling the answer is always go.
    past_floor = waited is not None and waited >= MIN_HOLD_SECONDS
    past_ceiling = waited is not None and waited >= MAX_HOLD_SECONDS
    reading_settled = status in (READY, FAILED)
    # No pre-reading was ever started (an older request, or a blank one): there is nothing
    # to wait for, so only the floor applies.
    if status == NONE:
        reading_settled = True

    accept_now = bool(
        enabled and is_automatic and is_pending
        and (past_ceiling or (past_floor and reading_settled))
    )

    return {
        "chat_id": chat_id,
        "found": True,
        "accept_now": accept_now,
        "status": status,
        "ready": status == READY,
        "failed": status == FAILED,
        "ready_at": ready_at.isoformat() if ready_at else None,
        "requested_at": requested_at.isoformat() if requested_at else None,
        "waited_seconds": round(waited, 2) if waited is not None else None,
        "min_hold_seconds": MIN_HOLD_SECONDS,
        "max_hold_seconds": MAX_HOLD_SECONDS,
        "auto_accept_enabled": enabled,
        "response_mode": chat.response_mode.value,
        "chat_status": chat.status.value,
        "reserve_chars": len((getattr(state, "reserve", "") or "").strip()),
    }
