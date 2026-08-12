"""Single-agent reveal coordinator: continue/redirect classifier, per-turn input
building, and the mid-reveal continue-vs-redirect behaviour. No real model or DB —
generation/reveal are injected; the classifier heuristic is exercised directly."""

import asyncio
from datetime import datetime

from app.services.ai import reading_reveal
from app.services.ai.reading_session import (
    create_session_state,
    get_session_store,
    record_client_message,
)


def _reset(chat_id):
    """Clear the coordinator's per-chat state + the session store between tests.
    Dropping the lock matters: asyncio locks must not leak across event loops."""
    reading_reveal._active.pop(chat_id, None)
    reading_reveal._pending.pop(chat_id, None)
    reading_reveal._turn_tasks.pop(chat_id, None)
    reading_reveal._locks.pop(chat_id, None)
    get_session_store().delete(f"chat:{chat_id}")


# ── classifier heuristic (pure) ───────────────────────────────────────────────
def test_classify_continuers():
    for m in ["ok", "okay", "k", "yes", "yeah", "mhm", "wow", "im listening",
              "i'm listening", "yes i felt that way", "so true", "makes sense",
              "omg yes", "ok wow", "wow you're good", "got it", "that's me", ""]:
        assert reading_reveal.classify_reply(m) == "continuer", m


def test_classify_redirects():
    assert reading_reveal.classify_reply("is he cheating on me?") == "redirect"
    assert reading_reveal.classify_reply("will he come back to me??") == "redirect"
    assert reading_reveal.classify_reply(
        "so my sister just told me he was seen with his ex last night") == "redirect"


def test_classify_ambiguous_short_non_reaction():
    # short, no '?', not a known reaction -> heuristic defers to the cheap model
    assert reading_reveal.classify_reply("he left") == "ambiguous"
    assert reading_reveal.classify_reply("what about daniel") == "ambiguous"


# ── resolve_classification: heuristic first, model only for ambiguous ──────────
def test_resolve_skips_model_for_clear_cases(monkeypatch):
    called = []
    monkeypatch.setattr(reading_reveal, "_classify_with_model",
                        lambda m: called.append(m) or "redirect")
    assert asyncio.run(reading_reveal.resolve_classification("okay")) == "continuer"
    assert asyncio.run(reading_reveal.resolve_classification("is he cheating?")) == "redirect"
    assert called == []   # heuristic decided both; the model was never called


def test_resolve_uses_model_for_ambiguous(monkeypatch):
    monkeypatch.setattr(reading_reveal, "_classify_with_model", lambda m: "redirect")
    assert asyncio.run(reading_reveal.resolve_classification("he left")) == "redirect"


def test_resolve_ambiguous_model_error_defaults_redirect(monkeypatch):
    def boom(_m):
        raise RuntimeError("haiku down")
    monkeypatch.setattr(reading_reveal, "_classify_with_model", boom)
    # never silently drop a possible question
    assert asyncio.run(reading_reveal.resolve_classification("he left")) == "redirect"


# ── per-turn input building ───────────────────────────────────────────────────
def test_reader_input_excludes_trigger_and_reflects_turn():
    import json

    state = create_session_state("chat:input", chat_id=1, client_id=2)
    record_client_message(state, "hi from last week")                       # earlier context
    record_client_message(state, "my ex daniel wont commit and i need to know why")  # trigger
    trigger = state.chat_transcript[-1]

    ri = reading_reveal._reader_input_for(
        "my ex daniel wont commit and i need to know why", trigger, state,
        client_file="Name: sarah", dob=None, now=datetime(2026, 7, 14, 12, 0, 0),
    )
    # the trigger is the CLIENT MESSAGE and is NOT duplicated into RECENT CONVERSATION
    assert "CLIENT MESSAGE:\nmy ex daniel wont commit and i need to know why" in ri
    assert ri.count("my ex daniel wont commit and i need to know why") == 1
    # the earlier message is still present as context
    assert "hi from last week" in ri
    # metadata reflects the recorded turn (not the empty-state short/silent default)
    meta = json.loads(ri.split("SESSION METADATA:\n", 1)[1].split("\n\n", 1)[0])
    assert meta["client_avg_response_length"] in ("medium", "long")


# ── mid-reveal behaviour: continuer vs redirect ───────────────────────────────
def _fakes(gen_calls, reveal_started, reveal_release):
    async def fake_generate(cid, message, entry, state, user_id, psychic_id=None):
        gen_calls.append(message)
        return ([f"bubble::{message}"], [])

    async def fake_reveal(cid, bubbles, psychic_id, state):
        reveal_started.set()          # generation done, reveal now "playing"
        await reveal_release.wait()   # hold the reveal open until the test releases it
        return bubbles

    async def fake_active(cid):
        return True

    return fake_generate, fake_reveal, fake_active


