"""Fix 1 — a client-disconnect (and other non-manual terminal reasons) must get
their own client-facing copy, not the misleading 'psychic has ended' default."""

from datetime import datetime

import pytest

from app.enums.chat_session_status import ChatSessionStatus
from app.enums.chat_status import ChatStatus
from app.enums.chat_termination_reason import ChatTerminationReason
from app.enums.response_mode import ResponseMode
from app.enums.role import Role
from app.models import Chat, User
from app.models.chat_session import ChatSession
from app.models.session_intervals import SessionInterval
from app.routers.chats import get_termination_message

GENERIC = "The psychic has ended the conversation."


def _chat_with_reason(db, reason):
    client = User(email="c@t.co", username="c", password_hash="h", role=Role.USER)
    psychic = User(email="p@t.co", username="p", password_hash="h", role=Role.PSYCHIC)
    db.add_all([client, psychic])
    db.commit()
    chat = Chat(user_id=client.id, psychic_id=psychic.id, status=ChatStatus.ENDED,
                response_mode=ResponseMode.SABRI)
    db.add(chat)
    db.commit()
    cs = ChatSession(chat_id=chat.id, status=ChatSessionStatus.COMPLETED)
    db.add(cs)
    db.commit()
    db.add(SessionInterval(session_id=cs.id, started_at=datetime.now(),
                           ended_at=datetime.now(), termination_reason=reason))
    db.commit()
    return chat.id


def test_client_disconnect_has_its_own_message(db):
    cid = _chat_with_reason(db, ChatTerminationReason.CLIENT_DISCONNECTED)
    msg = get_termination_message(db, cid)
    assert msg != GENERIC
    assert "connection was lost" in msg


@pytest.mark.parametrize(
    "reason,expected_fragment",
    [
        (ChatTerminationReason.NO_TOPUP, "insufficient points"),
        (ChatTerminationReason.PAUSE_TIMEOUT, "paused too long"),
    ],
)
def test_other_unmapped_reasons_are_distinct(db, reason, expected_fragment):
    cid = _chat_with_reason(db, reason)
    msg = get_termination_message(db, cid)
    assert msg != GENERIC
    assert expected_fragment in msg


def test_manual_exit_still_reads_as_psychic_ended(db):
    cid = _chat_with_reason(db, ChatTerminationReason.MANUAL_EXIT)
    assert get_termination_message(db, cid) == GENERIC
