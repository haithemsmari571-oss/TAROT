"""Reply emails (ROUND20): she hears by email that her reader replied, or that a
message was refunded.

- A reader's reply unread for REPLY_EMAIL_DELAY gets one email, "Sophie replied
  to you", with the way into the chat and none of the reply's words.
- Not if she has opened the conversation since the reply; not twice before she
  opens it again; not for the free opener, a system row or her own message; not
  for a reply older than REPLY_EMAIL_LOOKBACK.
- Only to a client (USER, ACTIVE) with a confirmed address and the switch on.
- A message refunded at the end of its window gets one email: "Sophie could not
  reply in time. Your £2.50 is back."
- The emails come from "Ask Valentina", and the sign-up and password emails
  sign off as Ask Valentina.
- PATCH /api/profile/me turns the switch off and on, never to null.
- The offline-replies thread hands each pass's refunds to the email pass.

On the in-memory database, which also stands in for the module's own
sessions. FastMail is replaced by a recorder, so the real send_email builds
every message and nothing leaves the process.
"""

import asyncio
import threading
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 - registers every model on Base.metadata
from app.database.client import get_db
from app.dependencies.get_current_user import get_current_user
from app.enums.author_type import AuthorType
from app.enums.chat_session_status import ChatSessionStatus
from app.enums.chat_status import ChatStatus
from app.enums.email_template_key import MailTemplateKey
from app.enums.role import Role
from app.enums.transaction_status import TransactionStatus
from app.enums.transaction_type import TransactionType
from app.enums.user_status import UserStatus
from app.models import Chat, ChatSession, Message, Transaction, User
from app.models.base import Base
from app.routers import profile as profile_router
from app.services import email as email_service
from app.services import offline_replies, reply_emails
from app.tasks import offline_reply_task

NOW = datetime(2026, 9, 25, 21, 0, tzinfo=timezone.utc)
DELAY = reply_emails.REPLY_EMAIL_DELAY
REPLY_TEXT = "the tower card is not the end, love"


@pytest.fixture
def local(monkeypatch):
    # The sweep's clock, where a test does not pass its own.
    monkeypatch.setattr(reply_emails, "_now", lambda: NOW)
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    Local = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(reply_emails, "SessionLocal", Local)
    db = Local()
    try:
        yield db
    finally:
        db.close()
        engine.dispose()


@pytest.fixture
def outbox(monkeypatch):
    """Every message the real send_email hands to FastMail."""
    sent = []

    class _FastMail:
        def __init__(self, conf):
            self.conf = conf

        async def send_message(self, message):
            sent.append(message)

    monkeypatch.setattr(email_service, "FastMail", _FastMail)
    return sent


def _people(db, *, verified=True, switch=True, status=UserStatus.ACTIVE, role=Role.USER, reader="sophie"):
    client = User(email="nadia@test.co", username="nadia", password_hash="hash", role=role,
                  status=status, is_verified=verified, reply_emails=switch)
    psychic = User(email="reader@test.co", username=reader, password_hash="hash",
                   role=Role.PSYCHIC, price_per_message=2.5)
    db.add_all([client, psychic])
    db.commit()
    return client, psychic


def _chat(db, client, psychic, *, opened_at=NOW - timedelta(minutes=30), emailed_at=None):
    chat = Chat(user_id=client.id, psychic_id=psychic.id, status=ChatStatus.ACTIVE,
                client_last_opened_at=opened_at, client_reply_emailed_at=emailed_at)
    db.add(chat)
    db.commit()
    return chat


def _message(db, chat, sender_id, at, *, author=AuthorType.AI_DRAFTED, system=False, content=REPLY_TEXT):
    message = Message(chat_id=chat.id, sender_id=sender_id, content=content, created_at=at,
                      author_type=author, is_system=system)
    db.add(message)
    db.commit()
    return message


def _conversation(db, *, reply_age=DELAY + timedelta(minutes=1), **people):
    client, psychic = _people(db, **people)
    chat = _chat(db, client, psychic)
    _message(db, chat, psychic.id, NOW - reply_age)
    return client, psychic, chat


def _stamp(db, chat):
    db.expire_all()
    return db.get(Chat, chat.id).client_reply_emailed_at