MSG1 = "my ex daniel keeps going hot and cold and i dont know what it means"


def test_continuer_during_reveal_triggers_no_new_generation(monkeypatch):
    chat_id = 70001
    _reset(chat_id)
    gen_calls = []

    async def scenario():
        reveal_started, reveal_release = asyncio.Event(), asyncio.Event()
        g, r, a = _fakes(gen_calls, reveal_started, reveal_release)
        monkeypatch.setattr(reading_reveal, "_generate_turn", g)
        monkeypatch.setattr(reading_reveal, "_reveal_turn", r)
        monkeypatch.setattr(reading_reveal, "_chat_active", a)

        await reading_reveal.handle_client_message(chat_id, MSG1, psychic_id=1, user_id=2)
        task = reading_reveal._turn_tasks[chat_id]
        await asyncio.wait_for(reveal_started.wait(), 2)      # turn 1 is mid-reveal

        # a CONTINUER lands while the reveal is playing
        await reading_reveal.handle_client_message(chat_id, "okay", psychic_id=1, user_id=2)
        assert gen_calls == [MSG1]                            # NO new Reader call
        assert reading_reveal._pending.get(chat_id) is None   # nothing queued

        reveal_release.set()
        await asyncio.wait_for(task, 2)
        return gen_calls

    assert asyncio.run(scenario()) == [MSG1]                  # still only one generation


def test_redirect_during_reveal_queues_new_turn_after_current(monkeypatch):
    chat_id = 70002
    _reset(chat_id)
    gen_calls = []
    redirect = "wait but what does my career look like this year?"

    async def scenario():
        reveal_started, reveal_release = asyncio.Event(), asyncio.Event()
        g, r, a = _fakes(gen_calls, reveal_started, reveal_release)
        monkeypatch.setattr(reading_reveal, "_generate_turn", g)
        monkeypatch.setattr(reading_reveal, "_reveal_turn", r)
        monkeypatch.setattr(reading_reveal, "_chat_active", a)

        await reading_reveal.handle_client_message(chat_id, MSG1, psychic_id=1, user_id=2)
        task = reading_reveal._turn_tasks[chat_id]
        await asyncio.wait_for(reveal_started.wait(), 2)      # turn 1 is mid-reveal

        # a REDIRECT lands while the reveal is playing
        await reading_reveal.handle_client_message(chat_id, redirect, psychic_id=1, user_id=2)
        assert gen_calls == [MSG1]                            # current reveal NOT interrupted
        assert reading_reveal._pending.get(chat_id) is not None   # queued for after

        reveal_release.set()                                  # let turn 1 finish
        await asyncio.wait_for(task, 2)                       # turn loop then runs the redirect
        return gen_calls

    # the redirect generated a fresh turn, AFTER the first reveal completed, in order
    assert asyncio.run(scenario()) == [MSG1, redirect]


def test_typing_shown_before_and_through_generation(monkeypatch):
    """No dead silence: the typing indicator is turned ON before generation starts
    (and held through it), then cleared at the end."""
    from app.services.ai import reading_executor

    chat_id = 70003
    _reset(chat_id)
    order = []

    async def rec_typing(cid, on, sid):
        order.append(("typing", on))

    async def fake_generate(cid, message, entry, state, user_id, psychic_id=None):
        order.append(("generate", message))
        return (["b1"], [])

    async def fake_reveal(cid, bubbles, psychic_id, state):
        order.append(("reveal", None))
        return bubbles

    async def fake_active(cid):
        return True

    monkeypatch.setattr(reading_executor, "broadcast_typing", rec_typing)
    monkeypatch.setattr(reading_reveal, "_generate_turn", fake_generate)
    monkeypatch.setattr(reading_reveal, "_reveal_turn", fake_reveal)
    monkeypatch.setattr(reading_reveal, "_chat_active", fake_active)

    async def scenario():
        await reading_reveal.handle_client_message(chat_id, "will he come back?", psychic_id=1, user_id=2)
        await asyncio.wait_for(reading_reveal._turn_tasks[chat_id], 3)

    asyncio.run(scenario())
    assert order[0] == ("typing", True)                 # dots ON before anything else
    assert order[1] == ("generate", "will he come back?")  # ...and generation runs with dots on
    assert order[-1] == ("typing", False)               # cleared at the end
