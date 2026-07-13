"""Backend-core tests for the Valentina/Sabri delivery pipeline.

Model calls are stubbed, so these exercise the real orchestration LOGIC —
Sabri-output parsing (both JSON shapes), the correction loop (cap = 3), the
held-back buffer, session metadata, client-file load, retries, and the Atlas
session-end summary — deterministically and offline.
"""

from datetime import datetime, timedelta

import pytest

from app.enums.author_type import AuthorType
from app.enums.chat_status import ChatStatus
from app.enums.note_source import NoteSource
from app.enums.response_mode import ResponseMode
from app.enums.role import Role
from app.models import Chat, ClientNote, Message, User
from app.services.ai.reading_contracts import (
    DeliveryItem,
    DeliveryPlan,
    HeldItem,
    SabriParseError,
    ValentinaRequest,
    parse_sabri_output,
)
from app.services.ai.reading_llm import FALLBACK_MESSAGE, LLMCallError, run_with_retries
from app.services.ai.reading_pipeline import (
    _strip_return_acks,
    is_return_acknowledgment,
    process_client_message,
)
from app.services.ai.reading_session import (
    _length_bucket,
    _speed_bucket,
    compute_metadata,
    create_session_state,
    record_client_message,
    record_sent_message,
)
from app.services.chats import persist_ai_message

T0 = datetime(2026, 7, 12, 12, 0, 0)


# ── Sabri output parsing (consumes the new delivery-queue / valentina_request) ─
def test_reading_format_directive_maps_type_to_length():
    from app.services.ai.reading_pipeline import _reading_format_directive, _sabri_instructions

    assert "MICRO-READ" in _reading_format_directive("micro_read")
    assert "FULL READING" in _reading_format_directive("full_read")      # Sabri's real output
    assert "FULL READING" in _reading_format_directive("opening_read")   # Sabri's real output
    assert "FULL READING" in _reading_format_directive("full_reading")
    assert "CORRECTION" in _reading_format_directive("correction")
    # the directive is actually forwarded into the instructions Valentina receives
    req = ValentinaRequest(type="micro_read", instructions="be warm")
    assert "MICRO-READ" in _sabri_instructions(req)


def test_parse_valentina_request():
    d = parse_sabri_output(
        '{"action":"valentina_request","type":"full_reading",'
        '"instructions":"run pre-read","flags":["CORE","HIM-DEEP"],'
        '"client_message":"hi"}'
    )
    assert isinstance(d, ValentinaRequest)
    assert d.type == "full_reading"
    assert d.instructions == "run pre-read"
    assert d.flags == ["CORE", "HIM-DEEP"]


def test_parse_delivery_flat_array_splits_hold_back():
    d = parse_sabri_output(
        '[{"message":"line one","action":"send_now","tier":"provocation"},'
        '{"text":"held line","action":"hold_back","hold_trigger":"if she mentions X"}]'
    )
    assert isinstance(d, DeliveryPlan)
    assert [i.message for i in d.queue] == ["line one"]
    assert d.queue[0].pacing == "send_now"
    assert len(d.hold_back) == 1
    assert d.hold_back[0].text == "held line"
    assert d.hold_back[0].hold_trigger == "if she mentions X"


def test_parse_delivery_object_wrapper():
    d = parse_sabri_output(
        '{"action":"deliver","queue":[{"message":"a","pacing":"pause_long"}],'
        '"hold_back":[{"text":"b","hold_trigger":"if Y"}],"session_notes":"noted"}'
    )
    assert isinstance(d, DeliveryPlan)
    assert d.queue[0].message == "a" and d.queue[0].pacing == "pause_long"
    assert d.hold_back[0].text == "b"
    assert d.session_notes == "noted"


def test_parse_tolerates_code_fences_and_single_item():
    d = parse_sabri_output('```json\n{"action":"valentina_request","instructions":"x"}\n```')
    assert isinstance(d, ValentinaRequest)
    d2 = parse_sabri_output('{"message":"just one","action":"send_now"}')
    assert isinstance(d2, DeliveryPlan) and d2.queue[0].message == "just one"


def test_parse_invalid_pacing_defaults_and_bad_output_raises():
    d = parse_sabri_output('[{"message":"m","action":"WEIRD"}]')
    assert d.queue[0].pacing == "send_now"
    with pytest.raises(SabriParseError):
        parse_sabri_output("this is not json at all")


