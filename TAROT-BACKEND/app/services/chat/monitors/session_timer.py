"""Session timer broadcaster for real-time WebSocket updates"""

import asyncio
from datetime import datetime
from sqlalchemy.orm import Session
from app.manager import manager
from app.models import User, ChatSession, SessionInterval
from app.logging_config import get_logger
from sqlalchemy import desc

logger = get_logger(__name__)


class SessionTimerBroadcaster:
    """Broadcasts session timer updates via WebSocket every 5 seconds"""

    def __init__(
        self,
        db: Session,
        chat_id: int,
        user_id: int,
        psychic_price_per_second: float,
    ):
        self.db = db
        self.chat_id = chat_id
        self.user_id = user_id
        self.psychic_price_per_second = psychic_price_per_second
        self.is_running = True
        self.broadcast_count = 0

        # Configuration
        self.BROADCAST_INTERVAL = 5  # Broadcast every 5 seconds

    async def start(self) -> None:
        """Start broadcasting session timer updates"""
        logger.info(
            "session_timer_broadcaster_started",
            chat_id=self.chat_id,
            user_id=self.user_id,
            broadcast_interval=self.BROADCAST_INTERVAL,
        )

        try:
            while self.is_running:
                # Refresh DB session to avoid stale data
                self.db.expire_all()

                # Calculate current session stats
                stats = self._calculate_session_stats()

                if stats is None:
                    # Session not found or ended
                    logger.warning(
                        "session_timer_broadcaster_no_active_session",
                        chat_id=self.chat_id,
                    )
                    break

                # Broadcast to entire chat room (both psychic and client)
                await manager.send_to_chat(
                    message={
                        "event": "session_timer_tick",
                        "elapsed_seconds": stats["elapsed_seconds"],
                        "estimated_cost": stats["estimated_cost"],
                        "effective_balance": stats["effective_balance"],
                        "remaining_seconds": stats["remaining_seconds"],
                    },
                    chat_id=str(self.chat_id),
                )

                self.broadcast_count += 1

                # Log every 10 broadcasts (every ~50 seconds)
                if self.broadcast_count % 10 == 0:
                    logger.info(
                        "session_timer_broadcast_health_check",
                        chat_id=self.chat_id,
                        broadcast_count=self.broadcast_count,
                        elapsed_seconds=stats["elapsed_seconds"],
                        remaining_seconds=stats["remaining_seconds"],
                    )

                # Sleep for interval
                await asyncio.sleep(self.BROADCAST_INTERVAL)

        except asyncio.CancelledError:
            logger.info(
                "session_timer_broadcaster_cancelled",
                chat_id=self.chat_id,
                broadcast_count=self.broadcast_count,
            )
            raise
        except Exception as e:
            logger.error(
                "session_timer_broadcaster_error",
                chat_id=self.chat_id,
                error=str(e),
                exc_info=True,
            )

    def stop(self) -> None:
        """Stop the broadcaster"""
        self.is_running = False
        logger.info(
            "session_timer_broadcaster_stopped",
            chat_id=self.chat_id,
            broadcast_count=self.broadcast_count,
        )

    def _calculate_session_stats(self) -> dict:
        """Calculate current session statistics"""
        try:
            # Get the current active session
            session = (
                self.db.query(ChatSession)
                .filter(ChatSession.chat_id == self.chat_id)
                .order_by(desc(ChatSession.id))
                .first()
            )

            if not session:
                return None

            # Get all intervals for this session
            all_intervals = (
                self.db.query(SessionInterval)
                .filter(SessionInterval.session_id == session.id)
                .all()
            )

            # Calculate total elapsed time
            total_seconds = 0
            for interval in all_intervals:
                # For active intervals (ended_at is None), calculate up to now
                end_time = interval.ended_at if interval.ended_at else datetime.now()
                duration = (end_time - interval.started_at).total_seconds()
                total_seconds += duration

            # Calculate cost
            estimated_cost = total_seconds * self.psychic_price_per_second

            # Get current user balance
            user = self.db.query(User).filter(User.id == self.user_id).first()
            current_balance = float(user.balance) if user else 0.0

            # Calculate effective balance and remaining time
            effective_balance = current_balance - estimated_cost
            remaining_seconds = (
                effective_balance / self.psychic_price_per_second
                if self.psychic_price_per_second > 0
                else 0
            )

            return {
                "elapsed_seconds": int(total_seconds),
                "estimated_cost": round(estimated_cost, 2),
                "effective_balance": round(effective_balance, 2),
                "remaining_seconds": int(remaining_seconds),
            }

        except Exception as e:
            logger.error(
                "error_calculating_session_stats",
                chat_id=self.chat_id,
                error=str(e),
                exc_info=True,
            )
            return None
