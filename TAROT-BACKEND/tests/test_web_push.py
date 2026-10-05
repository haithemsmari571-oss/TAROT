"""Phone notifications through Web Push (ROUND57).

The two standards checked against their own published example and read back
(RFC 8291's encrypted message, RFC 8292's token verified with the public key);
the three routes under real auth; what is sent, to whom and when it is held
back; and every path a reader's reply takes to a client, with the owner's two
kinds, end to end on the per-message journey harness. The push services are
faked at httpx: each post is recorded, opened with the receiving browser's own
private key, and answered with the status the test chooses.
"""

from __future__ import annotations

import asyncio
import json
import os
from types import SimpleNamespace

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.config import get_app_settings
from app.database.client import get_db
from app.enums.author_type import AuthorType
from app.enums.chat_status import ChatStatus
from app.enums.role import Role
from app.enums.user_status import UserStatus
from app.manager import manager
from app.models import Chat, Message
from app.models.push_subscription import PushSubscription
from app.routers import push as push_router
from app.services import offline_replies, owner_messaging, web_push
from app.services.ai import reading_single
from app.services.chat.event_dispatcher import EventDispatcher
from app.utils.security import create_access_token
from tests.test_owner_messaging import (  # noqa: F401 - fixtures by name
    _hybrid_thread,
    _replay_live,
    _set_mode,
    owner,
)
from tests.test_per_message_journey import (  # noqa: F401 - fixtures by name
    _client_messages,
    _model,
    _open_thread,
    _reader_messages,
    _send,
    journey,
    sqlite,
)
from tests.test_refund_promise import _set_entry, durable  # noqa: F401

# Captured before any fixture records it: the hook as the app runs it.
REAL_NOTIFY_OWNER = owner_messaging.notify_owner
SUBJECT = "mailto:test@example.com"
FCM = "https://fcm.googleapis.com/fcm/send/"


# ── the push services, faked at httpx ────────────────────────────────────────
class PushService:
    """Records every post and answers each address with the status the test
    sets (201 by default), or raises the exception set for it."""

    def __init__(self):
        self.posts = []
        self.status = {}

    def client(self, *args, **kwargs):
        return _FakeClient(self)


class _FakeClient:
    def __init__(self, service):
        self.service = service

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, content=None, headers=None):
        self.service.posts.append(SimpleNamespace(url=url, body=content, headers=headers))
        status = self.service.status.get(url, 201)
        if isinstance(status, Exception):
            raise status
        return SimpleNamespace(status_code=status)


def _hmac(key, data):
    return web_push._hmac_sha256(key, data)


class Browser:
    """A browser's push keys, as PushSubscription.toJSON() gives them, and the
    private key it reads what arrives with (RFC 8291, the receiving side)."""

    def __init__(self, name):
        self.endpoint = FCM + name
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.secret = os.urandom(16)
        self.p256dh = web_push.b64url(web_push._public_bytes(self.key.public_key()))
        self.auth = web_push.b64url(self.secret)

    def json(self, app):
        return {"endpoint": self.endpoint, "expirationTime": None,
                "keys": {"p256dh": self.p256dh, "auth": self.auth}, "app": app}

    def read(self, body):
        salt, size, length = body[:16], int.from_bytes(body[16:20], "big"), body[20]
        sender = body[21:21 + length]
        assert size == web_push.RECORD_SIZE and length == 65
        shared = self.key.exchange(
            ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), sender)
        )
        receiver = web_push.b64url_decode(self.p256dh)
        ikm = _hmac(_hmac(self.secret, shared), b"WebPush: info\x00" + receiver + sender + b"\x01")
        prk = _hmac(salt, ikm)
        cek = _hmac(prk, b"Content-Encoding: aes128gcm\x00\x01")[:16]
        nonce = _hmac(prk, b"Content-Encoding: nonce\x00\x01")[:12]
        plain = AESGCM(cek).decrypt(nonce, body[21 + length:], None)
        assert plain.endswith(b"\x02"), "one record, the last-record delimiter"
        return json.loads(plain[:-1])