def _same_instant(a, b):
    """SQLite gives the stamp back without its zone; it was written in UTC."""
    return a is not None and a.replace(tzinfo=timezone.utc) == b


# ── the reply email ──────────────────────────────────────────────────────────
def test_a_reply_unread_for_five_minutes_gets_one_email(local):
    client, psychic, chat = _conversation(local)

    emails = reply_emails.claim_reply_emails(NOW)

    assert emails == [reply_emails.Email(MailTemplateKey.READER_REPLIED, chat.id, client.id,
                                         "nadia@test.co", "nadia", "Sophie replied to you")]
    assert _same_instant(_stamp(local, chat), NOW)
    # Stamped and committed before it goes: the next pass finds nothing.
    assert reply_emails.claim_reply_emails(NOW + timedelta(seconds=15)) == []


def test_the_email_says_only_that_she_replied_and_opens_the_chat(local, outbox, monkeypatch):
    monkeypatch.setattr(reply_emails, "get_app_settings",
                        lambda: SimpleNamespace(FRONT_BASE_URL="https://askvalentina.co.uk/"))
    _, _, chat = _conversation(local)

    reply_emails.email_pass([], asyncio.run)

    [message] = outbox
    assert message.subject == "Sophie replied to you"
    assert [r.email for r in message.recipients] == ["nadia@test.co"]
    assert "<h2>Sophie replied to you</h2>" in message.body
    assert f'href="https://askvalentina.co.uk/app/chats/{chat.id}"' in message.body
    assert ">Open the chat</a>" in message.body
    assert 'href="https://askvalentina.co.uk/app/you"' in message.body
    assert "&copy; 2026 Ask Valentina." in message.body
    assert REPLY_TEXT not in message.body
    assert email_service.conf.MAIL_FROM_NAME == "Ask Valentina"


def test_not_before_the_delay(local):
    _, _, chat = _conversation(local, reply_age=DELAY - timedelta(seconds=1))
    assert reply_emails.claim_reply_emails(NOW) == []
    assert _stamp(local, chat) is None
    # At the delay exactly, it is due.
    assert len(reply_emails.claim_reply_emails(NOW + timedelta(seconds=1))) == 1


def test_no_email_when_she_has_read_it(local):
    client, psychic = _people(local)
    reply_at = NOW - timedelta(minutes=10)
    chat = _chat(local, client, psychic, opened_at=reply_at + timedelta(seconds=2))
    _message(local, chat, psychic.id, reply_at)

    assert reply_emails.claim_reply_emails(NOW) == []
    assert _stamp(local, chat) is None


def test_she_opened_it_between_the_scan_and_the_claim(local):
    """The claim checks again under the conversation's row lock."""
    _, _, chat = _conversation(local)
    local.get(Chat, chat.id).client_last_opened_at = NOW - timedelta(seconds=1)
    local.commit()

    assert reply_emails._claim(chat.id, NOW) is None
    assert _stamp(local, chat) is None


def test_at_most_one_until_she_comes_back(local):
    client, psychic, chat = _conversation(local)
    assert len(reply_emails.claim_reply_emails(NOW)) == 1

    # Another reply while she stays away: no second email.
    _message(local, chat, psychic.id, NOW + timedelta(minutes=1))
    assert reply_emails.claim_reply_emails(NOW + timedelta(minutes=10)) == []

    # She comes back, then a new reply waits unread: one more email.
    local.get(Chat, chat.id).client_last_opened_at = NOW + timedelta(minutes=11)
    local.commit()
    _message(local, chat, psychic.id, NOW + timedelta(minutes=12))
    assert len(reply_emails.claim_reply_emails(NOW + timedelta(minutes=18))) == 1
    assert _same_instant(_stamp(local, chat), NOW + timedelta(minutes=18))


def test_a_conversation_never_opened_is_emailed_too(local):
    client, psychic = _people(local)
    chat = _chat(local, client, psychic, opened_at=None)
    _message(local, chat, psychic.id, NOW - timedelta(minutes=6))
    assert [e.chat_id for e in reply_emails.claim_reply_emails(NOW)] == [chat.id]


