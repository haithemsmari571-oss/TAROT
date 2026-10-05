"""Phone notifications through Web Push (ROUND57).

Two kinds, both to browsers that turned notifications on (push_subscriptions):
- to a client, when a reader's reply is stored in her per-message chat
  (notify_client_reply), from every path a reply takes: the automatic reader,
  the offline queue, the owner's phone and the CRM cockpit all store it through
  services/chats.py broadcast_persisted_ai_message; a reader's own socket send
  through services/chat/handlers/message_handler.py. Never while she has that
  chat open and visible (app/manager.py is_viewing).
- to the owner (SUPERADMIN), when a conversation wants him
  (owner_messaging.notify_owner -> notify_owner here), at most once per chat
  every OWNER_PUSH_GAP_SECONDS.

What goes over the wire is the standard: the payload encrypted to the
browser's keys as RFC 8291 says (aes128gcm, one record), and the server named
to the push service with a VAPID token (RFC 8292, ES256). The encryption is
written here on `cryptography`, which the backend already installs; PyJWT
signs the token and httpx posts it.

Push is off, silently, unless VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and
VAPID_SUBJECT are all set and the two keys are one pair (PushSettings). Every send
runs on its own, after the caller has finished, with its own database session,
and swallows its errors: a notification can never break a reply. A push
service that answers 404 or 410 has forgotten the subscription, and its row is
deleted.
"""

import asyncio
import base64
import json
import os
import threading
import time
from datetime import datetime, timezone
from functools import lru_cache
from typing import Callable, NamedTuple, Optional
from urllib.parse import urlsplit

import httpx
import jwt
from cryptography.hazmat.primitives import hashes, hmac, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.exc import IntegrityError

from app.config import get_app_settings
from app.logging_config import get_logger
from app.models.push_subscription import (
    PUSH_APP_CLIENT,
    PUSH_APP_OWNER,
    PushSubscription,
)

logger = get_logger(__name__)

# ── What each notification says, and where a tap lands ──
# No words of a message ever go on the lock screen.
CLIENT_REPLY_TITLE = "{reader} replied ✦"
CLIENT_REPLY_BODY = "Tap to read her message"
CLIENT_CHAT_URL = "/app/chats/{chat_id}"
OWNER_THREAD_URL = "/owner/messages/{chat_id}"
# The words for owner_messaging's two notify kinds (_owner_copy).
OWNER_MESSAGE_COPY = ("New message for {reader}", "From {client}")
OWNER_SUGGESTION_COPY = ("Suggestion ready for {client}", "Tap to send, edit or discard")

# The owner: at most one push per chat in this many seconds, whatever the kind.
OWNER_PUSH_GAP_SECONDS = 120
# The client: an automatic reply arrives as two or three bubbles a few seconds
# apart, each stored on its own. One alert per chat in this many seconds rings
# once for the whole reply.
CLIENT_PUSH_GAP_SECONDS = 120

# How long a push service keeps trying a phone that is off.
PUSH_TTL_SECONDS = 24 * 3600
# A VAPID token lives at most 24 hours (RFC 8292); half that is plenty.
VAPID_TOKEN_SECONDS = 12 * 3600
SEND_TIMEOUT_SECONDS = 10
# RFC 8291: one record, the receiver's maximum.
RECORD_SIZE = 4096

# The push services a subscription may name (Chrome and Android, Firefox,
# Safari and iPhone, Edge). The server posts to the address a browser gives, so
# any other host is refused at the door.
PUSH_SERVICE_HOST_SUFFIXES = (
    ".googleapis.com",
    ".push.services.mozilla.com",
    ".push.apple.com",
    ".notify.windows.com",
)

_P256DH_LENGTH = 65
_AUTH_LENGTH = 16


class SubscriptionRefused(ValueError):
    """A subscription the server will not keep, with the reason as its code."""


# ═════════════════════════════════════════════════════════════════════════════
# Keys and the two standards
# ═════════════════════════════════════════════════════════════════════════════
def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _public_bytes(key) -> bytes:
    return key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )


class PushSettings(BaseSettings):
    """The server's three phone notification settings, read the way
    config.AppSettings reads its own: the process environment first, then
    TAROT-BACKEND/.env. They live here because config.py is under the
    production lock (tests/test_valentina_production_lock.py). Empty in
    source; production sets all three in .env, made once with
    `python -m app.scripts.generate_vapid_keys`. Read once per process: the
    backend picks up new keys when it restarts."""

    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_SUBJECT: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_push_settings() -> PushSettings:
    return PushSettings()


class VapidKeys(NamedTuple):
    private: ec.EllipticCurvePrivateKey
    public: str
    subject: str