def _push_on(monkeypatch, Local):
    """Throwaway VAPID keys, sends collected instead of scheduled, the fake
    push services, and the throttles cleared."""
    settings = web_push.get_push_settings()
    public, private = web_push.generate_vapid_keys()
    monkeypatch.setattr(settings, "VAPID_PUBLIC_KEY", public)
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", private)
    monkeypatch.setattr(settings, "VAPID_SUBJECT", SUBJECT)
    monkeypatch.setattr("app.database.client.SessionLocal", Local)
    monkeypatch.setattr(web_push, "_last_push", {})
    scheduled = []
    monkeypatch.setattr(web_push, "_schedule", scheduled.append)
    service = PushService()
    monkeypatch.setattr(httpx, "AsyncClient", service.client)

    def deliver():
        while scheduled:
            asyncio.run(scheduled.pop(0)())

    def fresh():
        """Forget what setting the scene sent or held: only what follows counts."""
        scheduled.clear()
        service.posts.clear()
        web_push._last_push.clear()

    return SimpleNamespace(public=public, private=private, service=service,
                           scheduled=scheduled, deliver=deliver, fresh=fresh)


def _subscribe(db, user, app, name):
    browser = Browser(name)
    db.add(PushSubscription(user_id=user.id, endpoint=browser.endpoint, p256dh=browser.p256dh,
                            auth=browser.auth, app=app))
    db.commit()
    return browser


def _opened(service, browser):
    return [browser.read(post.body) for post in service.posts if post.url == browser.endpoint]


def _rows(db):
    db.expire_all()
    return db.query(PushSubscription).order_by(PushSubscription.id).all()


@pytest.fixture
def push(db, monkeypatch):
    monkeypatch.setattr(get_app_settings(), "BILLING_MODE", "per_message")
    return _push_on(monkeypatch, sessionmaker(bind=db.get_bind(), expire_on_commit=False))


# ═════════════════════════════════════════════════════════════════════════════
# The standards
# ═════════════════════════════════════════════════════════════════════════════
def test_encryption_reproduces_rfc_8291_appendix_a_byte_for_byte():
    d = web_push.b64url_decode
    sender = ec.derive_private_key(
        int.from_bytes(d("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"), "big"), ec.SECP256R1()
    )
    body = web_push.encrypt(
        b"When I grow up, I want to be a watermelon",
        d("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4"),
        d("BTBZMqHH6r4Tts7J_aSIgg"),
        salt=d("DGv6ra1nlYgDCS1FRnbzlw"),
        sender_key=sender,
    )
    assert web_push.b64url(body) == (
        "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_"
        "yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
    )


def test_every_message_is_fresh_and_opens_with_the_browsers_own_key():
    browser = Browser("fresh")
    point = web_push.b64url_decode(browser.p256dh)
    one = web_push.encrypt(b'{"a": 1}', point, browser.secret)
    two = web_push.encrypt(b'{"a": 1}', point, browser.secret)
    assert one != two and one[:16] != two[:16], "a new salt and sender key each time"
    assert browser.read(one) == browser.read(two) == {"a": 1}


def test_the_vapid_token_names_the_push_service_and_verifies_with_the_public_key():
    public, private = web_push.generate_vapid_keys()
    keys = web_push._load_keys(public, private, SUBJECT)
    header = web_push.vapid_authorization(FCM + "abc", keys, now=1_000_000)
    assert header.startswith("vapid t=") and header.endswith(f", k={public}")
    token = header[len("vapid t="):header.index(", k=")]
    point = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), web_push.b64url_decode(public))
    claims = jwt.decode(token, point, algorithms=["ES256"], audience="https://fcm.googleapis.com",
                        options={"verify_exp": False})
    assert claims == {"aud": "https://fcm.googleapis.com", "exp": 1_000_000 + 12 * 3600, "sub": SUBJECT}
    assert jwt.get_unverified_header(token)["alg"] == "ES256"