# ── session state + metadata ─────────────────────────────────────────────────
def test_record_and_metadata_buckets():
    s = create_session_state("sess1", client_id=1, chat_id=1, is_first_session=True, now=T0)
    # client replies 10s after session start -> fast; 12 chars -> short
    record_client_message(s, "hey there!!!", now=T0 + timedelta(seconds=10))
    record_sent_message(s, "a reader reply", now=T0 + timedelta(seconds=12))
    meta = compute_metadata(s, now=T0 + timedelta(seconds=60))
    assert meta["is_first_session"] is True
    assert meta["messages_sent_count"] == 1
    assert meta["client_avg_response_length"] == "short"
    assert meta["client_response_speed"] == "fast"
    assert s.chat_transcript[0]["role"] == "client"
    assert s.chat_transcript[1]["role"] == "logan"


def test_metadata_bucket_boundaries():
    assert _length_bucket(19) == "short"
    assert _length_bucket(20) == "medium"
    assert _length_bucket(100) == "medium"
    assert _length_bucket(101) == "long"
    assert _speed_bucket(29) == "fast"
    assert _speed_bucket(120) == "normal"
    assert _speed_bucket(300) == "slow"
    assert _speed_bucket(301) == "silent"
    assert _speed_bucket(None) == "silent"


# ── LLM retries ──────────────────────────────────────────────────────────────
def test_retries_succeed_then_give_up():
    calls = {"n": 0}

    def flaky():
        calls["n"] += 1
        if calls["n"] < 3:
            raise ValueError("boom")
        return "ok"

    assert run_with_retries(flaky, delays=(0, 0, 0), sleep=lambda _s: None) == "ok"
    assert calls["n"] == 3

    with pytest.raises(LLMCallError):
        run_with_retries(lambda: (_ for _ in ()).throw(ValueError("x")),
                         delays=(0, 0), sleep=lambda _s: None)


# ── orchestrator: the Sabri<->Valentina loop ─────────────────────────────────
class _Sabri:
    """Returns scripted decisions in order; records the inputs it received."""

    def __init__(self, decisions):
        self.decisions = list(decisions)
        self.inputs = []

    def __call__(self, inp):
        self.inputs.append(inp)
        return self.decisions[min(len(self.inputs) - 1, len(self.decisions) - 1)]


def _new_state(**kw):
    return create_session_state("s", client_id=1, chat_id=1, client_file="FILE", now=T0, **kw)


def test_sabri_delivers_immediately_no_valentina():
    plan = DeliveryPlan(queue=[DeliveryItem(message="from buffer", pacing="send_now")])
    sabri = _Sabri([plan])
    vcalls = {"n": 0}

    def valentina(_req):
        vcalls["n"] += 1
        return "unused"

    state = _new_state()
    out = process_client_message(state, "hi", sabri_call=sabri, valentina_call=valentina,
                                 max_corrections=3, now=T0)
    assert out is plan
    assert vcalls["n"] == 0
    assert state.sabri_correction_count == 0
    assert state.chat_transcript[-1]["content"] == "hi"  # client msg recorded


def test_request_then_approve_calls_valentina_once():
    delivery = DeliveryPlan(queue=[DeliveryItem(message="approved reply", pacing="send_now")])
    sabri = _Sabri([ValentinaRequest(instructions="generate"), delivery])
    vcalls = []

    def valentina(req):
        vcalls.append(req)
        return "reading text"

    state = _new_state()
    out = process_client_message(state, "will he come back?", sabri_call=sabri,
                                 valentina_call=valentina, max_corrections=3, now=T0)
    assert out is delivery
    assert len(vcalls) == 1
    assert state.sabri_correction_count == 1


def test_correction_loop_caps_at_three_then_falls_back():
    # Sabri always asks for another Valentina round (never delivers).
    sabri = _Sabri([ValentinaRequest(instructions="again")] * 6)
    vcalls = {"n": 0}

    def valentina(_req):
        vcalls["n"] += 1
        return f"reading {vcalls['n']}"

    state = _new_state()
    out = process_client_message(state, "msg", sabri_call=sabri, valentina_call=valentina,
                                 max_corrections=3, now=T0)
    # Valentina regenerated at most 3 times; Sabri called 4 times (3 + the forced round).
    assert vcalls["n"] == 3
    assert len(sabri.inputs) == 4
    assert sabri.inputs[-1].get("max_corrections_reached") is True
    # app-side fallback delivery from the last reading -> deliverable plan exists
    assert isinstance(out, DeliveryPlan) and len(out.queue) >= 1
    assert state.sabri_correction_count == 3


