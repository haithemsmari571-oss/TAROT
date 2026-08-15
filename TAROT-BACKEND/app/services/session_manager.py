"""
Session Manager: Single source of truth for chat session lifecycle and timing.

This manager:
- Tracks all active session state in memory (with DB as source of truth)
- Monitors balance and auto-ends sessions when insufficient
- Calculates elapsed time, estimated cost, and remaining time
- Broadcasts real-time timer updates via WebSocket
- Provides interfaces to start, end, pause, and resume sessions
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.logging_config import get_logger
from app.config import get_app_settings
from app.models.chat import Chat
from app.models.user import User
from app.models.chat_session import ChatSession
from app.models.session_intervals import SessionInterval
from app.enums.chat_status import ChatStatus
from app.enums.chat_session_status import ChatSessionStatus
from app.enums.chat_session_triggers import ChatSessionTrigger
from app.enums.chat_termination_reason import ChatTerminationReason
from app.exceptions.transactions import (
    InsufficientBalanceError as TxnInsufficientBalanceError,
)
from app.manager import manager  # WebSocket connection manager
from app.services.stardust_rewards import (
    get_earned_stardust_balance,
    get_spendable_stardust,
)

logger = get_logger(__name__)
settings = get_app_settings()

# ── Per-minute prepaid billing ───────────────────────────────────────────────
# Billing model: the client is charged one full minute UPFRONT the moment the
# session becomes ACTIVE (both joined), then one more full minute at each minute
# boundary. Every debit is exactly the reader's per-minute rate — no partial
# seconds, no rounding to whole points. When the balance can't cover the next
# minute the session enters a GRACE pause (below) instead of ending instantly.
GRACE_SECONDS = 60  # client has 60s to top up before the session ends
TOPUP_HOLD_CAP_SECONDS = 300  # …extended to 5 min total once they start a top-up


def _per_minute_rate(rate_per_second: float) -> float:
    """Exact per-minute charge in points (£), to 2 dp (pennies)."""
    return round((rate_per_second or 0) * 60, 2)


class InsufficientBalanceError(Exception):
    """Raised when user doesn't have enough balance to start a session"""

    pass


class SessionNotFoundError(Exception):
    """Raised when trying to operate on a non-existent session"""

    pass


@dataclass
class SessionInfo:
    """Session information returned to clients"""

    chat_id: int
    elapsed_seconds: int
    estimated_cost: float
    remaining_seconds: int
    client_balance: float  # total spendable = credit + paid
    chat_status: str
    session_status: str
    started_at: str
    rate_per_second: float
    # Split of client_balance so the operator sees free credit vs paid.
    credit_balance: float = 0.0
    paid_balance: float = 0.0
    # Per-minute prepaid model.
    rate_per_minute: float = 0.0
    minutes_charged: int = 0
    remaining_minutes: int = 0  # whole minutes still affordable (incl. current)
    # Grace/top-up state (only meaningful while session_status == "GRACE").
    grace_seconds_left: int = 0  # countdown before the session auto-ends
    is_topping_up: bool = False
    # True only for the first successful client-join transition of this paid
    # ChatSession. The join route uses it to send one reader greeting; ordinary
    # mounts and WebSocket reconnects receive False.
    client_joined_now: bool = False


@dataclass
class SessionState:
    """In-memory state for an active session"""

    chat_id: int
    session_id: int
    interval_id: int
    started_at: datetime
    client_id: int
    psychic_id: int
    rate_per_second: float

    # Session duration calculated at start (independent of billing)
    max_session_duration_seconds: (
        int  # How long session can run based on initial balance
    )
    initial_balance: float  # Balance when session started

    # Tracking fields
    last_check_at: datetime = field(default_factory=datetime.now)

    # Warning flags
    warning_5min_sent: bool = False
    warning_60s_sent: bool = False
    warning_30s_sent: bool = False
    warning_10s_sent: bool = False

    # Disconnect tracking
    client_disconnected_at: Optional[datetime] = None

    # Join gating: between psychic-accept and client-join the session exists but
    # the timer is NOT running. `awaiting_join` is True until the client joins;
    # while True the monitor skips this session so it never elapses or depletes.
    awaiting_join: bool = False
    client_joined_at: Optional[datetime] = None

    # ── Per-minute prepaid billing state ────────────────────────────────────
    # How many whole minutes have been charged upfront so far.
    minutes_charged: int = 0
    # Elapsed seconds frozen at the moment the meter stopped (pause/grace). On
    # resume, started_at is set to (now - paused_elapsed_seconds) so the counter
    # continues from exactly where it stopped.
    paused_elapsed_seconds: int = 0

    # ── Grace / top-up state ────────────────────────────────────────────────
    # True while the session is in the out-of-balance grace pause (meter stopped,
    # billing stopped, input locked, client offered a top-up).
    is_grace: bool = False
    grace_started_at: Optional[datetime] = None
    # Set once the client actually starts a top-up, which extends the hold from
    # GRACE_SECONDS to TOPUP_HOLD_CAP_SECONDS so an in-flight checkout isn't cut off.
    topping_up: bool = False
    # Total balance at the moment grace began — lets resume report "+£X topped up".
    grace_entry_balance: float = 0.0
    # Amount added between grace entry and resume (for the transcript line).
    last_topup_amount: float = 0.0


