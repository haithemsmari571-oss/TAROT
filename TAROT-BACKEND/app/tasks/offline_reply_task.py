"""Per-message offline wake/refund pass, using the existing daemon-thread pattern."""

import asyncio
import threading

from app.config import get_app_settings
from app.logging_config import get_logger
from app.services import offline_replies

CHECK_INTERVAL_SECONDS = 15
logger = get_logger(__name__)


def start_offline_reply_thread(loop):
    stop = threading.Event()
    if get_app_settings().BILLING_MODE != "per_message":
        return stop

    def run():
        from app.services.ai.reading_single import enqueue_reply

        while not stop.is_set():
            try:
                for chat_id, message_id, token in offline_replies.sweep():
                    future = asyncio.run_coroutine_threadsafe(
                        enqueue_reply(chat_id, message_id, queue_token=token), loop
                    )
                    future.result(timeout=CHECK_INTERVAL_SECONDS)
            except Exception:
                logger.exception("offline_reply_pass_failed")
            stop.wait(CHECK_INTERVAL_SECONDS)

    threading.Thread(target=run, daemon=True, name="offline-replies").start()
    logger.info("offline_reply_thread_started", interval_seconds=CHECK_INTERVAL_SECONDS)
    return stop
