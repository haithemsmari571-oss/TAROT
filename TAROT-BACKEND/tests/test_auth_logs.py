"""No password, password hash, token or full email address reaches a log line
from sign-up, sign-in or the verification link (ROUND26 defect 1, ROUND16
defect 1). A log line names a person by user id or by a masked email: the first
letter and the domain.

The real auth router, the request-context middleware and the DomainError handler
of app/main.py, on the in-memory database. The verification email goes through
the real send_email with only FastMail replaced, so its log lines run too. What
is read is the rendered log output: every record at DEBUG and above (caplog)
plus whatever reached stdout and stderr.
"""

import asyncio
import logging
import re
import traceback

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import IntegrityError

from app.config import get_app_settings
from app.database.client import engine as app_engine
from app.database.client import get_db
from app.exceptions.domain import DomainError
from app.logging_config import (
    AccessLogPathFilter,
    error_fields,
    log_safe_path,
    mask_email,
    mask_emails,
)
from app.middleware.request_context import RequestContextMiddleware
from app.models import User
from app.routers import auth as auth_router
from app.routers.chats import authenticate_websocket_user as chat_socket_auth
from app.routers.notifications import authenticate_websocket_user as notification_socket_auth
from app.services import auth as auth_service
from app.services import email as email_service
from app.utils.security import create_access_token

EMAIL = "Nadia.Stone@test.co"  # sign-up stores it lower case; logs must hold neither form
PASSWORD = "Moonlit-secret-42"
WRONG_PASSWORD = "Not-her-password-7"
MASKED = ("N***@test.co", "n***@test.co")


def _body(**changes):
    body = {
        "username": "nadia", "email": EMAIL, "password": PASSWORD,
        "date_of_birth": "1990-03-03", "gender": "WOMAN", "accept_terms": True,
    }
    body.update(changes)
    return body


@pytest.fixture
def mail(monkeypatch):
    """The real send_email with FastMail replaced: `sent` keeps each message,
    and a `refusal` text makes the send raise it, as an SMTP server would."""

    class FakeMail:
        sent: list = []
        refusal: str | None = None

        def __init__(self, conf):
            pass

        async def send_message(self, message):
            if FakeMail.refusal:
                raise ConnectionRefusedError(FakeMail.refusal)
            FakeMail.sent.append(message)

    FakeMail.sent = []
    monkeypatch.setattr(email_service, "FastMail", FakeMail)
    return FakeMail


@pytest.fixture
def hashes(monkeypatch):
    """Every password hash sign-up makes, so the logs can be searched for it."""
    made: list[str] = []
    real = auth_service.hash_password

    def record(password: str) -> str:
        made.append(real(password))
        return made[-1]

    monkeypatch.setattr(auth_service, "hash_password", record)
    return made


def _app(db, *, raise_server_exceptions=False) -> TestClient:
    from app.main import domain_exception_handler

    app = FastAPI()
    app.add_middleware(RequestContextMiddleware)
    app.include_router(auth_router.router, prefix="/api/auth")
    app.add_exception_handler(DomainError, domain_exception_handler)
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app, raise_server_exceptions=raise_server_exceptions, follow_redirects=False)


@pytest.fixture
def auth(db, mail):
    return _app(db)


@pytest.fixture
def logs(caplog, capsys):
    """read() gives the server's log output rendered since the last read. The
    test client's own request lines (httpx, httpcore) are the caller's side and
    are left out: they print the URL the test itself asked for."""
    caplog.set_level(logging.DEBUG)

    def read() -> str:
        captured = capsys.readouterr()
        rendered = "".join(
            caplog.handler.format(record) + "\n"
            for record in caplog.records
            if not record.name.startswith(("httpx", "httpcore"))
        )
        caplog.clear()
        return rendered + captured.out + captured.err

    return read


def _assert_clean(output: str, *secrets: str) -> None:
    lowered = output.lower()
    assert EMAIL.lower() not in lowered
    assert PASSWORD not in output
    assert WRONG_PASSWORD not in output
    assert "$argon2" not in output
    for secret in secrets:
        assert secret and secret not in output


