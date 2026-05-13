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
from app.manager import manager  # WebSocket connection manager

logger = get_logger(__name__)
settings = get_app_settings()


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
    client_balance: float
    chat_status: str
    session_status: str
    started_at: str
    rate_per_second: float


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

    async def start(self):
        """Start the session manager and monitoring loop"""
        logger.info("session_manager_starting")
        self._running = True

        # Load any active sessions from DB on startup
        self._load_active_sessions_from_db()

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
                # max_duration = elapsed + (current_balance / rate)
                estimated_max_duration = elapsed + int(
                    user.balance / chat.psychic.price_per_second
                    if chat.psychic.price_per_second > 0
                    else 0
                )

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
                    initial_balance=float(user.balance),  # Current balance as proxy
                    last_check_at=datetime.now(),
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

            # Validate minimum balance
            min_required = (
                psychic.price_per_second * settings.SESSION_MINIMUM_BALANCE_SECONDS
            )
            if user.balance < min_required:
                logger.warning(
                    "insufficient_balance_for_session_start",
                    chat_id=chat_id,
                    user_balance=user.balance,
                    min_required=min_required,
                )
                raise InsufficientBalanceError(
                    f"Minimum {min_required} points required ({settings.SESSION_MINIMUM_BALANCE_SECONDS} seconds)"
                )

            # Create ChatSession
            chat_session = ChatSession(
                chat_id=chat_id,
                status=ChatSessionStatus.ACTIVE,
                created_at=datetime.now(),
            )
            db.add(chat_session)
            db.flush()

            # Create SessionInterval
            interval = SessionInterval(
                session_id=chat_session.id,
                started_at=datetime.now(),
                trigger_event=ChatSessionTrigger.INITIAL_START,
                is_billed=False,
            )
            db.add(interval)

            # Update chat status
            chat.status = ChatStatus.ACTIVE

            db.commit()
            db.refresh(chat_session)
            db.refresh(interval)

            # Calculate max session duration based on initial balance
            # This is independent of billing - session ends when elapsed time reaches this
            max_duration = (
                int(user.balance / psychic.price_per_second)
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
                initial_balance=float(user.balance),
                last_check_at=datetime.now(),
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

            # Broadcast session_started event
            await self._broadcast_session_started(chat_id, info)

            # Store and broadcast system message for chat acceptance
            from app.services.chats import broadcast_system_message

            psychic_name = chat.psychic.username if chat.psychic else "Psychic"
            await broadcast_system_message(
                db, chat_id, f"{psychic_name} accepted the chat request."
            )

            return info

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

        # Remove from cache first (it's in paused_sessions if paused, not active_sessions)
        if chat_id in self.active_sessions:
            del self.active_sessions[chat_id]
            logger.info("removed_from_active_sessions_cache", chat_id=chat_id)
        else:
            logger.info("session_was_in_paused_cache", chat_id=chat_id)

        # Get fresh DB session for updates
        db = SessionLocal()
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
                ChatTerminationReason.CLIENT_DISCONNECTED,
            ):
                msg = "Session ended due to insufficient points."
                await broadcast_system_message(db, chat_id, msg)

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

            # Use provided balance or fetch from DB
            current_balance = (
                new_balance if new_balance is not None else float(user.balance)
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

            # Create new interval
            interval = SessionInterval(
                session_id=session_state.session_id,
                started_at=datetime.now(),
                trigger_event=ChatSessionTrigger.RESUME_AFTER_TOPUP,
                is_billed=False,
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
        # 1. Calculate elapsed time from session start
        elapsed_seconds = int(
            (datetime.now() - session_state.started_at).total_seconds()
        )

        # 2. Calculate estimated cost so far
        estimated_cost = elapsed_seconds * session_state.rate_per_second

        # 3. Calculate remaining time based on max duration (NOT current balance)
        # This is independent of billing - session ends when time runs out
        remaining_seconds = max(
            0, session_state.max_session_duration_seconds - elapsed_seconds
        )

        # 4. Get current balance from DB (for display purposes only, not used for session ending)
        user = db.query(User).filter(User.id == session_state.client_id).first()
        current_balance = float(user.balance) if user else 0.0

        # 5. Get chat status from DB
        chat = db.query(Chat).filter(Chat.id == session_state.chat_id).first()
        chat_status = chat.status.value if chat else "UNKNOWN"

        return SessionInfo(
            chat_id=session_state.chat_id,
            elapsed_seconds=elapsed_seconds,
            estimated_cost=round(estimated_cost, 2),
            remaining_seconds=remaining_seconds,
            client_balance=round(current_balance, 2),
            chat_status=chat_status,
            session_status="ACTIVE",
            started_at=session_state.started_at.isoformat(),
            rate_per_second=session_state.rate_per_second,
        )

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

                        # Calculate current state using fresh DB session
                        info = self._calculate_session_info(session_state, db)

                        # Track minimum for adaptive sleep
                        min_remaining = min(min_remaining, info.remaining_seconds)

                        # Check if session time has run out (remaining < 1 second)
                        # This is based on max_session_duration calculated at start
                        if info.remaining_seconds < 1:
                            logger.warning(
                                "session_time_depleted_ending_session",
                                chat_id=chat_id,
                                elapsed_seconds=info.elapsed_seconds,
                                max_duration=session_state.max_session_duration_seconds,
                                remaining_seconds=info.remaining_seconds,
                            )
                            await self.end_session(
                                chat_id, ChatTerminationReason.INSUFFICIENT_FUNDS
                            )
                            continue

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

            await broadcast_system_message(
                db,
                session_state.chat_id,
                "Your session will end in 5 minutes. Please top up to continue.",
            )

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
                    "client_balance": info.client_balance,
                    "chat_status": info.chat_status,
                    "session_status": info.session_status,
                    "started_at": info.started_at,
                    "rate_per_second": info.rate_per_second,
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
                    "client_balance": info.client_balance,
                    "rate_per_second": info.rate_per_second,
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