def test_push_is_off_unless_all_three_are_set_and_the_keys_are_one_pair(monkeypatch):
    settings = web_push.get_push_settings()
    public, private = web_push.generate_vapid_keys()
    other_public, _ = web_push.generate_vapid_keys()
    for values, on in [
        (("", "", ""), False),
        ((public, private, ""), False),
        ((public, "", SUBJECT), False),
        ((other_public, private, SUBJECT), False),
        ((public, "not-a-key", SUBJECT), False),
        ((public, private, SUBJECT), True),
    ]:
        for name, value in zip(("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"), values):
            monkeypatch.setattr(settings, name, value)
        assert (web_push.public_key() == public) is on, values
        assert (web_push.vapid_keys() is not None) is on


def test_the_key_generator_prints_the_three_lines_env_needs(capsys):
    from app.scripts import generate_vapid_keys

    generate_vapid_keys.main()
    lines = dict(line.split("=", 1) for line in capsys.readouterr().out.strip().splitlines())
    assert set(lines) == {"VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"}
    assert web_push._load_keys(lines["VAPID_PUBLIC_KEY"], lines["VAPID_PRIVATE_KEY"], lines["VAPID_SUBJECT"])
    assert lines["VAPID_SUBJECT"] == "mailto:support@askvalentina.co.uk"