@pytest.mark.parametrize("row", ["opener", "system", "hers"])
def test_only_a_reader_reply_counts(local, row):
    client, psychic = _people(local)
    chat = _chat(local, client, psychic)
    at = NOW - timedelta(minutes=6)
    if row == "opener":
        _message(local, chat, psychic.id, at, author=AuthorType.SYSTEM, content="Hello, I'm here with you.")
    elif row == "system":
        _message(local, chat, None, at, author=AuthorType.SYSTEM, system=True,
                 content=offline_replies.REFUND_NOTE)
    else:
        _message(local, chat, client.id, at, author=AuthorType.HUMAN_PSYCHIC)
    assert reply_emails.claim_reply_emails(NOW) == []


def test_a_reply_older_than_the_lookback_is_not_emailed(local):
    _conversation(local, reply_age=reply_emails.REPLY_EMAIL_LOOKBACK + timedelta(seconds=1))
    assert reply_emails.claim_reply_emails(NOW) == []


@pytest.mark.parametrize("people", [
    {"switch": False},
    {"verified": False},
    {"status": UserStatus.SUSPENDED},
    {"role": Role.PSYCHIC},
    {"role": Role.ADMIN},
])
def test_only_a_confirmed_active_client_with_the_switch_on(local, people):
    _, _, chat = _conversation(local, **people)
    assert reply_emails.claim_reply_emails(NOW) == []
    assert _stamp(local, chat) is None


def test_the_names_are_escaped_in_the_email(local, outbox):
    # ROUND34: markup is no display name, so only its first name part reaches
    # the email; the apostrophe a name may hold is still escaped.
    _conversation(local, reader="<b>Eve</b>")
    reply_emails.email_pass([], asyncio.run)
    [message] = outbox
    assert "<b>eve" not in message.body.lower()
    assert "&lt;" not in message.body
    assert "<h2>B replied to you</h2>" in message.body


def test_an_apostrophe_in_a_name_is_escaped_in_the_email(local, outbox):
    _conversation(local, reader="O'Brien")
    reply_emails.email_pass([], asyncio.run)
    [message] = outbox
    assert message.subject == "O'brien replied to you"
    assert "<h2>O&#x27;brien replied to you</h2>" in message.body


def test_a_failed_send_is_logged_and_not_repeated(local, outbox, monkeypatch):
    client, _, first = _conversation(local)
    amrit = User(email="amrit@test.co", username="amrit", password_hash="hash", role=Role.PSYCHIC)
    local.add(amrit)
    local.commit()
    second = _chat(local, client, amrit)
    _message(local, second, amrit.id, NOW - timedelta(minutes=7))
    calls = []

    def run(coroutine):
        calls.append(coroutine)
        if len(calls) == 1:
            coroutine.close()
            raise TimeoutError("smtp")
        asyncio.run(coroutine)

    emails = reply_emails.email_pass([], run)

    assert [e.chat_id for e in emails] == [first.id, second.id]
    assert len(outbox) == 1  # the second still went
    assert _same_instant(_stamp(local, first), NOW)  # the first is lost, not resent
    assert reply_emails.claim_reply_emails(NOW + timedelta(seconds=15)) == []


# ── the refund email ─────────────────────────────────────────────────────────
def _refunded(db, *, amount=2.5, **people):
    client, psychic = _people(db, **people)
    chat = _chat(db, client, psychic)
    message = _message(db, chat, client.id, NOW - timedelta(hours=24, minutes=1),
                       author=AuthorType.HUMAN_PSYCHIC, content="are you there?")
    db.add(Transaction(user_id=client.id, transaction_type=TransactionType.REVERSAL, amount=amount,
                       balance_before=0, balance_after=amount, status=TransactionStatus.COMPLETED,
                       related_chat_id=chat.id, related_message_id=message.id,
                       idempotency_key=f"msg_refund:{message.id}"))
    db.commit()
    return client, chat, message