# ── sign-up ───────────────────────────────────────────────────────────────────
def test_a_successful_signup_logs_the_id_and_a_masked_email_only(db, auth, mail, hashes, logs):
    logs()
    response = auth.post("/api/auth/sign-up", json=_body())
    output = logs()

    assert response.status_code == 201, response.text
    user = db.query(User).one()
    assert len(mail.sent) == 1  # the verification email really went through send_email
    _assert_clean(output, user.password_hash, *hashes)
    for event_name in ("signup_attempt", "user_created", "verification_email_sent", "signup_success"):
        assert event_name in output
    assert MASKED[0] in output  # the attempt names her by the masked address
    assert re.search(rf"user_id\S*=\S*{user.id}\b", output)


def test_a_signup_refused_as_taken_logs_no_password_hash_or_full_email(db, auth, hashes, logs):
    assert auth.post("/api/auth/sign-up", json=_body()).status_code == 201
    stored = db.query(User).one().password_hash
    logs()

    response = auth.post("/api/auth/sign-up", json=_body(username="nadia2"))
    output = logs()

    assert response.status_code == 400
    _assert_clean(output, stored, *hashes)
    assert "user_already_exists" in output and "signup_failed" in output
    assert any(masked in output for masked in MASKED)


def test_a_refused_verification_email_is_logged_without_the_address(db, auth, mail, hashes, logs):
    # An SMTP refusal names the recipient; the log line keeps the class and a masked text.
    mail.refusal = f"550 5.1.1 <{EMAIL.lower()}>: Recipient address rejected"
    logs()

    response = auth.post("/api/auth/sign-up", json=_body())
    output = logs()

    assert response.status_code == 201  # the account stands, the email can be resent
    _assert_clean(output, db.query(User).one().password_hash, *hashes)
    assert "email_send_failed" in output and "verification_email_send_failed" in output
    assert "ConnectionRefusedError" in output
    assert "n***@test.co" in output  # the refusal's own text, masked
    assert "Traceback" not in output


def test_a_signup_insert_failing_on_another_key_logs_and_raises_neither_hash_nor_email(db, mail, hashes, logs):
    """A failed key other than email, username or id (here client_code): the
    IntegrityError's text holds the insert's parameters and, on Postgres, the
    failing row. Neither the log nor the 500's traceback may carry it."""
    db.add(User(username="first", email="first@test.co", password_hash="hash", client_code="AVCLASH001"))
    db.commit()

    def same_code(mapper, connection, target):
        target.client_code = "AVCLASH001"

    event.listen(User, "before_insert", same_code)
    try:
        client = _app(db, raise_server_exceptions=True)
        logs()
        with pytest.raises(RuntimeError) as raised:
            client.post("/api/auth/sign-up", json=_body())
        output = logs()
    finally:
        event.remove(User, "before_insert", same_code)

    printed = "".join(traceback.format_exception(raised.value))  # what uvicorn prints with the 500
    assert str(raised.value) == auth_service.SIGNUP_INSERT_FAILED
    assert len(hashes) == 1
    for rendered in (output, printed):
        _assert_clean(rendered, *hashes)
        assert "INSERT INTO users" not in rendered
    assert "IntegrityError" not in printed  # the cause is not chained
    assert "signup_insert_failed" in output and "UNIQUE constraint failed: users.client_code" in output
    assert "signup_failed" in output
    assert [u.username for u in db.query(User)] == ["first"]


# ── sign-in ───────────────────────────────────────────────────────────────────
def test_a_successful_signin_logs_no_password_hash_token_or_full_email(db, auth, logs):
    assert auth.post("/api/auth/sign-up", json=_body()).status_code == 201
    user = db.query(User).one()
    logs()

    response = auth.post("/api/auth/sign-in", json={"email": EMAIL, "password": PASSWORD})
    output = logs()

    assert response.status_code == 200, response.text
    tokens = response.json()
    _assert_clean(output, user.password_hash, tokens["access_token"], tokens["refresh_token"])
    assert "signin_attempt" in output and "tokens_generated" in output and "signin_success" in output
    assert MASKED[0] in output


@pytest.mark.parametrize("case", ["wrong password", "unknown email", "unverified"])
def test_a_failed_signin_logs_no_password_hash_or_full_email(db, auth, logs, case):
    assert auth.post("/api/auth/sign-up", json=_body()).status_code == 201
    user = db.query(User).one()
    body = {"email": EMAIL, "password": PASSWORD}
    if case == "wrong password":
        body["password"] = WRONG_PASSWORD
    elif case == "unknown email":
        body = {"email": "Someone.Else@test.co", "password": WRONG_PASSWORD}
    else:
        user.is_verified = False
        db.commit()
    logs()

    response = auth.post("/api/auth/sign-in", json=body)
    output = logs()

    assert response.status_code in (400, 401, 403), response.text
    _assert_clean(output, user.password_hash)
    assert "someone.else@test.co" not in output.lower()
    assert "signin_failed" in output