# ═════════════════════════════════════════════════════════════════════════════
# The routes
# ═════════════════════════════════════════════════════════════════════════════
@pytest.fixture
def routes(db, make_user, push):
    app = FastAPI()
    app.include_router(push_router.router, prefix="/api/push")
    app.dependency_overrides[get_db] = lambda: db
    http = TestClient(app, raise_server_exceptions=False)
    people = {role: make_user(role=role) for role in (Role.USER, Role.SUPERADMIN, Role.ADMIN, Role.PSYCHIC)}
    people["other"] = make_user()

    def call(method, path, user=None, body=None):
        headers = {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"} if user else {}
        return http.request(method.upper(), path, json=body, headers=headers)

    return SimpleNamespace(call=call, people=people, push=push, db=db)


def test_the_public_key_is_open_to_anyone_and_null_while_push_is_off(routes, monkeypatch):
    assert routes.call("get", "/api/push/public-key").json() == {"public_key": routes.push.public}
    monkeypatch.setattr(web_push.get_push_settings(), "VAPID_PRIVATE_KEY", "")
    answer = routes.call("get", "/api/push/public-key")
    assert answer.status_code == 200 and answer.json() == {"public_key": None}


def test_a_client_subscribes_once_per_browser_and_again_is_the_same_row(routes):
    client, browser = routes.people[Role.USER], Browser("phone")
    assert routes.call("post", "/api/push/subscription", body=browser.json("client")).status_code == 401
    first = routes.call("post", "/api/push/subscription", client, browser.json("client"))
    assert (first.status_code, first.json()) == (201, {"app": "client", "created": True})
    again = routes.call("post", "/api/push/subscription", client, browser.json("client"))
    assert (again.status_code, again.json()) == (200, {"app": "client", "created": False})
    [row] = _rows(routes.db)
    assert (row.user_id, row.endpoint, row.p256dh, row.auth, row.app) == (
        client.id, browser.endpoint, browser.p256dh, browser.auth, "client")
    assert row.user_agent == "testclient" and row.created_at is not None and row.last_used_at is None
    # The same browser signed in as someone else: the one row moves to her.
    other = routes.people["other"]
    assert routes.call("post", "/api/push/subscription", other, browser.json("client")).status_code == 200
    assert [(r.user_id, r.endpoint) for r in _rows(routes.db)] == [(other.id, browser.endpoint)]


def test_only_a_client_subscribes_in_the_app_and_only_the_superadmin_in_the_owners(routes):
    p = routes.people
    for user, app, status in [
        (p[Role.USER], "owner", 403), (p[Role.ADMIN], "owner", 403), (p[Role.PSYCHIC], "owner", 403),
        (p[Role.SUPERADMIN], "client", 403), (p[Role.ADMIN], "client", 403), (p[Role.PSYCHIC], "client", 403),
        (p[Role.SUPERADMIN], "owner", 201),
    ]:
        answer = routes.call("post", "/api/push/subscription", user, Browser(f"{user.id}-{app}").json(app))
        assert answer.status_code == status, (user.role, app, answer.text)
        if status == 403:
            assert answer.json() == {"detail": "PUSH_APP_NOT_ALLOWED"}
    assert [(r.user_id, r.app) for r in _rows(routes.db)] == [(p[Role.SUPERADMIN].id, "owner")]
    assert routes.call("post", "/api/push/subscription", p[Role.USER], Browser("x").json("reader")).status_code == 422


def test_a_subscription_the_server_cannot_use_is_refused(routes, monkeypatch):
    client, browser = routes.people[Role.USER], Browser("ok")
    for endpoint in ["http://fcm.googleapis.com/fcm/send/a", "https://fcm.googleapis.com:8443/a",
                     "https://169.254.169.254/latest", "https://backend:8000/api",
                     "https://evil.example/googleapis.com"]:
        answer = routes.call("post", "/api/push/subscription", client, {**browser.json("client"), "endpoint": endpoint})
        assert (answer.status_code, answer.json()) == (422, {"detail": "UNSUPPORTED_PUSH_SERVICE"}), endpoint
    for keys in [{"p256dh": "AAAA", "auth": browser.auth}, {"p256dh": browser.p256dh, "auth": "AAAA"},
                 {"p256dh": web_push.b64url(b"\x04" + b"\x01" * 64), "auth": browser.auth}]:
        answer = routes.call("post", "/api/push/subscription", client, {**browser.json("client"), "keys": keys})
        assert (answer.status_code, answer.json()) == (422, {"detail": "INVALID_PUSH_KEYS"}), keys
    for endpoint in ["https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/abc",
                     "https://wns2-bl2p.notify.windows.com/w/?token=x"]:
        answer = routes.call("post", "/api/push/subscription", client, {**browser.json("client"), "endpoint": endpoint})
        assert answer.status_code == 201, endpoint
    monkeypatch.setattr(web_push.get_push_settings(), "VAPID_SUBJECT", "")
    answer = routes.call("post", "/api/push/subscription", client, Browser("later").json("client"))
    assert (answer.status_code, answer.json()) == (409, {"detail": "PUSH_OFF"})
    assert len(_rows(routes.db)) == 3


def test_turning_off_forgets_only_her_own_browser_and_again_is_fine(routes):
    client, other = routes.people[Role.USER], routes.people["other"]
    mine, hers = Browser("mine"), Browser("hers")
    routes.call("post", "/api/push/subscription", client, mine.json("client"))
    routes.call("post", "/api/push/subscription", other, hers.json("client"))
    assert routes.call("delete", "/api/push/subscription", body={"endpoint": mine.endpoint}).status_code == 401
    assert routes.call("delete", "/api/push/subscription", client, {"endpoint": hers.endpoint}).status_code == 204
    assert len(_rows(routes.db)) == 2, "someone else's browser is not hers to forget"
    for _ in range(2):
        assert routes.call("delete", "/api/push/subscription", client, {"endpoint": mine.endpoint}).status_code == 204
    assert [r.endpoint for r in _rows(routes.db)] == [hers.endpoint]


# ═════════════════════════════════════════════════════════════════════════════
# Sending
# ═════════════════════════════════════════════════════════════════════════════
def _reply(db, chat, text="here you are", author=AuthorType.AI_DRAFTED, *, sender=None, system=False):
    message = Message(chat_id=chat.id, sender_id=chat.psychic_id if sender is None else sender,
                      content=text, author_type=author, is_system=system)
    db.add(message)
    db.commit()
    return message


@pytest.fixture
def conversation(db, push, make_user):
    client = make_user()
    client.username = "sarah jones"
    reader = make_user(role=Role.PSYCHIC)
    reader.username = "MARY ANN"
    db.commit()
    chat = Chat(user_id=client.id, psychic_id=reader.id, status=ChatStatus.ACTIVE)
    db.add(chat)
    db.commit()
    return SimpleNamespace(db=db, push=push, client=client, reader=reader, chat=chat)


def test_a_reply_tells_every_browser_of_hers_and_no_word_of_it(conversation):
    c = conversation
    phone, laptop = _subscribe(c.db, c.client, "client", "phone"), _subscribe(c.db, c.client, "client", "laptop")
    elsewhere = _subscribe(c.db, c.reader, "client", "not-hers")
    web_push.notify_client_reply(c.chat, _reply(c.db, c.chat, "the secret reading text"))
    c.push.deliver()
    expected = {"title": "Mary Ann replied ✦", "body": "Tap to read her message",
                "url": f"/app/chats/{c.chat.id}", "tag": f"chat-{c.chat.id}"}
    assert _opened(c.push.service, phone) == _opened(c.push.service, laptop) == [expected]
    assert _opened(c.push.service, elsewhere) == []
    assert all(b"secret" not in post.body for post in c.push.service.posts)
    headers = c.push.service.posts[0].headers
    assert headers["Content-Encoding"] == "aes128gcm" and headers["TTL"] == str(24 * 3600)
    assert headers["Urgency"] == "high" and headers["Topic"] == f"chat-{c.chat.id}"
    assert headers["Authorization"].endswith(f"k={c.push.public}")
    assert all(row.last_used_at is not None for row in _rows(c.db) if row.user_id == c.client.id)


def test_a_gone_browser_is_deleted_and_a_refusal_or_a_dead_network_keeps_it(conversation):
    c = conversation
    gone, missing, busy, dead, fine = (
        _subscribe(c.db, c.client, "client", name) for name in ("410", "404", "500", "net", "ok")
    )
    c.push.service.status.update({gone.endpoint: 410, missing.endpoint: 404, busy.endpoint: 500,
                                  dead.endpoint: httpx.ConnectError("down")})
    web_push.notify_client_reply(c.chat, _reply(c.db, c.chat))
    c.push.deliver()
    assert len(c.push.service.posts) == 5
    assert {r.endpoint: r.last_used_at is not None for r in _rows(c.db)} == {
        busy.endpoint: False, dead.endpoint: False, fine.endpoint: True}


def test_no_push_while_she_has_the_chat_open_in_sight(conversation):
    c = conversation
    phone = _subscribe(c.db, c.client, "client", "phone")
    ws = object()
    manager.active_chats[str(c.chat.id)] = [(ws, c.client.id)]
    try:
        web_push.notify_client_reply(c.chat, _reply(c.db, c.chat))
        assert c.push.scheduled == [], "in sight: nothing sent"
        manager.set_visible(ws, False)  # her phone locked, the page in the background
        web_push.notify_client_reply(c.chat, _reply(c.db, c.chat))
        c.push.deliver()
        assert len(_opened(c.push.service, phone)) == 1
    finally:
        manager.disconnect(ws, str(c.chat.id))
    assert id(ws) not in manager.hidden_sockets


def test_viewing_is_per_socket_and_per_chat():
    room, other_room, ws_a, ws_b, ws_c = "9001", "9002", object(), object(), object()
    manager.active_chats[room] = [(ws_a, 7), (ws_b, 7)]
    manager.active_chats[other_room] = [(ws_c, 8)]
    try:
        assert manager.is_viewing(room, 7) and not manager.is_viewing(room, 8)
        manager.set_visible(ws_a, False)
        assert manager.is_viewing(room, 7), "another tab still has it in sight"
        manager.set_visible(ws_b, False)
        assert not manager.is_viewing(room, 7)
        manager.set_visible(ws_b, True)
        assert manager.is_viewing(room, 7)
        assert not manager.is_viewing(other_room, 7)
    finally:
        for ws in (ws_a, ws_b):
            manager.disconnect(ws, room)
        manager.disconnect(ws_c, other_room)


def test_the_viewing_frame_reaches_the_manager(db):
    ws = SimpleNamespace()
    dispatcher = EventDispatcher(ws, db, chat_id=1, user_id=1)
    try:
        asyncio.run(dispatcher.dispatch("viewing", {"type": "viewing", "visible": False}))
        assert id(ws) in manager.hidden_sockets
        asyncio.run(dispatcher.dispatch("viewing", {"type": "viewing", "visible": True}))
        assert id(ws) not in manager.hidden_sockets
    finally:
        manager.hidden_sockets.discard(id(ws))


def test_only_a_readers_reply_in_a_per_message_chat_rings(conversation, monkeypatch):
    c = conversation
    _subscribe(c.db, c.client, "client", "phone")
    web_push.notify_client_reply(c.chat, _reply(c.db, c.chat, "Hello, I'm here with you.", AuthorType.SYSTEM))
    web_push.notify_client_reply(c.chat, _reply(c.db, c.chat, "Refunded", AuthorType.SYSTEM, system=True))
    web_push.notify_client_reply(c.chat, _reply(c.db, c.chat, "her own", AuthorType.HUMAN_PSYCHIC, sender=c.client.id))
    monkeypatch.setattr(get_app_settings(), "BILLING_MODE", "per_minute")
    web_push.notify_client_reply(c.chat, _reply(c.db, c.chat))
    assert c.push.scheduled == []
    monkeypatch.setattr(get_app_settings(), "BILLING_MODE", "per_message")
    web_push.notify_client_reply(c.chat, _reply(c.db, c.chat, "a person", AuthorType.HUMAN_PSYCHIC))
    assert len(c.push.scheduled) == 1


def test_the_bubbles_of_one_reply_ring_once(conversation, monkeypatch):
    c = conversation
    phone = _subscribe(c.db, c.client, "client", "phone")
    clock = [1000.0]
    monkeypatch.setattr(web_push.time, "monotonic", lambda: clock[0])
    for _ in range(3):
        web_push.notify_client_reply(c.chat, _reply(c.db, c.chat))
        clock[0] += 5
    clock[0] = 1000.0 + web_push.CLIENT_PUSH_GAP_SECONDS
    web_push.notify_client_reply(c.chat, _reply(c.db, c.chat))
    c.push.deliver()
    assert len(_opened(c.push.service, phone)) == 2


def test_with_push_off_nothing_is_scheduled_and_nothing_breaks(conversation, monkeypatch):
    c = conversation
    _subscribe(c.db, c.client, "client", "phone")
    monkeypatch.setattr(web_push.get_push_settings(), "VAPID_PUBLIC_KEY", "")
    web_push.notify_client_reply(c.chat, _reply(c.db, c.chat))
    web_push.notify_owner(c.chat.id, owner_messaging.CLIENT_MESSAGE)
    assert c.push.scheduled == []


def test_the_owner_hears_at_most_once_per_chat_in_two_minutes(conversation, make_user, monkeypatch):
    c = conversation
    boss = make_user(role=Role.SUPERADMIN)
    admin = make_user(role=Role.ADMIN)
    suspended = make_user(role=Role.SUPERADMIN)
    suspended.status = UserStatus.SUSPENDED
    c.db.commit()
    phone = _subscribe(c.db, boss, "owner", "boss-phone")
    not_owner = _subscribe(c.db, admin, "owner", "admin-phone")
    suspended_phone = _subscribe(c.db, suspended, "owner", "suspended-phone")
    clients_phone = _subscribe(c.db, c.client, "client", "client-phone")
    another_client = make_user()
    another_client.username = "sarah"
    second = Chat(user_id=another_client.id, psychic_id=c.reader.id, status=ChatStatus.ACTIVE)
    c.db.add(second)
    c.db.commit()
    clock = [5000.0]
    monkeypatch.setattr(web_push.time, "monotonic", lambda: clock[0])

    web_push.notify_owner(c.chat.id, owner_messaging.CLIENT_MESSAGE)
    clock[0] += 30
    web_push.notify_owner(c.chat.id, owner_messaging.SUGGESTION_READY)  # same chat: held
    web_push.notify_owner(second.id, owner_messaging.SUGGESTION_READY)  # another chat: sent
    clock[0] = 5000.0 + web_push.OWNER_PUSH_GAP_SECONDS
    web_push.notify_owner(c.chat.id, owner_messaging.SUGGESTION_READY)  # two minutes on: sent
    web_push.notify_owner(c.chat.id, "something_else")
    c.push.deliver()

    assert _opened(c.push.service, phone) == [
        {"title": "New message for Mary Ann", "body": "From Sarah",
         "url": f"/owner/messages/{c.chat.id}", "tag": f"owner-chat-{c.chat.id}"},
        {"title": "Suggestion ready for Sarah", "body": "Tap to send, edit or discard",
         "url": f"/owner/messages/{second.id}", "tag": f"owner-chat-{second.id}"},
        {"title": "Suggestion ready for Sarah", "body": "Tap to send, edit or discard",
         "url": f"/owner/messages/{c.chat.id}", "tag": f"owner-chat-{c.chat.id}"},
    ]
    assert _opened(c.push.service, not_owner) == [] and _opened(c.push.service, clients_phone) == []
    assert _opened(c.push.service, suspended_phone) == [], "a suspended account hears nothing"


@pytest.mark.parametrize("username, first", [
    ("sarah jones", "Sarah"), ("user", "User"), ("MARY ANN", "Mary"), ("o'neil", "O'Neil"),
    ("sophie-moon-2", "Sophie"), ("12345", "12345"),
])
def test_the_clients_first_name(username, first):
    assert web_push.client_first_name(username) == first


def test_deleting_the_account_forgets_her_browsers(conversation):
    from app.services.users import soft_delete_own_account

    c = conversation
    _subscribe(c.db, c.client, "client", "phone")
    keep = _subscribe(c.db, c.reader, "client", "someone-else")
    soft_delete_own_account(c.db, c.client)
    assert [r.endpoint for r in _rows(c.db)] == [keep.endpoint]


# ═════════════════════════════════════════════════════════════════════════════
# Every path a reply takes, and the owner's two kinds, on the journey harness
# ═════════════════════════════════════════════════════════════════════════════
@pytest.fixture
def lines(owner):
    """The owner fixture (owner_messaging.notify_owner recorded) with push on."""
    return SimpleNamespace(o=owner, p=_push_on(owner.monkeypatch, owner.journey.Local))


def _phones(lines, r):
    db = lines.o.db
    return _subscribe(db, r.client, "client", "her-phone"), _subscribe(db, lines.o.superadmin, "owner", "his-phone")


def _out_of_sight(r):
    """She leaves the room: her phone locked, the app closed."""
    manager.active_chats.pop(str(r.chat.id), None)


def _bearer(user):
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user.id)})}"}