def test_forced_round_can_still_deliver():
    delivery = DeliveryPlan(queue=[DeliveryItem(message="final", pacing="send_now")])
    # request x3, then on the forced 4th call Sabri delivers
    sabri = _Sabri([ValentinaRequest()] * 3 + [delivery])
    state = _new_state()
    out = process_client_message(state, "m", sabri_call=sabri,
                                 valentina_call=lambda _r: "x", max_corrections=3, now=T0)
    assert out is delivery
    assert sabri.inputs[-1].get("max_corrections_reached") is True


def test_micro_read_caps_at_two_generations_then_force_delivers():
    # Sabri keeps requesting a micro_read (never delivers). The loop must stop at
    # micro_max_corrections (2) Valentina drafts — NOT the full cap of 3 — and
    # force-deliver the 2nd draft, deterministically, regardless of Sabri's gate.
    sabri = _Sabri([ValentinaRequest(type="micro_read", instructions="warm opener")] * 6)
    vcalls = {"n": 0}

    def valentina(_req):
        vcalls["n"] += 1
        return f"draft {vcalls['n']}"

    state = _new_state()
    out = process_client_message(state, "hi", sabri_call=sabri, valentina_call=valentina,
                                 max_corrections=3, micro_max_corrections=2, now=T0)
    assert vcalls["n"] == 2                       # capped at 2, not 3
    assert len(sabri.inputs) == 3                 # 2 requests + the forced 3rd
    assert sabri.inputs[-1].get("max_corrections_reached") is True
    assert isinstance(out, DeliveryPlan) and len(out.queue) >= 1
    assert "draft 2" in " ".join(m.message for m in out.queue)   # 2nd draft delivered
    assert state.sabri_correction_count == 2


def test_micro_read_accepted_round_one_no_extra_generation():
    delivery = DeliveryPlan(queue=[DeliveryItem(message="hey love", pacing="send_now")])
    sabri = _Sabri([ValentinaRequest(type="micro_read", instructions="x"), delivery])
    vcalls = {"n": 0}

    def valentina(_req):
        vcalls["n"] += 1
        return "draft 1"

    state = _new_state()
    out = process_client_message(state, "hi", sabri_call=sabri, valentina_call=valentina,
                                 max_corrections=3, micro_max_corrections=2, now=T0)
    assert out is delivery
    assert vcalls["n"] == 1                       # accepted after a single generation


def test_full_reading_unaffected_by_micro_cap():
    # A full_reading must still use the full cap (3), never the tighter micro cap.
    sabri = _Sabri([ValentinaRequest(type="full_reading", instructions="again")] * 6)
    vcalls = {"n": 0}

    def valentina(_req):
        vcalls["n"] += 1
        return f"reading {vcalls['n']}"

    state = _new_state()
    out = process_client_message(state, "will he come back? im sarah, 1990", sabri_call=sabri,
                                 valentina_call=valentina, max_corrections=3,
                                 micro_max_corrections=2, now=T0)
    assert vcalls["n"] == 3                        # full cap, unaffected by micro cap
    assert isinstance(out, DeliveryPlan) and len(out.queue) >= 1


@pytest.mark.parametrize("micro_type", ["micro_read", "micro-read", "MICRO_READ", "micro", "micro_reading"])
def test_micro_cap_matches_loose_type_variants(micro_type):
    # Sabri's type vocabulary varies; a micro-read with a non-canonical type string
    # must still hit the tighter cap (same loose match _reading_format_directive uses
    # to give Valentina a micro-read length) — else it escapes the cap and spins 3x.
    sabri = _Sabri([ValentinaRequest(type=micro_type, instructions="x")] * 6)
    vcalls = {"n": 0}

    def valentina(_req):
        vcalls["n"] += 1
        return f"draft {vcalls['n']}"

    state = _new_state()
    process_client_message(state, "hi", sabri_call=sabri, valentina_call=valentina,
                           max_corrections=3, micro_max_corrections=2, now=T0)
    assert vcalls["n"] == 2   # capped at 2 regardless of the exact type spelling