def test_a_refunded_message_gets_one_email_with_the_amount(local, outbox):
    client, chat, message = _refunded(local)

    emails = reply_emails.email_pass([message.id], asyncio.run)

    assert emails == [reply_emails.Email(
        MailTemplateKey.MESSAGE_REFUNDED, chat.id, client.id, "nadia@test.co", "nadia",
        "Sophie could not reply in time. Your £2.50 is back.")]
    [sent] = outbox
    assert sent.subject == "Sophie could not reply in time. Your £2.50 is back."
    assert "<h2>Sophie could not reply in time. Your £2.50 is back.</h2>" in sent.body
    # Her unanswered message is hers, not a reply: no second email.
    assert _stamp(local, chat) is None


@pytest.mark.parametrize("people", [{"switch": False}, {"verified": False},
                                    {"status": UserStatus.SUSPENDED}])
def test_no_refund_email_without_consent_or_a_confirmed_address(local, people):
    _, _, message = _refunded(local, **people)
    assert reply_emails.refund_email(message.id) is None


def test_a_real_refund_at_the_end_of_the_window_gets_its_email(local, outbox, monkeypatch):
    """The chain on the real code: her send charged and staged while the reader
    is away (per_message_start._store_charged_message, as a socket send runs
    it), refunded at the end of its window by refund_queued(expired=True), as
    sweep calls it, then the email pass reads the real reversal."""
    from app.services.per_message_start import _store_charged_message
    from app.services.reader_hours import UK_TIME

    Local = reply_emails.SessionLocal  # the in-memory database, as `local` set it
    monkeypatch.setattr(offline_replies, "SessionLocal", Local)
    # SQLite hands DateTime columns back without a zone: the queue's clock too.
    monkeypatch.setattr(offline_replies, "_now", lambda: datetime.now(timezone.utc).replace(tzinfo=None))
    client, psychic = _people(local)
    client.balance = 20
    uk_now = datetime.now(UK_TIME)
    psychic.online_from = (uk_now + timedelta(hours=2)).time().replace(second=0, microsecond=0)
    psychic.online_to = (uk_now + timedelta(hours=3)).time().replace(second=0, microsecond=0)
    chat = _chat(local, client, psychic)
    session = ChatSession(chat_id=chat.id, status=ChatSessionStatus.ACTIVE)
    local.add(session)
    local.commit()

    message, price = asyncio.run(_store_charged_message(local, chat, session, client, "are you there?"))
    local.commit()
    assert offline_replies.is_queued(local, message.id)
    # Inside the window: no refund, so nothing to email.
    assert offline_replies.refund_queued(message.id, expired=True) is None
    assert reply_emails.refund_email(message.id) is None

    local.get(Message, message.id).created_at = (
        datetime.now(timezone.utc).replace(tzinfo=None)
        - offline_replies.OFFLINE_REPLY_TIMEOUT - timedelta(minutes=1)
    )
    local.commit()
    assert offline_replies.refund_queued(message.id, expired=True) is not None

    emails = reply_emails.email_pass([message.id], asyncio.run)

    line = f"Sophie could not reply in time. Your £{price:.2f} is back."
    assert line == "Sophie could not reply in time. Your £2.50 is back."
    assert [(e.template, e.chat_id, e.subject) for e in emails] == [
        (MailTemplateKey.MESSAGE_REFUNDED, chat.id, line)]
    [sent] = outbox
    assert sent.subject == line
    # Her own message and the refund's quiet line are not a reply.
    assert _stamp(local, chat) is None


def test_no_refund_email_without_a_refund(local):
    client, psychic = _people(local)
    chat = _chat(local, client, psychic)
    message = _message(local, chat, client.id, NOW, author=AuthorType.HUMAN_PSYCHIC)
    assert reply_emails.refund_email(message.id) is None
    assert reply_emails.refund_email(999_999) is None


@pytest.mark.parametrize("amount, text", [(2.5, "£2.50"), (3, "£3"), (1250.5, "£1,250.50"), (0.2, "£0.20")])
def test_pounds_follow_the_apps_rule(amount, text):
    assert reply_emails.pounds(amount) == text


def test_reader_names_are_title_case_as_in_the_app():
    assert reply_emails.reader_name("AMRIT") == "Amrit"
    assert reply_emails.reader_name("sophie") == "Sophie"
    assert reply_emails.reader_name("") == ""