def test_av_admin_send_rings_her_phone(lines):
    o, p = lines.o, lines.p
    r, _message = _hybrid_thread(o)
    her, his = _phones(lines, r)
    _out_of_sight(r)
    p.fresh()
    answer = o.http.post(f"/api/admin/chats/{r.chat.id}/suggestion/send", json={"content": "i'm here"},
                         headers=_bearer(o.superadmin))
    assert answer.status_code == 200, answer.text
    p.deliver()
    assert _opened(p.service, her) == [{"title": "Sophie replied ✦", "body": "Tap to read her message",
                                        "url": f"/app/chats/{r.chat.id}", "tag": f"chat-{r.chat.id}"}]
    assert _opened(p.service, his) == []


def test_av_admin_send_while_she_watches_the_chat_rings_nothing(lines):
    o, p = lines.o, lines.p
    r, _message = _hybrid_thread(o)
    her, _his = _phones(lines, r)
    p.fresh()
    answer = o.http.post(f"/api/admin/chats/{r.chat.id}/suggestion/send", json={"content": "i'm here"},
                         headers=_bearer(o.superadmin))
    assert answer.status_code == 200
    assert [f["content"] for f in r.ws.messages() if f.get("content") == "i'm here"] == ["i'm here"]
    p.deliver()
    assert _opened(p.service, her) == [], "she has the chat open in sight"