# ── return-acknowledgment filter (deterministic backstop for Valentina's ban) ─
@pytest.mark.parametrize("line", [
    "hey hey, welcome back",
    "you're back",
    "you're back again",
    "you arrived louder than the last time you were quiet",
    "it's been a while",
    "since we last spoke there's been a shift",
    "good to see you again",
    "you came back louder than you left",
    "last time you were here you barely held the thread",
    "when we last spoke you were unsure",
    # broadened after adversarial review (previously leaked)
    "it's been a minute",
    "it has been a while",
    "so lovely to see you again",
    "wonderful to see you back",
    "you've come back to me",
    "you came back with a different frequency",
    "you've been gone a while",
    "last time you reached out you were unsure",
    "good to see you back",
    "something shifted in you since last time",
    "since the last time you sat with me",
])
def test_is_return_acknowledgment_positive(line):
    assert is_return_acknowledgment(line) is True


@pytest.mark.parametrize("line", [
    "he came back to you last week",              # about HIM, not her session
    "the last time he called was a tuesday",      # about him
    "you're back to square one with him",         # idiom, not a session return
    "you're back in his orbit and you know it",   # idiom
    "you're worth more than you let yourself feel",
    "hey love, what's sitting on your chest tonight",
    "the cards are loud for you right now",
    # false positives fixed after adversarial review — relationship/life, must KEEP
    "he came back louder than he left",           # the man, not her session
    "he came back again and you let him",
    "you keep coming back to him even when it hurts",
    "you keep coming back to the same fight",
    "you came back to yourself after the breakup",
    "you came back to life once he left",
    "you're back under his spell",
    "you are back in his orbit",
    "you returned to him too soon",
    "since the last time he called you've been quieter",  # about him, keep
])
def test_is_return_acknowledgment_negative(line):
    assert is_return_acknowledgment(line) is False


def test_strip_return_acks_drops_only_matching_queue_and_held():
    plan = DeliveryPlan(
        queue=[
            DeliveryItem("hey hey, welcome back", "send_now"),
            DeliveryItem("something cracked open in you", "send_now"),
            DeliveryItem("what brought you here tonight", "send_now"),
        ],
        hold_back=[HeldItem(text="since we last spoke", hold_trigger="x"),
                   HeldItem(text="he's carrying shame", hold_trigger="y")],
    )
    out, dropped = _strip_return_acks(plan)
    assert [i.message for i in out.queue] == [
        "something cracked open in you", "what brought you here tonight",
    ]
    assert [h.text for h in out.hold_back] == ["he's carrying shame"]
    assert "hey hey, welcome back" in dropped and "since we last spoke" in dropped


def test_process_client_message_strips_return_ack_from_delivery():
    plan = DeliveryPlan(queue=[
        DeliveryItem("hey hey, welcome back", "send_now"),
        DeliveryItem("the cards are loud tonight", "send_now"),
    ])
    sabri = _Sabri([ValentinaRequest(type="micro_read"), plan])
    state = _new_state()
    out = process_client_message(state, "hi", sabri_call=sabri,
                                 valentina_call=lambda _r: "draft", now=T0)
    msgs = [i.message for i in out.queue]
    assert "hey hey, welcome back" not in msgs
    assert "the cards are loud tonight" in msgs


def test_process_client_message_all_acks_falls_back_never_silent():
    # Sabri delivers a plan whose EVERY line is a return-ack; the raw Valentina
    # draft carries a clean line -> fall back to it, never an empty/silent delivery.
    plan = DeliveryPlan(queue=[
        DeliveryItem("welcome back love", "send_now"),
        DeliveryItem("it's been a while", "send_now"),
    ])
    sabri = _Sabri([ValentinaRequest(type="micro_read"), plan])
    state = _new_state()
    raw = "welcome back\nthe deck is already moving for you\nyou're back again"
    out = process_client_message(state, "hi", sabri_call=sabri,
                                 valentina_call=lambda _r: raw, now=T0)
    assert len(out.queue) >= 1                                    # never silent
    assert all(not is_return_acknowledgment(i.message) for i in out.queue)
    assert "the deck is already moving for you" in [i.message for i in out.queue]


def test_llm_failure_yields_fallback_message():
    def sabri(_inp):
        raise LLMCallError("down")

    state = _new_state()
    out = process_client_message(state, "m", sabri_call=sabri,
                                 valentina_call=lambda _r: "x", max_corrections=3, now=T0)
    assert isinstance(out, DeliveryPlan)
    assert out.queue[0].message == FALLBACK_MESSAGE