# ── the sign-up and password emails ──────────────────────────────────────────
@pytest.mark.parametrize("key, vars", [
    (MailTemplateKey.VERIFY_ACCOUNT, {"username": "nadia", "verify_link": "https://x/v"}),
    (MailTemplateKey.FORGOT_PASSWORD, {"username": "nadia", "reset_link": "https://x/r", "link_minutes": 60}),
])
def test_the_account_emails_sign_off_as_ask_valentina(outbox, key, vars):
    for template in (MailTemplateKey.VERIFY_ACCOUNT, MailTemplateKey.FORGOT_PASSWORD):
        body = email_service.templates[template.value]
        assert "Your Company" not in body and "The Support Team" not in body

    from fastapi_mail import NameEmail

    asyncio.run(email_service.send_email([NameEmail(email="nadia@test.co", name="nadia")],
                                         key.value, vars))
    [message] = outbox
    assert "Thanks,<br>Ask Valentina" in message.body
    assert "&copy; 2026 Ask Valentina. All rights reserved." in message.body
    assert message.subject in ("Verify your Ask Valentina account", "Reset your password")


# ── her switch, PATCH /api/profile/me ────────────────────────────────────────
def _profile(db, user) -> TestClient:
    app = FastAPI()
    app.include_router(profile_router.router, prefix="/api/profile")
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app, raise_server_exceptions=False)


def test_the_switch_is_on_for_a_new_client(db, make_user):
    user = make_user()
    assert user.reply_emails is True
    assert _profile(db, user).get("/api/profile/me").json()["reply_emails"] is True


def test_she_turns_the_switch_off_and_on(db, make_user):
    user = make_user()
    client = _profile(db, user)

    off = client.patch("/api/profile/me", json={"reply_emails": False})
    assert off.status_code == 200 and off.json()["reply_emails"] is False
    db.refresh(user)
    assert user.reply_emails is False

    # Another field left alone leaves the switch alone.
    assert client.patch("/api/profile/me", json={"bio": "hello"}).json()["reply_emails"] is False

    on = client.patch("/api/profile/me", json={"reply_emails": True})
    assert on.status_code == 200 and on.json()["reply_emails"] is True


def test_the_switch_is_never_null(db, make_user):
    user = make_user()
    response = _profile(db, user).patch("/api/profile/me", json={"reply_emails": None})
    assert response.status_code == 422
    assert "reply_emails must be true or false" in response.text
    db.refresh(user)
    assert user.reply_emails is True


# ── the thread ───────────────────────────────────────────────────────────────
def test_the_thread_hands_each_pass_refunds_to_the_email_pass(monkeypatch):
    loop = asyncio.new_event_loop()
    runner = threading.Thread(target=loop.run_forever, daemon=True)
    runner.start()
    seen, done, announced = [], threading.Event(), []

    def sweep(refunded):
        refunded.append(41)
        return []

    async def announce(message_id):
        announced.append(message_id)
        return True

    def email_pass(refunded, run):
        async def ping():
            return "sent on the loop"
        seen.append((list(refunded), run(ping())))
        done.set()
        return []

    monkeypatch.setattr(offline_reply_task, "get_app_settings",
                        lambda: SimpleNamespace(BILLING_MODE="per_message"))
    monkeypatch.setattr(offline_replies, "sweep", sweep)
    monkeypatch.setattr(offline_replies, "announce_refund", announce)
    monkeypatch.setattr(reply_emails, "email_pass", email_pass)
    stop = offline_reply_task.start_offline_reply_thread(loop)
    try:
        assert done.wait(5)
    finally:
        stop.set()
        loop.call_soon_threadsafe(loop.stop)
        runner.join(5)
    assert seen[0] == ([41], "sent on the loop")
    assert announced[0] == 41


def test_no_thread_and_no_email_in_per_minute_billing(monkeypatch):
    called = []
    monkeypatch.setattr(offline_reply_task, "get_app_settings",
                        lambda: SimpleNamespace(BILLING_MODE="per_minute"))
    monkeypatch.setattr(reply_emails, "email_pass", lambda *a: called.append(a))
    stop = offline_reply_task.start_offline_reply_thread(asyncio.new_event_loop())
    assert not stop.is_set() and called == []