def test_the_automatic_readers_reply_rings_her_phone_once(lines):
    o, p = lines.o, lines.p
    r = _open_thread(o.journey)
    her, _his = _phones(lines, r)
    _out_of_sight(r)
    p.fresh()
    _model(o.journey, ["i'm here\n\ntell me what changed"])
    _replay_live(o, r.chat.id, r.hall.id)
    p.deliver()
    bubbles = [m for m in _reader_messages(o.db, r.chat, r.psychic) if m.id > r.hall.id]
    assert [m.content for m in bubbles] == ["i'm here", "tell me what changed"]
    assert [n["title"] for n in _opened(p.service, her)] == ["Sophie replied ✦"], "two bubbles, one ring"


def test_a_readers_own_socket_reply_rings_her_phone(lines):
    o, p = lines.o, lines.p
    r = _open_thread(o.journey)
    her, _his = _phones(lines, r)
    _out_of_sight(r)
    p.fresh()
    _send(o.journey, r.chat, r.psychic, "a word from me")
    p.deliver()
    assert [n["title"] for n in _opened(p.service, her)] == ["Sophie replied ✦"]


def test_a_queued_reply_from_the_offline_sweep_rings_her_phone(lines):
    o, p = lines.o, lines.p
    r = _open_thread(o.journey)
    her, _his = _phones(lines, r)
    _out_of_sight(r)
    p.fresh()
    from app.services.chats import prepare_ai_message

    def bubble(db, chat, text, message_id, token, position):
        assert (message_id, token, position) == (77, "tok", 0)
        return prepare_ai_message(db, chat, text)

    o.monkeypatch.setattr(offline_replies, "persist_bubble", bubble)
    asyncio.run(reading_single._persist_and_broadcast(r.chat.id, "while you were away", 77, "tok", 0))
    p.deliver()
    assert [n["title"] for n in _opened(p.service, her)] == ["Sophie replied ✦"]