def test_held_back_buffer_merge_deploys_and_adds():
    delivery = DeliveryPlan(
        queue=[DeliveryItem(message="old line", pacing="send_now")],  # deploys the buffered line
        hold_back=[HeldItem(text="new held", hold_trigger="if Z")],
    )
    sabri = _Sabri([delivery])
    state = _new_state()
    state.held_back_buffer = [HeldItem(text="old line"), HeldItem(text="still held")]
    process_client_message(state, "m", sabri_call=sabri, valentina_call=lambda _r: "x",
                           max_corrections=3, now=T0)
    texts = {h.text for h in state.held_back_buffer}
    assert "old line" not in texts        # deployed -> removed
    assert "still held" in texts          # untouched -> kept
    assert "new held" in texts            # newly held -> added
    assert state.delivery_queue and state.delivery_queue[0].message == "old line"


# ── client-file (dossier) load ───────────────────────────────────────────────
def test_client_file_none_for_new_client_and_text_for_returning(db, make_user):
    from app.services.ai.reading_assistant import build_client_file

    client = make_user(role=Role.USER)
    assert build_client_file(db, client.id) is None  # no history -> no file

    db.add(ClientNote(client_id=client.id, note="cares about her ex", source=NoteSource.HUMAN))
    db.commit()
    text = build_client_file(db, client.id)
    assert text is not None and "ex" in text


# ── schema defaults (unchanged, still valid) ─────────────────────────────────
def test_schema_defaults(db, make_user):
    client = make_user(role=Role.USER)
    psychic = make_user(role=Role.PSYCHIC)
    chat = Chat(user_id=client.id, psychic_id=psychic.id, status=ChatStatus.ACTIVE)
    db.add(chat)
    db.commit()
    db.refresh(chat)
    assert chat.response_mode == ResponseMode.SABRI
    m = Message(chat_id=chat.id, sender_id=client.id, content="hi")
    db.add(m)
    db.commit()
    db.refresh(m)
    assert m.author_type == AuthorType.HUMAN_PSYCHIC
    note = ClientNote(client_id=client.id, note="n")
    db.add(note)
    db.commit()
    db.refresh(note)
    assert note.source == NoteSource.HUMAN


def test_persist_ai_message_tags_ai_drafted(db, make_user):
    client = make_user(role=Role.USER)
    psychic = make_user(role=Role.PSYCHIC)
    chat = Chat(user_id=client.id, psychic_id=psychic.id, status=ChatStatus.ACTIVE)
    db.add(chat)
    db.commit()
    db.refresh(chat)
    msg = persist_ai_message(db, chat, "a delivered line")
    assert msg.author_type == AuthorType.AI_DRAFTED
    assert msg.sender_id == psychic.id


# ── Atlas session-end summary (unchanged, still valid) ───────────────────────
def _chat_with_msgs(db, make_user):
    client = make_user(role=Role.USER)
    psychic = make_user(role=Role.PSYCHIC)
    chat = Chat(user_id=client.id, psychic_id=psychic.id, status=ChatStatus.ACTIVE)
    db.add(chat)
    db.commit()
    db.refresh(chat)
    db.add(Message(chat_id=chat.id, sender_id=client.id, content="will my ex come back?"))
    db.add(Message(chat_id=chat.id, sender_id=psychic.id, content="let's see what the cards reflect"))
    db.commit()
    return chat, client, psychic


def test_atlas_appends_ai_note_without_touching_human_notes(db, make_user, monkeypatch):
    from app.services import client_dossier
    from app.services.ai import client as ai_client

    chat, client, psychic = _chat_with_msgs(db, make_user)
    human = ClientNote(client_id=client.id, note="she is a Cancer", source=NoteSource.HUMAN)
    db.add(human)
    db.commit()

    monkeypatch.setattr(ai_client, "is_configured", lambda: True)
    monkeypatch.setattr(
        ai_client, "run_chat",
        lambda system, user_content, model, max_tokens=512: {
            "text": "She asked about her ex; hopeful tone.", "cost_usd": 0.0,
        },
    )
    note = client_dossier.run_atlas_summary(db, chat.id)
    assert note is not None
    assert note.source == NoteSource.AI_ATLAS and note.author_psychic_id is None
    assert human.note == "she is a Cancer"  # untouched
    dossier = client_dossier.get_client_dossier(db, client.id)
    ai_notes = [n for n in dossier["notes"] if n["source"] == "AI_ATLAS"]
    assert ai_notes and ai_notes[0]["author_name"] == "Atlas (AI)"


