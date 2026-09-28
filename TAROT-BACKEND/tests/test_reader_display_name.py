"""A reader's name as clients see it (ROUND34 item 2).

A reader has no display name apart from her username. When the username reads
as a name (words of letters, an apostrophe may join letters, single spaces
between words) it is her display name, in the app's Title case. Any other
username is a handle with no display name in it (end_control_reader_fee70ab6,
round33_away_1790508249517, sophie-moon-2), so she is named by its first name
part with a capital letter, never by the raw username.

The cases below are the same table as the app's check
(tarot-landing-web/scripts/test-reader-name.mts), so the email and the screens
name her alike.
"""

import asyncio
from datetime import timedelta

import pytest

from app.enums.author_type import AuthorType
from app.enums.transaction_status import TransactionStatus
from app.enums.transaction_type import TransactionType
from app.models import Transaction
from app.services import reply_emails
from tests.test_reply_emails import NOW, _chat, _message, _people, local, outbox  # noqa: F401 - fixtures

# Her username is her display name: Title case, as the app writes it.
DISPLAY_NAMES = [
    ("Sophie", "Sophie"),
    ("Delphine", "Delphine"),
    ("AMRIT", "Amrit"),
    ("sophie", "Sophie"),
    ("Mary Ann", "Mary ann"),
    ("Zoé", "Zoé"),
    ("O'Brien", "O'brien"),
    ("  Delphine  ", "Delphine"),
]
# A handle: the first name part, with a capital letter.
HANDLES = [
    ("end_control_reader_fee70ab6", "End"),
    ("round33_away_1790508249517", "Round"),
    ("sophie-moon", "Sophie"),
    ("sophie-moon-2", "Sophie"),
    ("anne.marie", "Anne"),
    ("user123", "User"),
    ("_x9", "X"),
    ("Mary  Ann", "Mary"),
    ("sophie@example.com", "Sophie"),
    # nothing in it that could be a name
    ("12345", ""),
]
EMPTY = [("", ""), (None, "")]
CASES = DISPLAY_NAMES + HANDLES + EMPTY


@pytest.mark.parametrize("username, shown", CASES)
def test_a_reader_is_named_by_her_display_name_or_her_first_name_part(username, shown):
    assert reply_emails.reader_name(username) == shown


@pytest.mark.parametrize("username, _", HANDLES)
def test_a_handle_is_never_shown(username, _):
    shown = reply_emails.reader_name(username)
    assert shown.lower() != username.lower()
    assert all(c.isalpha() or c in "'’" for c in shown)


def test_the_rule_holds_its_own_output():
    for _, shown in CASES:
        assert reply_emails.reader_name(shown) == shown


def test_the_reply_email_names_a_handle_by_its_first_name_part(local, outbox):
    client, psychic = _people(local, reader="round34_away_1790520000000")
    chat = _chat(local, client, psychic)
    _message(local, chat, psychic.id, NOW - reply_emails.REPLY_EMAIL_DELAY - timedelta(minutes=1))

    reply_emails.email_pass([], asyncio.run)

    [sent] = outbox
    assert sent.subject == "Round replied to you"
    assert "round34_away" not in sent.subject.lower()
    assert "round34_away" not in sent.body.lower()


def test_the_refund_email_names_a_handle_by_its_first_name_part(local, outbox):
    client, psychic = _people(local, reader="end_control_reader_fee70ab6")
    chat = _chat(local, client, psychic)
    message = _message(local, chat, client.id, NOW - timedelta(hours=24, minutes=1),
                       author=AuthorType.HUMAN_PSYCHIC, content="are you there?")
    local.add(Transaction(user_id=client.id, transaction_type=TransactionType.REVERSAL, amount=2.5,
                          balance_before=0, balance_after=2.5, status=TransactionStatus.COMPLETED,
                          related_chat_id=chat.id, related_message_id=message.id,
                          idempotency_key=f"msg_refund:{message.id}"))
    local.commit()

    reply_emails.email_pass([message.id], asyncio.run)

    [sent] = outbox
    assert sent.subject == "End could not reply in time. Your £2.50 is back."
    assert "end_control" not in sent.body.lower()


def test_a_display_name_is_unchanged_in_the_email(local, outbox):
    client, psychic = _people(local, reader="Sophie")
    chat = _chat(local, client, psychic)
    _message(local, chat, psychic.id, NOW - reply_emails.REPLY_EMAIL_DELAY - timedelta(minutes=1))

    reply_emails.email_pass([], asyncio.run)

    [sent] = outbox
    assert sent.subject == "Sophie replied to you"