def test_her_message_in_an_automatic_chat_rings_the_owner(lines):
    o, p = lines.o, lines.p
    r = _open_thread(o.journey)
    _set_entry(o.db, r.hall.id, state="delivered", live=False, lease_until=None)
    _her, his = _phones(lines, r)
    p.fresh()
    o.monkeypatch.setattr(owner_messaging, "notify_owner", REAL_NOTIFY_OWNER)
    _send(o.journey, r.chat, r.client, "will he call?")
    _send(o.journey, r.chat, r.client, "and when?")  # inside two minutes: held
    p.deliver()
    assert _opened(p.service, his) == [{"title": "New message for Sophie", "body": "From Client",
                                        "url": f"/owner/messages/{r.chat.id}", "tag": f"owner-chat-{r.chat.id}"}]


def test_a_suggestion_ready_rings_the_owner_at_most_once_in_two_minutes(lines, monkeypatch):
    o, p = lines.o, lines.p
    r = _open_thread(o.journey)
    _set_entry(o.db, r.hall.id, state="delivered", live=False, lease_until=None)
    _her, his = _phones(lines, r)
    assert _set_mode(o, r.chat.id, "hybrid").status_code == 200
    _send(o.journey, r.chat, r.client, "are you there?")
    message = _client_messages(o.db, r.chat, r.client)[-1]
    p.fresh()
    o.monkeypatch.setattr(owner_messaging, "notify_owner", REAL_NOTIFY_OWNER)
    clock = [100.0]
    monkeypatch.setattr(web_push.time, "monotonic", lambda: clock[0])
    assert owner_messaging.store_suggestion(r.chat.id, message.id, ["one", "two"], 1)
    clock[0] += 30
    assert owner_messaging.store_suggestion(r.chat.id, message.id, ["three"], 1)  # held
    clock[0] += web_push.OWNER_PUSH_GAP_SECONDS
    assert owner_messaging.store_suggestion(r.chat.id, message.id, ["four"], 1)
    p.deliver()
    assert [(n["title"], n["body"], n["url"]) for n in _opened(p.service, his)] == [
        ("Suggestion ready for Client", "Tap to send, edit or discard", f"/owner/messages/{r.chat.id}"),
    ] * 2