class SessionManager:
    """
    Manages chat session lifecycle and timing.

    Single source of truth for:
    - Session timing (elapsed, remaining)
    - Session state (ACTIVE, PAUSED, ENDED)
    - Balance monitoring
    - Session termination
    """

    def __init__(self):
        """Initialize SessionManager without DB session (uses session-per-operation)"""
        self.active_sessions: Dict[int, SessionState] = {}
        self.paused_sessions: Dict[
            int, SessionState
        ] = {}  # Track paused sessions for resume
        self.requested_sessions: set[int] = set()
        self._monitoring_task: Optional[asyncio.Task] = None
        self._running = False
        self._last_atlas_memory_sweep: Optional[datetime] = None

    async def start(self):
        """Start the session manager and monitoring loop"""
        logger.info("session_manager_starting")
        self._running = True

        # Load any active sessions from DB on startup
        self._load_active_sessions_from_db()

        # Only jobs created by the new session-end hook are swept. Completed
        # historical readings have no job row and are never backfilled.
        try:
            from app.services.atlas_client_memory_jobs import (
                schedule_atlas_client_memory_sweep,
            )

            schedule_atlas_client_memory_sweep()
            self._last_atlas_memory_sweep = datetime.now()
        except Exception as atlas_e:  # noqa: BLE001 - never block app startup
            logger.warning(
                "atlas_client_memory_startup_sweep_failed",
                error_type=type(atlas_e).__name__,
            )

        # Start monitoring loop
        self._monitoring_task = asyncio.create_task(self._monitor_sessions())
        logger.info(
            "session_manager_started", active_sessions=len(self.active_sessions)
        )

    async def stop(self):
        """Stop the session manager gracefully"""
        logger.info("session_manager_stopping")
        self._running = False

        if self._monitoring_task:
            self._monitoring_task.cancel()
            try:
                await self._monitoring_task
            except asyncio.CancelledError:
                pass

        logger.info("session_manager_stopped")

    def _load_active_sessions_from_db(self):
        """Load existing active sessions from database on startup"""
        from app.database.client import SessionLocal

        db = SessionLocal()
        try:
            # Find all active chats with active sessions
            active_chats = db.query(Chat).filter(Chat.status == ChatStatus.ACTIVE).all()

            for chat in active_chats:
                # Get the latest session
                session = (
                    db.query(ChatSession)
                    .filter(
                        ChatSession.chat_id == chat.id,
                        ChatSession.status == ChatSessionStatus.ACTIVE,
                    )
                    .order_by(desc(ChatSession.id))
                    .first()
                )

                if not session:
                    continue

                # Get the current interval (one without ended_at)
                interval = (
                    db.query(SessionInterval)
                    .filter(
                        SessionInterval.session_id == session.id,
                        SessionInterval.ended_at == None,
                    )
                    .order_by(desc(SessionInterval.id))
                    .first()
                )

                if not interval:
                    continue

                # Get user to calculate remaining session time
                user = db.query(User).filter(User.id == chat.user_id).first()
                if not user:
                    continue

                # Calculate elapsed time and remaining session time
                elapsed = int((datetime.now() - interval.started_at).total_seconds())
                # For existing sessions, estimate max duration from current state
                # max_duration = elapsed + (spendable_balance / rate)
                spendable = get_spendable_stardust(db, user)
                estimated_max_duration = elapsed + int(
                    spendable / chat.psychic.price_per_second
                    if chat.psychic.price_per_second > 0
                    else 0
                )

                # Estimate minutes already charged so a restart doesn't re-bill
                # minutes that already elapsed: every due minute up to now is
                # assumed charged (it was, while the session was live).
                already_charged = 0 if chat.client_joined_at is None else int(elapsed // 60) + 1

                # Create session state
                session_state = SessionState(
                    chat_id=chat.id,
                    session_id=session.id,
                    interval_id=interval.id,
                    started_at=interval.started_at,
                    client_id=chat.user_id,
                    psychic_id=chat.psychic_id,
                    rate_per_second=chat.psychic.price_per_second,
                    max_session_duration_seconds=estimated_max_duration,
                    initial_balance=float(spendable),  # Current spendable balance as proxy
                    last_check_at=datetime.now(),
                    # If the client never joined, keep the timer gated after restart.
                    awaiting_join=(chat.client_joined_at is None),
                    client_joined_at=chat.client_joined_at,
                    minutes_charged=already_charged,
                )

                self.active_sessions[chat.id] = session_state
                logger.info(
                    "loaded_active_session",
                    chat_id=chat.id,
                    elapsed=elapsed,
                    estimated_max_duration=estimated_max_duration,
                )

            # Load requested chats
            requested_chats = (
                db.query(Chat).filter(Chat.status == ChatStatus.REQUESTED).all()
            )
            for chat in requested_chats:
                self.requested_sessions.add(chat.id)
                logger.info("loaded_requested_session", chat_id=chat.id)

        except Exception as e:
            logger.error("error_loading_active_sessions", error=str(e))
        finally:
            db.close()

    def register_request(self, chat_id: int):
        """Register a chat request in the session manager"""
        self.requested_sessions.add(chat_id)
        logger.info("chat_request_registered", chat_id=chat_id)

    def unregister_request(self, chat_id: int):
        """Unregister a chat request from the session manager"""
        self.requested_sessions.discard(chat_id)
        logger.info("chat_request_unregistered", chat_id=chat_id)

    async def start_session(self, chat_id: int) -> SessionInfo:
        """
        Start a new chat session.

        Called when psychic accepts a chat request.

        Args:
            chat_id: The chat ID to start session for

        Returns:
            SessionInfo with initial session data

        Raises:
            InsufficientBalanceError: If user doesn't have enough balance
        """
        from app.database.client import SessionLocal

        logger.info("starting_session", chat_id=chat_id)

        db = SessionLocal()
        try:
            # Get chat, user, and psychic
            chat = db.query(Chat).filter(Chat.id == chat_id).first()
            if not chat:
                raise ValueError(f"Chat {chat_id} not found")

            user = db.query(User).filter(User.id == chat.user_id).first()
            psychic = chat.psychic

            # Validate minimum balance. Spendable = earned + credit + paid, since
            # earned Stardust funds readings at full value (spent first).
            min_required = (
                psychic.price_per_second * settings.SESSION_MINIMUM_BALANCE_SECONDS
            )
            spendable = get_spendable_stardust(db, user)
            if spendable < min_required:
                logger.warning(
                    "insufficient_balance_for_session_start",
                    chat_id=chat_id,
                    user_balance=spendable,
                    min_required=min_required,
                )
                raise InsufficientBalanceError(
                    f"Minimum {min_required} points required ({settings.SESSION_MINIMUM_BALANCE_SECONDS} seconds)"
                )

            # Promote the durable request session so its initial request message
            # and every live message share one exact reading-session identity.
            chat_session = (
                db.query(ChatSession)
                .filter(
                    ChatSession.chat_id == chat_id,
                    ChatSession.status == ChatSessionStatus.REQUESTED,
                )
                .order_by(ChatSession.id.desc())
                .first()
            )
            if chat_session is None:
                # Compatibility for requests created before exact message/session
                # linking was deployed.
                chat_session = ChatSession(
                    chat_id=chat_id,
                    status=ChatSessionStatus.ACTIVE,
                    created_at=datetime.now(),
                )
                db.add(chat_session)
                db.flush()
            else:
                chat_session.status = ChatSessionStatus.ACTIVE

            # Create SessionInterval. is_billed=True: the per-minute prepaid
            # engine debits money directly (one DEBIT per minute), so intervals
            # exist only for timing/history — the legacy interval biller and the
            # periodic billing task must never touch them (would double-charge).
            interval = SessionInterval(
                session_id=chat_session.id,
                started_at=datetime.now(),
                trigger_event=ChatSessionTrigger.INITIAL_START,
                is_billed=True,
            )
            db.add(interval)

            # Update chat status
            chat.status = ChatStatus.ACTIVE

            # A new session must be joined afresh. Chats are reused per
            # client-psychic pair, so clear any join stamp left on this row by a
            # previous session — otherwise the never-joined billing guard and the
            # awaiting-join gate would treat every repeat session as already
            # joined and bill it from accept even if the client never opens it.
            chat.client_joined_at = None

            db.commit()
            db.refresh(chat_session)
            db.refresh(interval)

            # Calculate max session duration based on initial (spendable) balance.
            # This is independent of billing - session ends when elapsed time reaches this
            max_duration = (
                int(spendable / psychic.price_per_second)
                if psychic.price_per_second > 0
                else 0
            )

            # Remove from requested (if it was a REQUESTED chat)
            self.unregister_request(chat_id)

            # Add to memory cache
            session_state = SessionState(
                chat_id=chat_id,
                session_id=chat_session.id,
                interval_id=interval.id,
                started_at=interval.started_at,
                client_id=chat.user_id,
                psychic_id=chat.psychic_id,
                rate_per_second=psychic.price_per_second,
                max_session_duration_seconds=max_duration,
                initial_balance=float(spendable),
                last_check_at=datetime.now(),
                # Timer does not run until the client joins the chat screen.
                awaiting_join=True,
                client_joined_at=None,
            )
            self.active_sessions[chat_id] = session_state

            logger.info(
                "session_state_created",
                chat_id=chat_id,
                initial_balance=user.balance,
                max_duration_seconds=max_duration,
                rate_per_second=psychic.price_per_second,
            )

            # Calculate and return initial session info (pass db to use same session)
            info = self._calculate_session_info(session_state, db)

            logger.info(
                "session_started",
                chat_id=chat_id,
                session_id=chat_session.id,
                interval_id=interval.id,
                remaining_seconds=info.remaining_seconds,
            )

            # NOTE: session_started is intentionally NOT broadcast here. The timer
            # is anchored to the client joining, so session_started fires from
            # mark_client_joined() instead. Accepting only opens the chat.
            logger.info("session_awaiting_client_join", chat_id=chat_id)

            # Store and broadcast system message for chat acceptance
            from app.services.chats import broadcast_system_message

            psychic_name = chat.psychic.username if chat.psychic else "Psychic"
            await broadcast_system_message(
                db, chat_id, f"{psychic_name} accepted the chat request."
            )

            return info

        finally:
            db.close()

    async def mark_client_joined(self, chat_id: int) -> SessionInfo:
        """
        Anchor the session timer to the moment the client joins the chat screen.

        Called from the client's join endpoint. Idempotent: if the client has
        already joined, returns the current info without moving the anchor.

        Args:
            chat_id: The chat the client is joining

        Returns:
            SessionInfo with the timer anchored at the join time
        """
        from app.database.client import SessionLocal

        session_state = self.active_sessions.get(chat_id)
        if session_state is None:
            raise SessionNotFoundError(
                f"No active session to join for chat {chat_id}"
            )

        db = SessionLocal()
        try:
            chat = db.query(Chat).filter(Chat.id == chat_id).first()
            if not chat:
                raise ValueError(f"Chat {chat_id} not found")

            # Idempotent: already joined -> return current info, no re-anchor.
            if not session_state.awaiting_join and chat.client_joined_at is not None:
                return self._calculate_session_info(session_state, db)

            joined_at = datetime.now()

            # Recompute the max session duration from the total spendable
            # balance available now (free credit + paid). Using paid-only here
            # would give a credit-only new member 0 seconds and end the session
            # the instant they join.
            user = db.query(User).filter(User.id == chat.user_id).first()
            current_balance = get_spendable_stardust(db, user) if user else 0.0
            rate = session_state.rate_per_second
            additional_seconds = int(current_balance / rate) if rate > 0 else 0

            # Anchor the timer at the join moment and (re)arm warnings.
            session_state.started_at = joined_at
            session_state.client_joined_at = joined_at
            session_state.awaiting_join = False
            session_state.max_session_duration_seconds = additional_seconds
            session_state.warning_5min_sent = False
            session_state.warning_60s_sent = False
            session_state.warning_30s_sent = False
            session_state.warning_10s_sent = False

            # Move the current interval's start to the join time so billing matches.
            interval = (
                db.query(SessionInterval)
                .filter(SessionInterval.id == session_state.interval_id)
                .first()
            )
            if interval:
                interval.started_at = joined_at

            chat.client_joined_at = joined_at
            session_state.minutes_charged = 0
            db.commit()

            # ── Charge minute 1 UPFRONT ─────────────────────────────────────
            # The session is now ACTIVE (both joined) and the chat channel is
            # functional — this is the only moment we start billing. If the
            # client can't even cover the first minute, drop straight into the
            # grace/top-up flow rather than billing or hard-ending.
            per_min = _per_minute_rate(session_state.rate_per_second)
            if per_min > 0:
                if current_balance + 1e-9 >= per_min:
                    try:
                        self._charge_minute(db, session_state, 1)
                        session_state.minutes_charged = 1
                    except TxnInsufficientBalanceError:
                        await self._enter_grace(chat_id, session_state)
                        info = self.get_session_info(chat_id) or self._calculate_session_info(
                            session_state, db
                        )
                        info.client_joined_now = True
                        return info
                else:
                    await self._enter_grace(chat_id, session_state)
                    info = self._calculate_session_info(session_state, db)
                    info.client_joined_now = True
                    return info

            info = self._calculate_session_info(session_state, db)
            info.client_joined_now = True

            logger.info(
                "client_joined_session_timer_anchored",
                chat_id=chat_id,
                joined_at=joined_at.isoformat(),
                minutes_charged=session_state.minutes_charged,
                remaining_minutes=info.remaining_minutes,
            )

            # Timer is now running for both client and psychic.
            await self._broadcast_session_started(chat_id, info)

            return info

        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    async def end_session(
        self,
        chat_id: int,
        reason: ChatTerminationReason,
        ended_by_user_id: Optional[int] = None,
    ) -> None:
        """
        End a session.

        Can be called manually (user/psychic ends) or automatically (balance depleted).

        Args:
            chat_id: The chat ID to end
            reason: Why the session is ending
            ended_by_user_id: User ID of who ended it (if manual)
        """
        from app.database.client import SessionLocal

        session_state = self.active_sessions.get(chat_id)
        if not session_state:
            # Check paused sessions
            paused_state = self.paused_sessions.pop(chat_id, None)
            if paused_state:
                logger.info(
                    "ending_paused_session", chat_id=chat_id, reason=reason.value
                )
                session_state = paused_state
            elif chat_id in self.requested_sessions:
                await self._end_requested_session(chat_id, reason, ended_by_user_id)
                return
            else:
                # Try to reconstruct from DB (fallback for server restarts)
                logger.warning(
                    "end_session_not_in_memory_reconstructing",
                    chat_id=chat_id,
                    reason="Server may have restarted or session state lost",
                )
                reconstructed = self._reconstruct_paused_session_from_db(chat_id)
                if reconstructed:
                    self.paused_sessions.pop(chat_id, None)  # clean up if added
                    session_state = reconstructed
                    logger.info(
                        "end_session_reconstructed_from_db",
                        chat_id=chat_id,
                        session_id=session_state.session_id,
                    )
                else:
                    logger.warning("end_session_called_on_inactive", chat_id=chat_id)
                    return

        logger.info(
            "ending_session",
            chat_id=chat_id,
            reason=reason.value,
            ended_by_user_id=ended_by_user_id,
            interval_id=session_state.interval_id,
            session_id=session_state.session_id,
        )

        # Post-end cancellation: stop any in-flight AI reading work immediately so
        # a Sabri/Valentina reply is never generated or delivered into a chat that
        # is now ending (see reading_executor's send-guard for the hard guarantee).
        try:
            from app.services.ai import reading_duo, reading_executor, reading_reveal
            from app.services.ai.reading_pipeline import cancel_pipeline

            await cancel_pipeline(chat_id)
            await reading_executor.cancel_delivery(chat_id)
            await reading_reveal.cancel_reveal(chat_id)  # single-agent paced reveal
            await reading_duo.cancel_reveal(chat_id)      # two-role paced reveal
        except Exception as cancel_e:  # noqa: BLE001
            logger.warning(
                "reading_cancel_on_end_failed", chat_id=chat_id, error=str(cancel_e)
            )

        # Nobody owned the last thing a client heard: Valentina's prompt bans
        # closeouts and Sabri had no closing instruction, so a reading simply
        # stopped. The reader says goodbye here — after generation is cancelled
        # so nothing races it, and before the chat flips out of ACTIVE, because
        # every delivery helper refuses a non-active chat. It is awaited so it
        # cannot lose to the teardown, but it is deadline-bounded and swallows
        # its own failures, so it can never hold a session open.
        try:
            from app.services.ai import reading_first_word

            await reading_first_word.say_goodbye(
                chat_id, getattr(session_state, "session_id", None)
            )
        except Exception as closing_e:  # noqa: BLE001
            logger.warning(
                "reading_last_word_skipped", chat_id=chat_id, error=str(closing_e)
            )

        # Remove from cache first (it's in paused_sessions if paused, not active_sessions)
        if chat_id in self.active_sessions:
            del self.active_sessions[chat_id]
            logger.info("removed_from_active_sessions_cache", chat_id=chat_id)
        else:
            logger.info("session_was_in_paused_cache", chat_id=chat_id)

        # Get fresh DB session for updates
        db = SessionLocal()
        atlas_memory_job_id = None
        try:
            # Calculate final session info before ending
            final_info = self._calculate_session_info(session_state, db)

            # Update interval (skip if already ended, e.g. for paused sessions)
            interval = (
                db.query(SessionInterval)
                .filter(SessionInterval.id == session_state.interval_id)
                .first()
            )

            if interval:
                if interval.ended_at is None:
                    interval.ended_at = datetime.now()
                    interval.termination_reason = reason
                    logger.info(
                        "interval_updated",
                        interval_id=interval.id,
                        ended_at=interval.ended_at.isoformat(),
                        reason=reason.value,
                    )
                else:
                    logger.info(
                        "interval_already_ended_skipping",
                        interval_id=interval.id,
                        existing_ended_at=interval.ended_at.isoformat(),
                    )
            else:
                logger.error(
                    "interval_not_found", interval_id=session_state.interval_id
                )

            # Update chat session
            chat_session = (
                db.query(ChatSession)
                .filter(ChatSession.id == session_state.session_id)
                .first()
            )

            if chat_session:
                chat_session.status = ChatSessionStatus.COMPLETED
                logger.info(
                    "chat_session_updated",
                    session_id=chat_session.id,
                    new_status="COMPLETED",
                )
                try:
                    from app.services.atlas_client_memory_jobs import (
                        enqueue_atlas_client_memory_job,
                    )

                    with db.begin_nested():
                        enqueue_atlas_client_memory_job(db, chat_session.id)
                    atlas_memory_job_id = chat_session.id
                except Exception as atlas_e:  # noqa: BLE001 - ending must still commit
                    logger.warning(
                        "atlas_client_memory_enqueue_failed",
                        chat_session_id=chat_session.id,
                        error_type=type(atlas_e).__name__,
                    )
            else:
                logger.error(
                    "chat_session_not_found", session_id=session_state.session_id
                )

            # Update chat
            chat = db.query(Chat).filter(Chat.id == chat_id).first()

            if chat:
                chat.status = ChatStatus.ENDED
                logger.info("chat_status_updated", chat_id=chat_id, new_status="ENDED")
            else:
                logger.error("chat_not_found", chat_id=chat_id)

            # Commit all changes
            db.commit()
            logger.info(
                "session_ended_db_commit_successful",
                chat_id=chat_id,
                reason=reason.value,
                final_elapsed=final_info.elapsed_seconds,
                final_cost=final_info.estimated_cost,
            )

            # Broadcast session_ended event
            await self._broadcast_session_ended(chat_id, reason, final_info)

            # Store system message for balance-related terminations
            from app.services.chats import broadcast_system_message

            if reason in (
                ChatTerminationReason.INSUFFICIENT_FUNDS,
                ChatTerminationReason.NO_TOPUP,
            ):
                await broadcast_system_message(
                    db, chat_id, "Session ended due to insufficient points."
                )
            elif reason == ChatTerminationReason.CLIENT_DISCONNECTED:
                # A dropped connection is not an out-of-funds end — say so plainly.
                await broadcast_system_message(
                    db,
                    chat_id,
                    "The session ended because the connection was lost. You can start a new reading anytime.",
                )

            # Process the committed, idempotent Atlas job off the reading path.
            # Model or network failures retry once and never affect this end flow.
            if atlas_memory_job_id is not None:
                try:
                    from app.services.atlas_client_memory_jobs import (
                        schedule_atlas_client_memory_job,
                    )

                    schedule_atlas_client_memory_job(atlas_memory_job_id)
                except Exception as atlas_e:  # noqa: BLE001
                    logger.warning(
                        "atlas_client_memory_schedule_failed",
                        chat_session_id=atlas_memory_job_id,
                        error_type=type(atlas_e).__name__,
                    )

        except Exception as e:
            logger.error(
                "error_ending_session", chat_id=chat_id, error=str(e), exc_info=True
            )
            db.rollback()
            raise

        finally:
            db.close()
            logger.info("end_session_db_closed", chat_id=chat_id)

    async def pause_session(self, chat_id: int) -> Dict[str, any]:
        """
        Pause active session for client top-up.

        Stops monitoring, ends current interval, updates DB to PAUSED.
        Moves session from active_sessions to paused_sessions.

        Args:
            chat_id: The chat ID to pause

        Returns:
            Dict with elapsed_seconds at time of pause and paused_at timestamp
        """
        from app.database.client import SessionLocal

        session_state = self.active_sessions.get(chat_id)
        if not session_state:
            raise SessionNotFoundError(f"No active session for chat {chat_id}")

        # Calculate elapsed time at pause
        elapsed_at_pause = int(
            (datetime.now() - session_state.started_at).total_seconds()
        )
        pause_timestamp = datetime.now()

        logger.info(
            "pausing_session",
            chat_id=chat_id,
            elapsed_at_pause=elapsed_at_pause,
            max_duration=session_state.max_session_duration_seconds,
        )

        # Remove from active monitoring (stop the timer)
        paused_state = self.active_sessions.pop(chat_id)

        # Freeze the meter here so a later resume continues from this point
        # instead of jumping (the per-minute clock excludes the paused gap).
        paused_state.paused_elapsed_seconds = max(0, elapsed_at_pause)

        # Store in paused sessions for later resume with pause timestamp
        self.paused_sessions[chat_id] = paused_state

        db = SessionLocal()
        try:
            # End current interval
            interval = (
                db.query(SessionInterval)
                .filter(SessionInterval.id == session_state.interval_id)
                .first()
            )
            if interval:
                interval.ended_at = pause_timestamp
                interval.termination_reason = ChatTerminationReason.PAUSE_FOR_TOPUP
                logger.info("interval_ended_for_pause", interval_id=interval.id)

            # Update chat status
            chat = db.query(Chat).filter(Chat.id == chat_id).first()
            if chat:
                chat.status = ChatStatus.PAUSED
                chat.paused_at = pause_timestamp
                logger.info("chat_status_updated_to_paused", chat_id=chat_id)

            db.commit()

            logger.info(
                "session_paused_successfully", chat_id=chat_id, elapsed=elapsed_at_pause
            )

            # Broadcast pause event (direct await instead of create_task)
            await self._broadcast_session_paused(chat_id, elapsed_at_pause)

            # Store and broadcast system message
            from app.services.chats import broadcast_system_message

            await broadcast_system_message(
                db, chat_id, "Chat has been paused for top-up."
            )

            return {
                "elapsed_seconds": elapsed_at_pause,
                "paused_at": pause_timestamp.isoformat(),
            }

        except Exception as e:
            # Rollback: move back to active sessions
            self.active_sessions[chat_id] = paused_state
            del self.paused_sessions[chat_id]
            logger.error("error_pausing_session", chat_id=chat_id, error=str(e))
            db.rollback()
            raise

        finally:
            db.close()

    def _reconstruct_paused_session_from_db(
        self, chat_id: int
    ) -> Optional[SessionState]:
        """
        Reconstruct a paused session's state from database records.
        Used when server restarts and in-memory state is lost.

        Args:
            chat_id: The chat ID to reconstruct

        Returns:
            SessionState if valid paused session found, None otherwise
        """
        from app.database.client import SessionLocal

        db = SessionLocal()
        try:
            # Get chat
            chat = db.query(Chat).filter(Chat.id == chat_id).first()
            if not chat or chat.status != ChatStatus.PAUSED:
                logger.warning(
                    "chat_not_paused_cannot_reconstruct",
                    chat_id=chat_id,
                    status=chat.status.value if chat else None,
                )
                return None

            # Get the most recent session for this chat
            session = (
                db.query(ChatSession)
                .filter(ChatSession.chat_id == chat_id)
                .order_by(desc(ChatSession.id))
                .first()
            )

            if not session:
                logger.error("no_active_session_for_paused_chat", chat_id=chat_id)
                return None

            # Get the first interval to find the session start time
            first_interval = (
                db.query(SessionInterval)
                .filter(SessionInterval.session_id == session.id)
                .order_by(SessionInterval.id)
                .first()
            )

            if not first_interval:
                logger.error(
                    "no_intervals_found_for_paused_session",
                    chat_id=chat_id,
                    session_id=session.id,
                )
                return None

            session_started_at = first_interval.started_at

            # Get the last interval (the one that was paused)
            last_interval = (
                db.query(SessionInterval)
                .filter(
                    SessionInterval.session_id == session.id,
                    SessionInterval.termination_reason
                    == ChatTerminationReason.PAUSE_FOR_TOPUP,
                )
                .order_by(desc(SessionInterval.id))
                .first()
            )

            if not last_interval:
                logger.warning(
                    "no_paused_interval_found_using_any_interval",
                    chat_id=chat_id,
                    session_id=session.id,
                )
                # Fallback: Get the most recent interval
                last_interval = (
                    db.query(SessionInterval)
                    .filter(SessionInterval.session_id == session.id)
                    .order_by(desc(SessionInterval.id))
                    .first()
                )

                if not last_interval:
                    logger.error(
                        "no_intervals_found_for_session",
                        chat_id=chat_id,
                        session_id=session.id,
                    )
                    return None

            # Get psychic rate
            psychic = db.query(User).filter(User.id == chat.psychic_id).first()
            if not psychic:
                logger.error(
                    "psychic_not_found_for_chat",
                    chat_id=chat_id,
                    psychic_id=chat.psychic_id,
                )
                return None

            # Calculate elapsed time at pause
            if last_interval.ended_at:
                elapsed_at_pause = int(
                    (last_interval.ended_at - session_started_at).total_seconds()
                )
            else:
                # Interval still running, use current time
                elapsed_at_pause = int(
                    (datetime.now() - session_started_at).total_seconds()
                )

            rate_per_second = float(psychic.price_per_second)

            # Reconstruct SessionState
            reconstructed_state = SessionState(
                chat_id=chat_id,
                session_id=session.id,
                interval_id=last_interval.id,
                started_at=session_started_at,
                client_id=chat.user_id,
                psychic_id=chat.psychic_id,
                rate_per_second=rate_per_second,
                max_session_duration_seconds=elapsed_at_pause,  # Will be recalculated on resume
                initial_balance=0.0,  # Not critical for resume
            )

            logger.info(
                "session_state_reconstructed_from_db",
                chat_id=chat_id,
                session_id=session.id,
                elapsed_at_pause=elapsed_at_pause,
                rate_per_second=rate_per_second,
            )

            return reconstructed_state

        except Exception as e:
            logger.error(
                "error_reconstructing_session_state",
                chat_id=chat_id,
                error=str(e),
                exc_info=True,
            )
            return None
        finally:
            db.close()

    def resume_session(
        self, chat_id: int, new_balance: Optional[float] = None
    ) -> SessionInfo:
        """
        Resume a paused session after client tops up.

        Recalculates max_session_duration based on new balance:
        new_max_duration = elapsed_at_pause + (new_balance / rate)

        Args:
            chat_id: The chat ID to resume
            new_balance: The new balance after top-up (if None, fetches from DB)

        Returns:
            SessionInfo with updated session data

        Raises:
            SessionNotFoundError: If no paused session found
            InsufficientBalanceError: If new balance < 1 second worth
        """
        from app.database.client import SessionLocal

        # Out-of-balance GRACE resume: the session is still in active_sessions
        # (never moved to paused_sessions). Charge the pending minute and continue.
        grace_state = self.active_sessions.get(chat_id)
        if grace_state and grace_state.is_grace:
            return self._resume_from_grace(chat_id, grace_state)

        # Try to get from memory first (fast path)
        session_state = self.paused_sessions.get(chat_id)

        # If not in memory, reconstruct from database (fallback for server restarts)
        if not session_state:
            logger.warning(
                "paused_session_not_in_memory_reconstructing",
                chat_id=chat_id,
                reason="Server may have restarted or session state lost",
            )
            session_state = self._reconstruct_paused_session_from_db(chat_id)

            if not session_state:
                raise SessionNotFoundError(
                    f"No paused session found for chat {chat_id} in memory or DB"
                )

            # Add to paused_sessions so it's tracked
            self.paused_sessions[chat_id] = session_state
            logger.info(
                "paused_session_restored_to_memory",
                chat_id=chat_id,
                session_id=session_state.session_id,
            )

        logger.info("resuming_session", chat_id=chat_id)

        db = SessionLocal()
        try:
            # Get chat and user
            chat = db.query(Chat).filter(Chat.id == chat_id).first()
            if not chat:
                raise ValueError(f"Chat {chat_id} not found")

            user = db.query(User).filter(User.id == chat.user_id).first()
            if not user:
                raise ValueError(f"User {chat.user_id} not found")

            # Use provided balance or fetch from DB (spendable = earned + credit + paid)
            current_balance = (
                new_balance if new_balance is not None else get_spendable_stardust(db, user)
            )

            # Validate minimum balance (at least 1 second worth)
            min_required = session_state.rate_per_second
            if current_balance < min_required:
                logger.warning(
                    "insufficient_balance_to_resume",
                    chat_id=chat_id,
                    balance=current_balance,
                    min_required=min_required,
                )
                raise InsufficientBalanceError(
                    f"Minimum {min_required} points required to resume (1 second worth)"
                )

            # Calculate elapsed time at pause
            # Get the last (paused) interval to find when it was paused
            last_interval = (
                db.query(SessionInterval)
                .filter(
                    SessionInterval.session_id == session_state.session_id,
                    SessionInterval.termination_reason
                    == ChatTerminationReason.PAUSE_FOR_TOPUP,
                )
                .order_by(desc(SessionInterval.id))
                .first()
            )

            if last_interval and last_interval.ended_at:
                elapsed_at_pause = int(
                    (last_interval.ended_at - session_state.started_at).total_seconds()
                )
            else:
                # Fallback: calculate from chat.paused_at
                if chat.paused_at:
                    elapsed_at_pause = int(
                        (chat.paused_at - session_state.started_at).total_seconds()
                    )
                else:
                    elapsed_at_pause = 0

            # Recalculate max_session_duration based on new balance
            # new_max_duration = elapsed_at_pause + (new_balance / rate)
            additional_seconds = int(
                current_balance / session_state.rate_per_second
                if session_state.rate_per_second > 0
                else 0
            )
            new_max_duration = elapsed_at_pause + additional_seconds

            logger.info(
                "recalculating_session_duration",
                chat_id=chat_id,
                elapsed_at_pause=elapsed_at_pause,
                new_balance=current_balance,
                additional_seconds=additional_seconds,
                new_max_duration=new_max_duration,
            )

            # Create new interval (is_billed=True; the per-minute engine bills
            # money directly, so intervals must never be interval-billed).
            interval = SessionInterval(
                session_id=session_state.session_id,
                started_at=datetime.now(),
                trigger_event=ChatSessionTrigger.RESUME_AFTER_TOPUP,
                is_billed=True,
            )
            db.add(interval)

            # Update chat status
            chat.status = ChatStatus.ACTIVE
            chat.paused_at = None

            db.commit()
            db.refresh(interval)

            # Update session state with new values
            session_state.interval_id = interval.id
            session_state.max_session_duration_seconds = new_max_duration
            # Continue the per-minute clock from where it stopped: exclude the
            # paused gap so `elapsed` doesn't jump and trigger a burst of
            # catch-up minute charges. minutes_charged is preserved; the monitor
            # charges the next minute at the next real boundary.
            frozen = session_state.paused_elapsed_seconds or elapsed_at_pause
            session_state.started_at = datetime.now() - timedelta(seconds=frozen)
            session_state.warning_5min_sent = False
            session_state.warning_60s_sent = False
            session_state.warning_30s_sent = False
            session_state.warning_10s_sent = False

            # Move from paused back to active
            del self.paused_sessions[chat_id]
            self.active_sessions[chat_id] = session_state

            # Calculate updated info (using same DB session)
            info = self._calculate_session_info(session_state, db)

            logger.info(
                "session_resumed",
                chat_id=chat_id,
                new_max_duration=new_max_duration,
                remaining_seconds=info.remaining_seconds,
            )

            # Note: Broadcast will be handled by the webhook caller
            # We removed asyncio.create_task() to avoid silent failures in sync context

            return info

        except Exception as e:
            logger.error("error_resuming_session", chat_id=chat_id, error=str(e))
            db.rollback()
            raise

        finally:
            db.close()

    def get_session_info(self, chat_id: int) -> Optional[SessionInfo]:
        """
        Get current session information.

        Args:
            chat_id: The chat ID

        Returns:
            SessionInfo if session is active, None otherwise
        """
        from app.database.client import SessionLocal

        session_state = self.active_sessions.get(chat_id)
        if not session_state:
            return None

        db = SessionLocal()
        try:
            return self._calculate_session_info(session_state, db)
        finally:
            db.close()

    def handle_client_disconnect(self, chat_id: int) -> None:
        """
        Handle client disconnect event.

        Starts a 30-second timer, after which session will auto-end if not reconnected.

        Args:
            chat_id: The chat ID where client disconnected
        """
        session_state = self.active_sessions.get(chat_id)
        if not session_state:
            return

        session_state.client_disconnected_at = datetime.now()
        logger.info(
            "client_disconnected",
            chat_id=chat_id,
            will_timeout_in=settings.SESSION_CLIENT_DISCONNECT_TIMEOUT,
        )

    def handle_client_reconnect(self, chat_id: int) -> None:
        """
        Handle client reconnect event.

        Cancels the disconnect timeout.

        Args:
            chat_id: The chat ID where client reconnected
        """
        session_state = self.active_sessions.get(chat_id)
        if not session_state:
            return

        if session_state.client_disconnected_at:
            session_state.client_disconnected_at = None
            logger.info("client_reconnected", chat_id=chat_id)

    def _calculate_session_info(
        self, session_state: SessionState, db: Session
    ) -> SessionInfo:
        """
        Calculate current session information.

        IMPORTANT: Remaining time is based on max_session_duration (calculated at start),
        NOT on current user balance. This decouples session monitoring from billing.
        """
        # Before the client joins, the timer hasn't started: report zero elapsed
        # and the full duration remaining so nothing counts down or bills.
        if session_state.awaiting_join:
            user = (
                db.query(User).filter(User.id == session_state.client_id).first()
            )
            credit_balance = float(user.credit_balance) if user else 0.0
            paid_balance = float(user.balance) if user else 0.0
            earned_balance = get_earned_stardust_balance(db, user.id) if user else 0.0
            # Earned Stardust spends at full value, so it counts toward the total.
            current_balance = credit_balance + paid_balance + earned_balance
            chat = db.query(Chat).filter(Chat.id == session_state.chat_id).first()
            rate = session_state.rate_per_second
            per_min = _per_minute_rate(rate)
            full_duration = int(current_balance / rate) if rate > 0 else 0
            affordable_minutes = int(current_balance / per_min) if per_min > 0 else 0
            return SessionInfo(
                chat_id=session_state.chat_id,
                elapsed_seconds=0,
                estimated_cost=0.0,
                remaining_seconds=full_duration,
                client_balance=round(current_balance, 2),
                credit_balance=round(credit_balance, 2),
                paid_balance=round(paid_balance, 2),
                chat_status=chat.status.value if chat else "UNKNOWN",
                session_status="AWAITING_JOIN",
                started_at=session_state.started_at.isoformat(),
                rate_per_second=rate,
                rate_per_minute=per_min,
                minutes_charged=0,
                remaining_minutes=affordable_minutes,
            )

        # Live balances from DB (earned + free credit + paid). Earned Stardust
        # spends at full value (1 ⭐ = £1) and is used first, so it counts toward
        # the spendable total that drives the countdown.
        user = db.query(User).filter(User.id == session_state.client_id).first()
        credit_balance = float(user.credit_balance) if user else 0.0
        paid_balance = float(user.balance) if user else 0.0
        earned_balance = get_earned_stardust_balance(db, user.id) if user else 0.0
        current_balance = credit_balance + paid_balance + earned_balance  # total spendable

        rate = session_state.rate_per_second
        per_min = _per_minute_rate(rate)

        # Whole minutes still affordable BEYOND what's already prepaid.
        affordable_future_minutes = int(current_balance / per_min) if per_min > 0 else 0

        chat = db.query(Chat).filter(Chat.id == session_state.chat_id).first()

        # ── Grace pause (out of balance) ────────────────────────────────────
        # Meter and billing are stopped; report the frozen elapsed and a live
        # countdown so both sides see the same "topping up" state.
        if session_state.is_grace:
            elapsed_seconds = session_state.paused_elapsed_seconds
            grace_age = (
                (datetime.now() - session_state.grace_started_at).total_seconds()
                if session_state.grace_started_at
                else 0
            )
            limit = TOPUP_HOLD_CAP_SECONDS if session_state.topping_up else GRACE_SECONDS
            grace_left = max(0, int(limit - grace_age))
            # Estimated cost = exactly the minutes already charged.
            estimated_cost = round(session_state.minutes_charged * per_min, 2)
            return SessionInfo(
                chat_id=session_state.chat_id,
                elapsed_seconds=elapsed_seconds,
                estimated_cost=estimated_cost,
                remaining_seconds=0,
                client_balance=round(current_balance, 2),
                credit_balance=round(credit_balance, 2),
                paid_balance=round(paid_balance, 2),
                chat_status=chat.status.value if chat else "PAUSED",
                session_status="GRACE",
                started_at=session_state.started_at.isoformat(),
                rate_per_second=rate,
                rate_per_minute=per_min,
                minutes_charged=session_state.minutes_charged,
                remaining_minutes=affordable_future_minutes,
                grace_seconds_left=grace_left,
                is_topping_up=session_state.topping_up,
            )

        # ── Active billing ──────────────────────────────────────────────────
        elapsed_seconds = int(
            (datetime.now() - session_state.started_at).total_seconds()
        )
        # Cost so far = exactly the minutes charged upfront (no partial seconds).
        estimated_cost = round(session_state.minutes_charged * per_min, 2)

        # Seconds left inside the currently-prepaid window.
        prepaid_remaining = max(0, session_state.minutes_charged * 60 - elapsed_seconds)
        remaining_seconds = prepaid_remaining + affordable_future_minutes * 60

        # Whole minutes left to display: the current (prepaid) minute in progress
        # plus every further minute they can still afford.
        remaining_minutes = affordable_future_minutes + (
            1 if prepaid_remaining > 0 else 0
        )

        chat_status = chat.status.value if chat else "UNKNOWN"

        return SessionInfo(
            chat_id=session_state.chat_id,
            elapsed_seconds=elapsed_seconds,
            estimated_cost=estimated_cost,
            remaining_seconds=remaining_seconds,
            client_balance=round(current_balance, 2),
            credit_balance=round(credit_balance, 2),
            paid_balance=round(paid_balance, 2),
            chat_status=chat_status,
            session_status="ACTIVE",
            started_at=session_state.started_at.isoformat(),
            rate_per_second=rate,
            rate_per_minute=per_min,
            minutes_charged=session_state.minutes_charged,
            remaining_minutes=remaining_minutes,
        )

    # ── Per-minute prepaid billing helpers ──────────────────────────────────

    def _charge_minute(self, db: Session, session_state: SessionState, minute_number: int):
        """
        Debit exactly one minute's rate upfront and write ONE ledger DEBIT
        described "Session #X - Minute N". Credit is consumed before paid (handled
        by create_debit_transaction). Raises TxnInsufficientBalanceError if the
        client can't cover the minute.
        """
        from app.services.transactions import create_debit_transaction

        per_min = _per_minute_rate(session_state.rate_per_second)
        if per_min <= 0:
            return None

        description = f"Session #{session_state.session_id} - Minute {minute_number}"
        txn = create_debit_transaction(
            db=db,
            user_id=session_state.client_id,
            amount=per_min,
            description=description,
            related_chat_id=session_state.chat_id,
            related_session_interval_id=session_state.interval_id,
            metadata={
                "minute": minute_number,
                "psychic_id": session_state.psychic_id,
                "rate_per_minute": per_min,
            },
        )
        logger.info(
            "minute_charged",
            chat_id=session_state.chat_id,
            minute=minute_number,
            amount=per_min,
        )
        return txn

    async def _enter_grace(self, chat_id: int, session_state: SessionState) -> None:
        """
        Enter the out-of-balance GRACE pause: stop the meter and billing, lock
        the chat (status PAUSED) on both sides, and start the top-up countdown.
        The session stays in active_sessions so the monitor tracks the deadline.
        """
        from app.database.client import SessionLocal
        from app.services.chats import broadcast_system_message

        session_state.is_grace = True
        session_state.grace_started_at = datetime.now()
        session_state.topping_up = False
        # Freeze the meter at the clean minute boundary already paid for.
        session_state.paused_elapsed_seconds = session_state.minutes_charged * 60

        db = SessionLocal()
        try:
            chat = db.query(Chat).filter(Chat.id == chat_id).first()
            reader_name = "your reader"
            if chat:
                chat.status = ChatStatus.PAUSED
                chat.paused_at = datetime.now()
                reader_name = chat.psychic.username if chat.psychic else "your reader"

            user = db.query(User).filter(User.id == session_state.client_id).first()
            session_state.grace_entry_balance = (
                get_spendable_stardust(db, user) if user else 0.0
            )

            # End the current interval for history (already is_billed=True).
            interval = (
                db.query(SessionInterval)
                .filter(SessionInterval.id == session_state.interval_id)
                .first()
            )
            if interval and interval.ended_at is None:
                interval.ended_at = datetime.now()
                interval.termination_reason = ChatTerminationReason.PAUSE_FOR_TOPUP
            db.commit()

            info = self._calculate_session_info(session_state, db)
            await self._broadcast_session_grace(chat_id, info, reader_name)

            # Transcript event line (spec 11): session paused (out of balance).
            await broadcast_system_message(
                db,
                chat_id,
                "Session paused — client is out of Stardust. Waiting for a top-up.",
            )

            logger.info(
                "session_entered_grace",
                chat_id=chat_id,
                minutes_charged=session_state.minutes_charged,
                per_minute=_per_minute_rate(session_state.rate_per_second),
            )
        finally:
            db.close()

    def mark_topping_up(self, chat_id: int) -> bool:
        """Flag that the client started a top-up during grace (extends the hold
        to TOPUP_HOLD_CAP_SECONDS). Returns True if a grace session was flagged."""
        ss = self.active_sessions.get(chat_id)
        if ss and ss.is_grace:
            ss.topping_up = True
            logger.info("grace_topup_started", chat_id=chat_id)
            return True
        return False

    def _resume_from_grace(
        self, chat_id: int, session_state: SessionState
    ) -> SessionInfo:
        """
        Resume a grace-paused session after a top-up: charge the pending minute
        immediately and continue the counter from exactly where it stopped.
        Raises InsufficientBalanceError if the top-up still isn't enough for a
        minute.
        """
        from app.database.client import SessionLocal

        db = SessionLocal()
        try:
            chat = db.query(Chat).filter(Chat.id == chat_id).first()
            if not chat:
                raise ValueError(f"Chat {chat_id} not found")
            user = db.query(User).filter(User.id == session_state.client_id).first()
            current_balance = get_spendable_stardust(db, user) if user else 0.0
            per_min = _per_minute_rate(session_state.rate_per_second)

            if per_min > 0 and current_balance + 1e-9 < per_min:
                raise InsufficientBalanceError(
                    f"Need {per_min} points to resume (one minute)"
                )

            # How much was topped up during grace (for the transcript line).
            session_state.last_topup_amount = round(
                max(0.0, current_balance - session_state.grace_entry_balance), 2
            )

            # New interval for the resumed stretch (is_billed=True; billed per-minute).
            interval = SessionInterval(
                session_id=session_state.session_id,
                started_at=datetime.now(),
                trigger_event=ChatSessionTrigger.RESUME_AFTER_TOPUP,
                is_billed=True,
            )
            db.add(interval)
            chat.status = ChatStatus.ACTIVE
            chat.paused_at = None
            db.commit()
            db.refresh(interval)
            session_state.interval_id = interval.id

            # Continue the meter from the frozen boundary, then charge the minute
            # that couldn't be covered before — so it starts fresh from here.
            session_state.started_at = datetime.now() - timedelta(
                seconds=session_state.paused_elapsed_seconds
            )
            if per_min > 0:
                next_minute = session_state.minutes_charged + 1
                self._charge_minute(db, session_state, next_minute)
                session_state.minutes_charged = next_minute

            # Clear grace state and re-arm warnings.
            session_state.is_grace = False
            session_state.topping_up = False
            session_state.grace_started_at = None
            session_state.warning_5min_sent = False
            session_state.warning_60s_sent = False
            session_state.warning_30s_sent = False
            session_state.warning_10s_sent = False

            info = self._calculate_session_info(session_state, db)
            logger.info(
                "session_resumed_from_grace",
                chat_id=chat_id,
                minutes_charged=session_state.minutes_charged,
                topped_up=session_state.last_topup_amount,
            )
            return info
        finally:
            db.close()

    async def _monitor_sessions(self):
        """
        Main monitoring loop.

        Runs continuously, checking all active sessions for:
        - Balance depletion
        - Warning thresholds
        - Client disconnect timeouts
        - Paused sessions that exceed 30 minute timeout

        Note: Timer ticks are NOT broadcast here - they're sent on WebSocket connection only.
        """
        from app.database.client import SessionLocal

        logger.info("session_monitoring_loop_started")

        while self._running:
            db = None
            try:
                # Get fresh DB session for this monitoring cycle
                db = SessionLocal()

                if (
                    self._last_atlas_memory_sweep is None
                    or (datetime.now() - self._last_atlas_memory_sweep).total_seconds() >= 60
                ):
                    try:
                        from app.services.atlas_client_memory_jobs import (
                            schedule_atlas_client_memory_sweep,
                        )

                        schedule_atlas_client_memory_sweep()
                    except Exception as atlas_e:  # noqa: BLE001
                        logger.warning(
                            "atlas_client_memory_periodic_sweep_failed",
                            error_type=type(atlas_e).__name__,
                        )
                    finally:
                        self._last_atlas_memory_sweep = datetime.now()

                # Check paused sessions for 30-minute timeout
                for chat_id in list(self.paused_sessions.keys()):
                    try:
                        chat = db.query(Chat).filter(Chat.id == chat_id).first()
                        if chat and chat.paused_at:
                            pause_duration = (
                                datetime.now() - chat.paused_at
                            ).total_seconds()
                            # Auto-end if paused for more than 30 minutes (1800 seconds)
                            if pause_duration >= 1800:
                                logger.info(
                                    "paused_session_timeout_ending_session_via_end_session",
                                    chat_id=chat_id,
                                    pause_duration_minutes=pause_duration / 60,
                                )
                                # Use end_session to properly clean up
                                await self.end_session(
                                    chat_id,
                                    ChatTerminationReason.PAUSE_TIMEOUT,
                                )
                    except Exception as e:
                        logger.error(
                            "error_checking_paused_session",
                            chat_id=chat_id,
                            error=str(e),
                        )

                if not self.active_sessions:
                    # No active sessions, sleep longer
                    await asyncio.sleep(5)
                    continue

                # Track minimum remaining time across all sessions (for adaptive sleep)
                min_remaining = float("inf")

                # Check each active session
                for chat_id in list(self.active_sessions.keys()):
                    try:
                        session_state = self.active_sessions.get(chat_id)
                        if not session_state:
                            continue

                        # Skip sessions where the client hasn't joined yet — the
                        # timer isn't running, so there's nothing to deplete/warn.
                        if session_state.awaiting_join:
                            continue

                        # ── Grace pause: run the top-up countdown ──────────────
                        # No billing here. End cleanly when the countdown (60s, or
                        # 5 min once a top-up started) expires with no resume.
                        if session_state.is_grace:
                            grace_age = (
                                datetime.now() - session_state.grace_started_at
                            ).total_seconds() if session_state.grace_started_at else 0
                            limit = (
                                TOPUP_HOLD_CAP_SECONDS
                                if session_state.topping_up
                                else GRACE_SECONDS
                            )
                            if grace_age >= limit:
                                logger.info(
                                    "grace_expired_ending_session",
                                    chat_id=chat_id,
                                    topping_up=session_state.topping_up,
                                    grace_age=grace_age,
                                )
                                from app.services.chats import (
                                    broadcast_system_message,
                                )

                                # Transcript event line (spec 11): ended, no top-up.
                                await broadcast_system_message(
                                    db,
                                    chat_id,
                                    "Session ended — no top-up was made in time.",
                                )
                                await self.end_session(
                                    chat_id, ChatTerminationReason.NO_TOPUP
                                )
                            else:
                                min_remaining = min(min_remaining, 1)
                            continue

                        # ── Per-minute prepaid charging ────────────────────────
                        # Charge one full minute upfront at each boundary. Before
                        # each charge, check the balance; if it can't cover the
                        # next minute, drop into grace instead of ending.
                        elapsed = (
                            datetime.now() - session_state.started_at
                        ).total_seconds()
                        due_minutes = int(elapsed // 60) + 1
                        per_min = _per_minute_rate(session_state.rate_per_second)
                        charged_now = False
                        entered_grace = False

                        while session_state.minutes_charged < due_minutes:
                            next_minute = session_state.minutes_charged + 1
                            if per_min <= 0:
                                # Free reader: nothing to charge, just advance.
                                session_state.minutes_charged = next_minute
                                continue

                            user = (
                                db.query(User)
                                .filter(User.id == session_state.client_id)
                                .first()
                            )
                            balance = get_spendable_stardust(db, user) if user else 0.0
                            if balance + 1e-9 >= per_min:
                                try:
                                    self._charge_minute(db, session_state, next_minute)
                                    session_state.minutes_charged = next_minute
                                    charged_now = True
                                except TxnInsufficientBalanceError:
                                    await self._enter_grace(chat_id, session_state)
                                    entered_grace = True
                                    break
                            else:
                                await self._enter_grace(chat_id, session_state)
                                entered_grace = True
                                break

                        if entered_grace:
                            continue

                        # Recompute after any charge; refetch balances for the UI.
                        info = self._calculate_session_info(session_state, db)
                        min_remaining = min(min_remaining, info.remaining_seconds)

                        if charged_now:
                            # Push the new balance + minute count so the client UI
                            # refetches balance on every minute charge (spec b).
                            await self._broadcast_minute_charged(chat_id, info)

                        # Check for client disconnect timeout
                        if session_state.client_disconnected_at:
                            disconnect_duration = (
                                datetime.now() - session_state.client_disconnected_at
                            ).total_seconds()
                            if (
                                disconnect_duration
                                >= settings.SESSION_CLIENT_DISCONNECT_TIMEOUT
                            ):
                                logger.info(
                                    "client_disconnect_timeout_ending_session",
                                    chat_id=chat_id,
                                    disconnect_duration=disconnect_duration,
                                )
                                await self.end_session(
                                    chat_id, ChatTerminationReason.CLIENT_DISCONNECTED
                                )
                                continue

                        # Send warnings at thresholds
                        await self._check_and_send_warnings(session_state, info, db)

                        # NOTE: Timer tick broadcasts REMOVED - UI gets initial data on WebSocket connect

                    except Exception as e:
                        logger.error(
                            "error_monitoring_session", chat_id=chat_id, error=str(e)
                        )

                # Adaptive sleep based on minimum remaining time
                if min_remaining < settings.SESSION_CRITICAL_THRESHOLD:
                    # Critical mode: check every second
                    await asyncio.sleep(settings.SESSION_CHECK_INTERVAL_CRITICAL)
                else:
                    # Normal mode: check every 5 seconds
                    await asyncio.sleep(settings.SESSION_CHECK_INTERVAL_NORMAL)

            except Exception as e:
                logger.error("error_in_monitoring_loop", error=str(e))
                await asyncio.sleep(5)

            finally:
                # Always close DB session after monitoring cycle
                if db:
                    db.close()

        logger.info("session_monitoring_loop_stopped")

    async def _check_and_send_warnings(
        self, session_state: SessionState, info: SessionInfo, db: Session
    ):
        """Check and send balance warning at thresholds"""
        from app.services.chats import broadcast_system_message

        remaining = info.remaining_seconds

        # 5 minutes (300s) warning
        if remaining <= 300 and not session_state.warning_5min_sent:
            session_state.warning_5min_sent = True
            await self._broadcast_warning(session_state.chat_id, remaining, "5_minutes")

            # Persist BALANCE_LOW notification
            from app.models.notification import Notification
            from app.enums.notification_type import NotificationType
            from app.notification_manager import notification_manager
            from datetime import datetime

            balance_low_notif = Notification(
                user_id=session_state.client_id,
                type=NotificationType.BALANCE_LOW,
                title="Balance Low",
                message="Your balance is running low. Please top up to avoid interruption.",
                data={
                    "chat_id": session_state.chat_id,
                    "remaining_seconds": remaining,
                },
            )
            db.add(balance_low_notif)
            db.commit()

            balance_low_ws = {
                "type": "notification",
                "notification_type": NotificationType.BALANCE_LOW,
                "title": "Balance Low",
                "message": "Your balance is running low. Please top up to avoid interruption.",
                "data": {
                    "chat_id": session_state.chat_id,
                    "remaining_seconds": remaining,
                },
                "timestamp": datetime.now().isoformat(),
            }
            await notification_manager.send_to_user(
                balance_low_ws, session_state.client_id
            )
            # No hardcoded "ends in 5 minutes" transcript line — in the per-minute
            # model the out-of-balance GRACE pause is the interruption mechanism,
            # and all countdown copy is derived from real remaining time on the
            # client. This just flags "balance low" via the WS warning above.

        # 60 seconds warning
        elif remaining <= 60 and not session_state.warning_60s_sent:
            session_state.warning_60s_sent = True
            await self._broadcast_warning(
                session_state.chat_id, remaining, "60_seconds"
            )

        # 30 seconds warning
        elif remaining <= 30 and not session_state.warning_30s_sent:
            session_state.warning_30s_sent = True
            await self._broadcast_warning(
                session_state.chat_id, remaining, "30_seconds"
            )

        # 10 seconds warning (final warning before auto-end)
        elif remaining <= 10 and not session_state.warning_10s_sent:
            session_state.warning_10s_sent = True
            await self._broadcast_warning(
                session_state.chat_id, remaining, "10_seconds"
            )

    async def _broadcast_session_started(self, chat_id: int, info: SessionInfo):
        """Broadcast session started event"""
        await manager.send_to_chat(
            {
                "event": "session_started",
                "data": {
                    "chat_id": info.chat_id,
                    "elapsed_seconds": info.elapsed_seconds,
                    "estimated_cost": info.estimated_cost,
                    "remaining_seconds": info.remaining_seconds,
                    "remaining_minutes": info.remaining_minutes,
                    "minutes_charged": info.minutes_charged,
                    "client_balance": info.client_balance,
                    "credit_balance": info.credit_balance,
                    "paid_balance": info.paid_balance,
                    "chat_status": info.chat_status,
                    "session_status": info.session_status,
                    "started_at": info.started_at,
                    "rate_per_second": info.rate_per_second,
                    "rate_per_minute": info.rate_per_minute,
                },
            },
            str(chat_id),
        )

    async def _broadcast_minute_charged(self, chat_id: int, info: SessionInfo):
        """Broadcast that a minute was charged upfront — carries the fresh balance
        so both UIs re-anchor (client header + time-left refetch on every charge)."""
        await manager.send_to_chat(
            {
                "event": "session_minute_charged",
                "data": {
                    "chat_id": info.chat_id,
                    "elapsed_seconds": info.elapsed_seconds,
                    "estimated_cost": info.estimated_cost,
                    "remaining_seconds": info.remaining_seconds,
                    "remaining_minutes": info.remaining_minutes,
                    "minutes_charged": info.minutes_charged,
                    "client_balance": info.client_balance,
                    "credit_balance": info.credit_balance,
                    "paid_balance": info.paid_balance,
                    "rate_per_minute": info.rate_per_minute,
                },
            },
            str(chat_id),
        )

    async def _broadcast_session_grace(
        self, chat_id: int, info: SessionInfo, reader_name: str
    ):
        """Broadcast the out-of-balance GRACE pause: countdown + top-up prompt."""
        await manager.send_to_chat(
            {
                "event": "session_grace",
                "data": {
                    "chat_id": info.chat_id,
                    "chat_status": "PAUSED",
                    "session_status": "GRACE",
                    "reader_name": reader_name,
                    "grace_seconds": info.grace_seconds_left,
                    "minutes_charged": info.minutes_charged,
                    "estimated_cost": info.estimated_cost,
                    "client_balance": info.client_balance,
                    "credit_balance": info.credit_balance,
                    "paid_balance": info.paid_balance,
                    "rate_per_minute": info.rate_per_minute,
                },
            },
            str(chat_id),
        )

    async def _broadcast_timer_tick(self, chat_id: int, info: SessionInfo):
        """Broadcast timer tick event"""
        await manager.send_to_chat(
            {
                "event": "session_timer_tick",
                "data": {
                    "chat_id": info.chat_id,
                    "elapsed_seconds": info.elapsed_seconds,
                    "estimated_cost": info.estimated_cost,
                    "remaining_seconds": info.remaining_seconds,
                    "client_balance": info.client_balance,
                    "chat_status": info.chat_status,
                },
            },
            str(chat_id),
        )

    async def _broadcast_warning(
        self, chat_id: int, remaining_seconds: int, threshold: str
    ):
        """Broadcast balance warning"""
        logger.info(
            "sending_balance_warning",
            chat_id=chat_id,
            remaining_seconds=remaining_seconds,
            threshold=threshold,
        )

        await manager.send_to_chat(
            {
                "event": "low_balance_warning"
                if threshold == "5_minutes"
                else "session_ending_soon",
                "data": {
                    "chat_id": chat_id,
                    "remaining_seconds": remaining_seconds,
                    "threshold": threshold,
                },
            },
            str(chat_id),
        )

    async def _broadcast_session_ended(
        self, chat_id: int, reason: ChatTerminationReason, final_info: SessionInfo
    ):
        """Broadcast session ended event"""
        await manager.send_to_chat(
            {
                "event": "session_ended_confirmed",
                "data": {
                    "chat_id": chat_id,
                    "reason": reason.value,
                    "chat_status": "ENDED",
                    "final_elapsed_seconds": final_info.elapsed_seconds,
                    "final_cost": final_info.estimated_cost,
                },
            },
            str(chat_id),
        )

    async def _broadcast_session_paused(self, chat_id: int, elapsed_seconds: int):
        """Broadcast session paused event"""
        await manager.send_to_chat(
            {
                "event": "session_paused",
                "data": {
                    "chat_id": chat_id,
                    "chat_status": "PAUSED",
                    "elapsed_seconds": elapsed_seconds,
                },
            },
            str(chat_id),
        )

    async def _broadcast_session_resumed(self, chat_id: int, info: SessionInfo):
        """Broadcast session resumed event"""
        await manager.send_to_chat(
            {
                "event": "session_resumed",
                "data": {
                    "chat_id": chat_id,
                    "chat_status": "ACTIVE",
                    "elapsed_seconds": info.elapsed_seconds,
                    "remaining_seconds": info.remaining_seconds,
                    "remaining_minutes": info.remaining_minutes,
                    "minutes_charged": info.minutes_charged,
                    "client_balance": info.client_balance,
                    "credit_balance": info.credit_balance,
                    "paid_balance": info.paid_balance,
                    "rate_per_second": info.rate_per_second,
                    "rate_per_minute": info.rate_per_minute,
                },
            },
            str(chat_id),
        )

    async def _end_requested_session(
        self,
        chat_id: int,
        reason: ChatTerminationReason,
        ended_by_user_id: Optional[int] = None,
    ) -> None:
        """End a chat that was in REQUESTED status (decline request).

        Called when a psychic/admin/superadmin declines a chat request
        before any session was started.
        """
        self.requested_sessions.discard(chat_id)

        from app.database.client import SessionLocal

        db = SessionLocal()
        try:
            chat = db.query(Chat).filter(Chat.id == chat_id).first()
            if not chat:
                logger.warning(
                    "chat_not_found_when_ending_requested",
                    chat_id=chat_id,
                )
                return

            chat.status = ChatStatus.ENDED
            requested_session = (
                db.query(ChatSession)
                .filter(
                    ChatSession.chat_id == chat_id,
                    ChatSession.status == ChatSessionStatus.REQUESTED,
                )
                .order_by(ChatSession.id.desc())
                .first()
            )
            if requested_session is not None:
                requested_session.status = ChatSessionStatus.CANCELLED
            db.commit()

            logger.info(
                "chat_request_declined",
                chat_id=chat_id,
                ended_by_user_id=ended_by_user_id,
                reason=reason.value,
            )

            # Broadcast session ended event (needed so frontend WebSocket handler fires)
            await manager.send_to_chat(
                {
                    "event": "session_ended_confirmed",
                    "data": {
                        "chat_id": chat_id,
                        "reason": reason.value,
                        "chat_status": "ENDED",
                        "final_elapsed_seconds": 0,
                        "final_cost": 0,
                    },
                },
                str(chat_id),
            )

        except Exception as e:
            logger.error(
                "error_ending_requested_session",
                chat_id=chat_id,
                error=str(e),
                exc_info=True,
            )
            db.rollback()
            raise
        finally:
            db.close()


# Global session manager instance (will be initialized in main.py)
session_manager: Optional[SessionManager] = None


def get_session_manager() -> SessionManager:
    """Get the global session manager instance"""
    if session_manager is None:
        raise RuntimeError(
            "SessionManager not initialized. Call initialize_session_manager() first."
        )
    return session_manager


def initialize_session_manager() -> SessionManager:
    """Initialize the global session manager (uses session-per-operation)"""
    global session_manager
    session_manager = SessionManager()
    return session_manager