@lru_cache(maxsize=4)
def _load_keys(public: str, private: str, subject: str) -> Optional[VapidKeys]:
    if not (public and private and subject):
        if public or private or subject:
            logger.warning("web_push_keys_incomplete")
        return None
    try:
        raw = b64url_decode(private)
        key = ec.derive_private_key(int.from_bytes(raw, "big"), ec.SECP256R1())
        matches = _public_bytes(key.public_key()) == b64url_decode(public)
    except Exception:  # noqa: BLE001 - a malformed key only turns push off
        matches = False
    if not matches:
        logger.warning("web_push_keys_invalid")
        return None
    return VapidKeys(key, public, subject)


def vapid_keys() -> Optional[VapidKeys]:
    """The server's VAPID pair, or None when push is off."""
    settings = get_push_settings()
    return _load_keys(
        settings.VAPID_PUBLIC_KEY.strip(),
        settings.VAPID_PRIVATE_KEY.strip(),
        settings.VAPID_SUBJECT.strip(),
    )


def public_key() -> Optional[str]:
    """What a browser subscribes with (GET /api/push/public-key)."""
    keys = vapid_keys()
    return keys.public if keys else None


def generate_vapid_keys() -> tuple[str, str]:
    """A new pair, (public, private), base64url: the public key as the 65-byte
    point browsers take, the private key as its 32-byte number."""
    key = ec.generate_private_key(ec.SECP256R1())
    private = key.private_numbers().private_value.to_bytes(32, "big")
    return b64url(_public_bytes(key.public_key())), b64url(private)


def _hmac_sha256(key: bytes, data: bytes) -> bytes:
    mac = hmac.HMAC(key, hashes.SHA256())
    mac.update(data)
    return mac.finalize()


def encrypt(payload: bytes, p256dh: bytes, auth: bytes, *, salt: bytes = None, sender_key=None) -> bytes:
    """RFC 8291: the body of one push message, ``payload`` encrypted for the
    browser whose public key is ``p256dh`` and auth secret ``auth``. ``salt`` and
    ``sender_key`` are fresh for every message; tests pass the RFC's own."""
    receiver = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), p256dh)
    sender_key = sender_key or ec.generate_private_key(ec.SECP256R1())
    sender_public = _public_bytes(sender_key.public_key())
    salt = salt or os.urandom(16)
    shared = sender_key.exchange(ec.ECDH(), receiver)
    # HKDF-SHA-256 with one block of output, written out as RFC 8291 section 3.4.
    ikm = _hmac_sha256(
        _hmac_sha256(auth, shared),
        b"WebPush: info\x00" + p256dh + sender_public + b"\x01",
    )
    prk = _hmac_sha256(salt, ikm)
    cek = _hmac_sha256(prk, b"Content-Encoding: aes128gcm\x00\x01")[:16]
    nonce = _hmac_sha256(prk, b"Content-Encoding: nonce\x00\x01")[:12]
    # The one record ends with the last-record delimiter and no padding.
    ciphertext = AESGCM(cek).encrypt(nonce, payload + b"\x02", None)
    header = salt + RECORD_SIZE.to_bytes(4, "big") + bytes([len(sender_public)]) + sender_public
    return header + ciphertext


def vapid_authorization(endpoint: str, keys: VapidKeys, now: float = None) -> str:
    """RFC 8292: the Authorization header naming this server to the push
    service that owns ``endpoint``."""
    parts = urlsplit(endpoint)
    claims = {
        "aud": f"{parts.scheme}://{parts.netloc}",
        "exp": int(now if now is not None else time.time()) + VAPID_TOKEN_SECONDS,
        "sub": keys.subject,
    }
    token = jwt.encode(claims, keys.private, algorithm="ES256")
    return f"vapid t={token}, k={keys.public}"


# ═════════════════════════════════════════════════════════════════════════════
# Subscriptions (routers/push.py)
# ═════════════════════════════════════════════════════════════════════════════
def push_service_allowed(endpoint: str) -> bool:
    parts = urlsplit(endpoint)
    host = (parts.hostname or "").lower()
    return (
        parts.scheme == "https"
        and parts.port in (None, 443)
        and any(host.endswith(suffix) for suffix in PUSH_SERVICE_HOST_SUFFIXES)
    )


def _check_keys(p256dh: str, auth: str) -> None:
    try:
        point = b64url_decode(p256dh)
        secret = b64url_decode(auth)
        if len(point) != _P256DH_LENGTH or len(secret) != _AUTH_LENGTH:
            raise ValueError
        ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), point)
    except Exception:  # noqa: BLE001 - any malformed key is one refusal
        raise SubscriptionRefused("INVALID_PUSH_KEYS") from None


