"""Balance monitoring for real-time chat sessions"""

import asyncio
from sqlalchemy.orm import Session
from fastapi import WebSocket
from app.services.chat.event_dispatcher import EventDispatcher
from app.events.types import ChatEventType
from app.models import User
from app.logging_config import get_logger

logger = get_logger(__name__)


class BalanceMonitor:
    """Background task to monitor user balance during chat sessions"""

    def __init__(
        self,
        dispatcher: EventDispatcher,
        db: Session,
        chat_id: int,
        user_id: int,
        psychic_price_per_second: float,
    ):
        self.dispatcher = dispatcher
        self.db = db
        self.chat_id = chat_id
        self.user_id = user_id
        self.psychic_price_per_second = psychic_price_per_second
        self.warnings_sent = set()  # Track which warnings have been sent
        self.check_count = 0  # Track number of checks performed

        # Configuration
        self.CHECK_INTERVAL_NORMAL = 5  # Check every 5 seconds normally
        self.CHECK_INTERVAL_CRITICAL = 1  # Check every 1 second when critical
        self.CRITICAL_THRESHOLD = 30  # Switch to fast checks at 30 seconds remaining
        self.HEALTH_CHECK_INTERVAL = 10  # Log health check every 10 checks

    async def start(self) -> None:
        """Start monitoring user balance"""
        logger.info(
            "balance_monitor_started",
            chat_id=self.chat_id,
            user_id=self.user_id,
            rate=self.psychic_price_per_second,
        )

        try:
            while True:
                # Increment check counter
                self.check_count += 1

                # Refresh DB session to avoid stale data
                self.db.expire_all()

                # Get current balance
                user = self.db.query(User).filter(User.id == self.user_id).first()
                if not user:
                    logger.warning(
                        "balance_monitor_user_not_found",
                        chat_id=self.chat_id,
                        user_id=self.user_id,
                    )
                    break

                current_balance = float(user.balance)

                # Validate price
                if self.psychic_price_per_second <= 0:
                    logger.error(
                        "balance_monitor_invalid_rate",
                        chat_id=self.chat_id,
                        rate=self.psychic_price_per_second,
                    )
                    break

                # Calculate unbilled session cost (matches frontend calculation)
                unbilled_cost = self._calculate_unbilled_cost()

                # Calculate effective balance (actual balance - what's been used but not billed yet)
                effective_balance = current_balance - unbilled_cost

                # Calculate remaining time based on effective balance
                remaining_seconds = (
                    effective_balance / self.psychic_price_per_second
                    if self.psychic_price_per_second > 0
                    else 0
                )

                # Periodic health check logging
                if self.check_count % self.HEALTH_CHECK_INTERVAL == 0:
                    logger.info(
                        "balance_monitor_health_check",
                        chat_id=self.chat_id,
                        check_count=self.check_count,
                        raw_balance=current_balance,
                        unbilled_cost=round(unbilled_cost, 2),
                        effective_balance=round(effective_balance, 2),
                        remaining_seconds=round(remaining_seconds, 1),
                    )

                logger.debug(
                    "balance_monitor_check",
                    chat_id=self.chat_id,
                    raw_balance=current_balance,
                    unbilled_cost=unbilled_cost,
                    effective_balance=effective_balance,
                    remaining_seconds=remaining_seconds,
                )

                # Check if effective balance insufficient for 10 seconds
                minimum_required_balance = self.psychic_price_per_second * 10
                if effective_balance < minimum_required_balance:
                    logger.warning(
                        "balance_insufficient_for_10s",
                        chat_id=self.chat_id,
                        user_id=self.user_id,
                        raw_balance=current_balance,
                        unbilled_cost=unbilled_cost,
                        effective_balance=effective_balance,
                        minimum_required=minimum_required_balance,
                    )

                    await self.dispatcher.dispatch(
                        ChatEventType.BALANCE_INSUFFICIENT, {}
                    )
                    break

                # Send warnings at thresholds
                await self._check_warnings(remaining_seconds)

                # Adaptive sleep interval
                if remaining_seconds <= self.CHECK_INTERVAL_CRITICAL:
                    # Predictive: sleep until depletion
                    sleep_duration = max(0.1, remaining_seconds - 0.1)
                    await asyncio.sleep(sleep_duration)
                elif remaining_seconds <= self.CHECK_INTERVAL_NORMAL:
                    # Predictive: sleep until depletion
                    sleep_duration = max(0.5, remaining_seconds - 0.5)
                    await asyncio.sleep(sleep_duration)
                elif remaining_seconds < self.CRITICAL_THRESHOLD:
                    # Critical: check every 1 second
                    await asyncio.sleep(self.CHECK_INTERVAL_CRITICAL)
                else:
                    # Normal: check every 5 seconds
                    await asyncio.sleep(self.CHECK_INTERVAL_NORMAL)

        except asyncio.CancelledError:
            logger.info(
                "balance_monitor_cancelled", chat_id=self.chat_id, user_id=self.user_id
            )
            raise
        except Exception as e:
            logger.error(
                "balance_monitor_error",
                chat_id=self.chat_id,
                user_id=self.user_id,
                error=str(e),
                exc_info=True,
            )

    def _calculate_unbilled_cost(self) -> float:
        """Calculate the cost of unbilled session time (matches frontend calculation)"""
        from app.models.chat_session import ChatSession
        from app.models.session_intervals import SessionInterval
        from sqlalchemy import desc
        from datetime import datetime

        try:
            # Get the current active session
            session = (
                self.db.query(ChatSession)
                .filter(ChatSession.chat_id == self.chat_id)
                .order_by(desc(ChatSession.id))
                .first()
            )

            if not session:
                return 0.0

            # Get all intervals for this session
            all_intervals = (
                self.db.query(SessionInterval)
                .filter(SessionInterval.session_id == session.id)
                .all()
            )

            total_seconds = 0
            for interval in all_intervals:
                # For active intervals (ended_at is None), calculate up to now
                end_time = interval.ended_at if interval.ended_at else datetime.now()
                duration = (end_time - interval.started_at).total_seconds()
                total_seconds += duration

            # Calculate cost
            unbilled_cost = total_seconds * self.psychic_price_per_second
            return unbilled_cost

        except Exception as e:
            logger.error(
                "error_calculating_unbilled_cost",
                chat_id=self.chat_id,
                error=str(e),
                exc_info=True,
            )
            return 0.0

    async def _check_warnings(self, remaining_seconds: float) -> None:
        """Check and send appropriate warnings based on remaining time"""

        remaining_int = int(remaining_seconds)

        # Session ending soon warnings (60s, 30s, 10s)
        for threshold in [60, 30, 10]:
            if remaining_int <= threshold and threshold not in self.warnings_sent:
                await self.dispatcher.dispatch(
                    ChatEventType.SESSION_ENDING_SOON,
                    {"remaining_seconds": remaining_int},
                )
                self.warnings_sent.add(threshold)
                logger.info(
                    "session_ending_warning_sent",
                    chat_id=self.chat_id,
                    threshold=threshold,
                    remaining_seconds=remaining_int,
                )
                break

        # Low balance warning (5 minutes = 300s)
        if remaining_int <= 300 and 300 not in self.warnings_sent:
            await self.dispatcher.dispatch(
                ChatEventType.BALANCE_WARNING, {"remaining_seconds": remaining_int}
            )
            self.warnings_sent.add(300)
            logger.info(
                "low_balance_warning_sent",
                chat_id=self.chat_id,
                remaining_seconds=remaining_int,
            )