# ── the verification link ─────────────────────────────────────────────────────
def test_the_verification_token_never_reaches_a_log_line(db, auth, mail, logs):
    assert auth.post("/api/auth/sign-up", json=_body()).status_code == 201
    [message] = mail.sent
    base = get_app_settings().VERIFY_ACCOUNT_BASE_URL
    token = re.search(re.escape(base) + r"/([A-Za-z0-9_-]+)", message.body).group(1)
    user = db.query(User).one()
    user.is_verified = False
    db.commit()
    logs()

    response = auth.get(f"/api/auth/verify-account/{token}")
    output = logs()

    assert response.status_code == 302 and "status=success" in response.headers["location"]
    assert db.query(User).one().is_verified is True
    assert token[:8] not in output
    assert "/api/auth/verify-account/<redacted>" in output  # the path every line of the request carries
    assert "verify_account_success" in output


def test_the_access_log_line_hides_the_verification_token():
    record = logging.LogRecord(
        "uvicorn.access", logging.INFO, __file__, 0, '%s - "%s %s HTTP/%s" %d',
        ("172.20.0.1:5000", "GET", "/api/auth/verify-account/s3cr3t-token?x=1", "1.1", 302), None,
    )
    assert AccessLogPathFilter().filter(record) is True
    assert record.getMessage() == '172.20.0.1:5000 - "GET /api/auth/verify-account/<redacted> HTTP/1.1" 302'
    # app/main.py configures logging on import; the filter sits on uvicorn's access logger.
    import app.main  # noqa: F401
    assert any(isinstance(f, AccessLogPathFilter) for f in logging.getLogger("uvicorn.access").filters)


def test_the_redacted_path_is_the_verification_route():
    [route] = [r for r in auth_router.router.routes if "verify-account" in r.path]
    assert route.path == "/verify-account/{token}"
    assert log_safe_path("/api/auth" + route.path.replace("{token}", "abc")) == "/api/auth/verify-account/<redacted>"
    assert log_safe_path("/api/chat/inbox") == "/api/chat/inbox"


# ── the socket sign-ins ───────────────────────────────────────────────────────
@pytest.mark.parametrize("authenticate", [chat_socket_auth, notification_socket_auth])
def test_a_socket_signin_logs_the_id_only(db, make_user, logs, authenticate):
    user = make_user()
    logs()
    token = create_access_token({"sub": str(user.id), "role": "USER"})
    signed_in = asyncio.run(authenticate(token, db))
    output = logs()
    assert signed_in.id == user.id
    assert user.email not in output and "websocket_auth_success" in output


# ── the helpers ───────────────────────────────────────────────────────────────
def test_an_email_is_masked_to_its_first_letter_and_domain():
    assert mask_email("nadia@test.co") == "n***@test.co"
    assert mask_email("") == mask_email(None) == mask_email("no-at-sign") == "***"
    assert mask_emails("to <nadia@test.co>, cc x.y@mail.example.com") == "to <n***@test.co>, cc x***@mail.example.com"
    assert mask_emails(mask_emails("nadia@test.co")) == "n***@test.co"


def test_database_errors_never_carry_the_statement_values():
    assert app_engine.hide_parameters is True
    engine = create_engine("sqlite://", hide_parameters=app_engine.hide_parameters)
    row = {"email": EMAIL.lower(), "password_hash": "$argon2id$v=19$m=65536,t=3,p=4$c2FsdA$aGFzaA"}
    with engine.connect() as connection:
        connection.execute(text("create table users (email text unique, password_hash text)"))
        connection.execute(text("insert into users values (:email, :password_hash)"), row)
        with pytest.raises(IntegrityError) as raised:
            connection.execute(text("insert into users values (:email, :password_hash)"), row)
    printed = "".join(traceback.format_exception(raised.value))
    assert row["email"] not in printed and row["password_hash"] not in printed
    assert error_fields(raised.value) == {
        "error_type": "IntegrityError", "error": "UNIQUE constraint failed: users.email",
    }
    engine.dispose()