def save_subscription(db, user_id: int, endpoint: str, p256dh: str, auth: str, app: str, user_agent: Optional[str]) -> bool:
    """Keep this browser's subscription for ``user_id``. Idempotent on the
    address: the same browser again, or signed in as someone else, updates its
    one row. Returns True when the row is new."""
    if not push_service_allowed(endpoint):
        raise SubscriptionRefused("UNSUPPORTED_PUSH_SERVICE")
    _check_keys(p256dh, auth)
    values = {
        "user_id": user_id,
        "p256dh": p256dh,
        "auth": auth,
        "app": app,
        "user_agent": (user_agent or "")[:512] or None,
    }
    for _ in range(2):
        row = db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint).first()
        if row is not None:
            for name, value in values.items():
                setattr(row, name, value)
            db.commit()
            return False
        db.add(PushSubscription(endpoint=endpoint, **values))
        try:
            db.commit()
            return True
        except IntegrityError:
            # The same browser posted twice at once; the other one won.
            db.rollback()
    raise SubscriptionRefused("SUBSCRIPTION_CONFLICT")


def delete_subscription(db, user_id: int, endpoint: str) -> None:
    """Forget this browser for ``user_id``. Nothing to forget is fine."""
    db.query(PushSubscription).filter(
        PushSubscription.user_id == user_id, PushSubscription.endpoint == endpoint
    ).delete()
    db.commit()


# ═════════════════════════════════════════════════════════════════════════════
# Sending
# ═════════════════════════════════════════════════════════════════════════════
# The sends in flight, held so none is collected before it ends.
_pending: set = set()
_last_push: dict = {}
_last_push_lock = threading.Lock()


def _take_turn(audience: str, chat_id: int, gap: float) -> bool:
    """True, and the clock restarts, unless this chat had a push for this
    audience less than ``gap`` seconds ago."""
    now = time.monotonic()
    with _last_push_lock:
        last = _last_push.get((audience, chat_id))
        if last is not None and now - last < gap:
            return False
        _last_push[(audience, chat_id)] = now
        return True


def _schedule(make: Callable) -> None:
    """Run the coroutine ``make()`` returns after the caller has finished: on
    the running loop, or in a thread of its own where there is none."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        threading.Thread(target=lambda: asyncio.run(make()), daemon=True).start()
        return
    task = loop.create_task(make())
    _pending.add(task)
    task.add_done_callback(_pending.discard)


async def _post(client, row, body: bytes, topic: str, keys: VapidKeys) -> Optional[int]:
    """One encrypted message to one browser; the push service's status."""
    try:
        response = await client.post(
            row.endpoint,
            content=encrypt(body, b64url_decode(row.p256dh), b64url_decode(row.auth)),
            headers={
                "Authorization": vapid_authorization(row.endpoint, keys),
                "Content-Encoding": "aes128gcm",
                "Content-Type": "application/octet-stream",
                "TTL": str(PUSH_TTL_SECONDS),
                "Urgency": "high",
                # A newer message for the same chat replaces one still waiting.
                "Topic": topic,
            },
        )
        return response.status_code
    except Exception as error:  # noqa: BLE001 - one browser failing never stops the rest
        logger.warning("web_push_post_failed", subscription_id=row.id, error=str(error))
        return None


async def _send(prepare: Callable, log: dict) -> None:
    """``prepare(db)`` gives (subscriptions, message, topic), or None for
    nothing to send. Never raises."""
    from app.database.client import SessionLocal

    keys = vapid_keys()
    if keys is None:
        return
    db = SessionLocal()
    try:
        prepared = prepare(db)
        if prepared is None:
            return
        rows, message, topic = prepared
        if not rows:
            logger.info("web_push_no_subscription", **log)
            return
        body = json.dumps(message, ensure_ascii=False).encode("utf-8")
        sent, gone, refused = [], [], []
        async with httpx.AsyncClient(timeout=SEND_TIMEOUT_SECONDS) as client:
            for row in rows:
                status = await _post(client, row, body, topic, keys)
                if status in (404, 410):
                    gone.append({"subscription_id": row.id, "status": status})
                    db.delete(row)
                elif status is not None and 200 <= status < 300:
                    sent.append(row.id)
                    row.last_used_at = datetime.now(timezone.utc)
                else:
                    refused.append({"subscription_id": row.id, "status": status})
        db.commit()
        logger.info("web_push_sent", sent=sent, deleted=gone, refused=refused, **log)
    except Exception as error:  # noqa: BLE001 - a notification never breaks anything
        logger.warning("web_push_send_failed", error=str(error), **log)
        db.rollback()
    finally:
        db.close()