def test_atlas_master_switch_off(db, make_user, monkeypatch):
    from app.services import client_dossier

    chat, client, psychic = _chat_with_msgs(db, make_user)

    class _S:
        AI_DRAFTING_ENABLED = False

    monkeypatch.setattr("app.config.get_app_settings", lambda: _S())
    assert client_dossier.run_atlas_summary(db, chat.id) is None
    assert db.query(ClientNote).count() == 0


# ── parsing hardening (review regressions) ───────────────────────────────────
def test_malformed_object_with_inner_array_raises_not_empty_plan():
    # Missing comma between fields — the well-formed inner ["CORE"] array must NOT
    # be mistaken for the payload; it must raise so the caller retries/falls back.
    with pytest.raises(SabriParseError):
        parse_sabri_output('{"action":"valentina_request","instructions":"go" "flags":["CORE"]}')


def test_empty_or_junk_arrays_raise():
    for bad in ('[]', '["foo","bar"]', '{"queue":[]}', '{"action":"deliver","queue":[]}'):
        with pytest.raises(SabriParseError):
            parse_sabri_output(bad)


def test_delivery_array_drops_stray_nonmessage_item():
    # The real Haiku failure: a delivery array whose first element is a stray
    # valentina_request object (no "message" key). It must be DROPPED, never
    # delivered as an empty message; the real messages after it still deliver.
    d = parse_sabri_output(
        '[{"action":"valentina_request","type":"full_reading","instructions":"..."},'
        ' {"message":"hey love","action":"send_now"},'
        ' {"message":"the cards are loud today","action":"pause_short"}]'
    )
    assert isinstance(d, DeliveryPlan)
    assert [i.message for i in d.queue] == ["hey love", "the cards are loud today"]
    assert all(i.message.strip() for i in d.queue)  # no empty bubbles


def test_delivery_drops_blank_message_items():
    d = parse_sabri_output(
        '[{"message":"real one","action":"send_now"},'
        ' {"message":"   ","action":"send_now"},'
        ' {"message":"","action":"pause_short"}]'
    )
    assert [i.message for i in d.queue] == ["real one"]


def test_all_empty_items_collapse_to_error_not_empty_bubble():
    # An all-garbage delivery array must raise (caller retries/falls back), never
    # yield a plan full of blank messages.
    for bad in (
        '[{"message":""},{"message":"   "}]',
        '[{"action":"valentina_request","instructions":"x"}]',
    ):
        with pytest.raises(SabriParseError):
            parse_sabri_output(bad)


def test_hold_back_drops_empty_text():
    d = parse_sabri_output(
        '{"queue":[{"message":"m","action":"send_now"}],'
        ' "hold_back":[{"text":"keep this","hold_trigger":"if X"},{"text":""}]}'
    )
    assert [h.text for h in d.hold_back] == ["keep this"]


def test_hold_back_only_object_parses():
    d = parse_sabri_output('{"hold_back":[{"text":"held line","hold_trigger":"if X"}]}')
    assert isinstance(d, DeliveryPlan)
    assert d.queue == []
    assert len(d.hold_back) == 1 and d.hold_back[0].text == "held line"


def test_all_hold_back_plan_gets_a_fallback_line():
    # Sabri holds everything back (empty queue): the orchestrator must still
    # produce a deliverable line while preserving the held ammo.
    plan = DeliveryPlan(queue=[], hold_back=[HeldItem(text="held", hold_trigger="if X")])
    sabri = _Sabri([plan])
    state = _new_state()
    out = process_client_message(state, "m", sabri_call=sabri,
                                 valentina_call=lambda _r: "x", max_corrections=3, now=T0)
    assert len(out.queue) >= 1                      # a line was added
    assert out.queue[0].message == FALLBACK_MESSAGE
    assert any(h.text == "held" for h in state.held_back_buffer)  # ammo preserved


# ── reply-latency + average-length semantics ─────────────────────────────────
def test_reply_latency_and_avg_length():
    s = create_session_state("lat", now=T0)
    record_client_message(s, "first msg", now=T0 + timedelta(seconds=10))   # 9 chars
    record_sent_message(s, "reader replies now", now=T0 + timedelta(seconds=15))
    # client replies 45s AFTER the reader's message -> latency measured from the send
    record_client_message(s, "x" * 60, now=T0 + timedelta(seconds=60))
    assert s.client_response_times[-1] == 45.0
    meta = compute_metadata(s, now=T0 + timedelta(seconds=90))
    assert meta["client_response_speed"] == "normal"       # 45s in [30,120]
    assert meta["client_avg_response_length"] == "medium"  # (9 + 60) / 2 = 34.5
