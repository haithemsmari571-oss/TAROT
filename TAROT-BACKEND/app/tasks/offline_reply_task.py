"""Per-message offline wake/refund pass, using the existing daemon-thread pattern."""

import asyncio
import threading

from app.config import get_app_settings
from app.logging_config import get_logger
from app.services import offline_replies, reply_emails

CHECK_INTERVAL_SECONDS = 15
logger = get_logger(__name__)


def start_offline_reply_thread(loop):
    stop = threading.Event()
    if get_app_settings().BILLING_MODE != "per_message":
        return stop

    def on_loop(coroutine):
        return asyncio.run_coroutine_threadsafe(coroutine, loop).result(
            timeout=CHECK_INTERVAL_SECONDS
        )

    def run():
        from app.services.ai.reading_single import enqueue_reply

        while not stop.is_set():
            refunded = []
            try:
                for chat_id, message_id, token in offline_replies.sweep(refunded):
                    future = asyncio.run_coroutine_threadsafe(
                        enqueue_reply(chat_id, message_id, queue_token=token), loop
                    )
                    future.result(timeout=CHECK_INTERVAL_SECONDS)
            except Exception:
                logger.exception("offline_reply_pass_failed")
            # Her room learns of each refund: the quiet line and her balance.
            for message_id in refunded:
                try:
                    asyncio.run_coroutine_threadsafe(
                        offline_replies.announce_refund(message_id), loop
                    ).result(timeout=CHECK_INTERVAL_SECONDS)
                except Exception:
                    logger.exception("offline_refund_announce_failed", message_id=message_id)
            # Her inbox: one email per refund above, then the replies she has
            # left unread (services/reply_emails.py).
            try:
                reply_emails.email_pass(refunded, on_loop)
            except Exception:
                logger.exception("reply_email_pass_failed")
            stop.wait(CHECK_INTERVAL_SECONDS)

    threading.Thread(target=run, daemon=True, name="offline-replies").start()
    logger.info("offline_reply_thread_started", interval_seconds=CHECK_INTERVAL_SECONDS)
    return stop