def _subscriptions(db, app: str, user_id: int = None) -> list:
    """Her browsers in the app, or, with no ``user_id``, the browsers of every
    active SUPERADMIN in his phone admin."""
    from app.enums.role import Role
    from app.enums.user_status import UserStatus
    from app.models import User

    query = db.query(PushSubscription).filter(PushSubscription.app == app)
    if user_id is not None:
        query = query.filter(PushSubscription.user_id == user_id)
    else:
        query = query.join(User, User.id == PushSubscription.user_id).filter(
            User.role == Role.SUPERADMIN, User.status == UserStatus.ACTIVE
        )
    return query.order_by(PushSubscription.id).all()


def client_first_name(username: Optional[str]) -> str:
    """The first word of the client's name, in the app's Title case: "sarah
    jones" -> "Sarah", "user" -> "User"; the username as it is when it holds
    no name."""
    from app.services.reply_emails import reader_name

    name = reader_name(username)
    return name.split(" ")[0] if name else (username or "").strip()


def notify_client_reply(chat, message) -> None:
    """A reader's reply was stored in her chat: tell her phone, unless she has
    the chat open and visible. Per-message conversations only. Never raises."""
    try:
        if vapid_keys() is None:
            return
        if get_app_settings().BILLING_MODE != "per_message":
            return
        from app.enums.author_type import AuthorType

        if (
            message.sender_id != chat.psychic_id
            or message.is_system
            or message.author_type == AuthorType.SYSTEM
        ):
            return
        from app.manager import manager

        log = {"kind": "client_reply", "chat_id": chat.id, "message_id": message.id}
        if manager.is_viewing(str(chat.id), chat.user_id):
            logger.info("web_push_skipped", reason="viewing", **log)
            return
        if not _take_turn(PUSH_APP_CLIENT, chat.id, CLIENT_PUSH_GAP_SECONDS):
            logger.info("web_push_skipped", reason="gap", **log)
            return
        from app.services.reply_emails import reader_name

        client_id = chat.user_id
        topic = f"chat-{chat.id}"
        content = {
            "title": CLIENT_REPLY_TITLE.format(reader=reader_name(chat.psychic.username)),
            "body": CLIENT_REPLY_BODY,
            "url": CLIENT_CHAT_URL.format(chat_id=chat.id),
            "tag": topic,
        }
        _schedule(lambda: _send(
            lambda db: (_subscriptions(db, PUSH_APP_CLIENT, user_id=client_id), content, topic),
            log,
        ))
    except Exception as error:  # noqa: BLE001
        logger.warning("web_push_notify_failed", error=str(error), chat_id=getattr(chat, "id", None))


def _owner_copy(kind: str):
    """(title, body) for one of owner_messaging's notify kinds, or None."""
    from app.services.owner_messaging import CLIENT_MESSAGE, SUGGESTION_READY

    return {CLIENT_MESSAGE: OWNER_MESSAGE_COPY, SUGGESTION_READY: OWNER_SUGGESTION_COPY}.get(kind)


def notify_owner(chat_id: int, kind: str) -> None:
    """Tell the owner's phones that a conversation wants him (owner_messaging
    notify_owner's two kinds), at most once per chat every
    OWNER_PUSH_GAP_SECONDS. Never raises."""
    try:
        copy = _owner_copy(kind)
        if vapid_keys() is None or copy is None:
            return
        log = {"kind": f"owner_{kind}", "chat_id": chat_id}
        if not _take_turn(PUSH_APP_OWNER, chat_id, OWNER_PUSH_GAP_SECONDS):
            logger.info("web_push_skipped", reason="gap", **log)
            return

        def prepare(db):
            from app.models import Chat
            from app.services.reply_emails import reader_name

            chat = db.get(Chat, chat_id)
            if chat is None:
                return None
            names = {
                "reader": reader_name(chat.psychic.username if chat.psychic else ""),
                "client": client_first_name(chat.user.username if chat.user else ""),
            }
            title, body = copy
            content = {
                "title": title.format(**names),
                "body": body.format(**names),
                "url": OWNER_THREAD_URL.format(chat_id=chat_id),
                "tag": f"owner-chat-{chat_id}",
            }
            return _subscriptions(db, PUSH_APP_OWNER), content, f"owner-{chat_id}"

        _schedule(lambda: _send(prepare, log))
    except Exception as error:  # noqa: BLE001
        logger.warning("web_push_notify_failed", error=str(error), chat_id=chat_id)
