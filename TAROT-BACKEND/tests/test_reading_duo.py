"""Two-role coordinator (Valentina writes / Sabri delivers): the NEW-vs-CONTINUE router, the
decision to call Valentina vs work from reserve, the reserve hold-and-release across turns, and
mid-reveal continue/redirect handling. No real model or DB — the generate/reveal seams are injected."""

import asyncio
from datetime import date

from app.services.ai import reading_duo
from app.services.ai import reading_valentina
from app.services.ai.reading_session import get_session_store


def _reset(chat_id):
    reading_duo._active.pop(chat_id, None)
    reading_duo._pending.pop(chat_id, None)
    reading_duo._turn_tasks.pop(chat_id, None)
    reading_duo._locks.pop(chat_id, None)
    get_session_store().delete(f"chat:{chat_id}")


# ── router: the source is chosen against the reserve, not the wording ─────────
def test_resolve_route_without_reserve():
    """Nothing banked: a real question needs Valentina, a reaction still does not."""
    assert asyncio.run(reading_duo._resolve_route("will he come back to me?")) == "new"
    assert asyncio.run(reading_duo._resolve_route(
        "so my sister told me he was seen with his ex last night")) == "new"
    # A bare reaction must never trigger a fresh reading, reserve or no reserve —
    # a sixty-second Valentina call in reply to "okay" is worse than any wait.
    assert asyncio.run(reading_duo._resolve_route("okay")) == "continue"
    assert asyncio.run(reading_duo._resolve_route("wow youre good")) == "continue"
    assert asyncio.run(reading_duo._resolve_route("okay", "held material")) == "continue"


def test_follow_ups_reach_the_reserve_instead_of_valentina(monkeypatch):
    """The regression this router exists for.

    Measured in production, every one of these cost a fresh 40-60 second Valentina
    call while 1,500-4,600 characters of reading sat held and unused, because the old
    rule treated any question mark as a new topic.
    """
    asked = []

    def _held(message, held):
        asked.append((message, held))
        return "continue"

    monkeypatch.setattr(reading_duo, "_ask_reserve_router", _held)
    for follow_up in ("say more", "what do you mean by that",
                      "i dont understand", "can you explain that last bit"):
        assert asyncio.run(
            reading_duo._resolve_route(follow_up, "HELD: the rest of her reading")
        ) == "continue", follow_up
    assert len(asked) == 4
    assert all(held == "HELD: the rest of her reading" for _, held in asked)


def test_a_new_subject_still_costs_a_fresh_reading(monkeypatch):
    """The router must not answer a new topic out of stale reserve."""
    monkeypatch.setattr(reading_duo, "_ask_reserve_router", lambda m, h: "new")
    assert asyncio.run(
        reading_duo._resolve_route("what about my job", "HELD: about her ex")
    ) == "new"


def test_router_failure_falls_back_to_a_fresh_reading(monkeypatch):
    """On any error, write rather than risk answering from material that cannot."""
    def _boom(message, held):
        raise RuntimeError("classifier down")

    monkeypatch.setattr(reading_duo, "_ask_reserve_router", _boom)
    assert asyncio.run(
        reading_duo._resolve_route("say more", "HELD: something")
    ) == "new"


def test_valentina_receives_verified_numerology_or_explicit_not_available_signal():
    present = reading_valentina.build_valentina_input(
        client_message="Synthetic question",
        session_memory="",
        client_file="Synthetic client",
        session_metadata={},
        date_of_birth=date(2002, 12, 1),
        current_year=2026,
    )
    assert "Zodiac sign: Sagittarius" in present
    assert "Life Path: 8" in present
    assert "Personal Year (2026): 5" in present

    absent = reading_valentina.build_valentina_input(
        client_message="Synthetic question",
        session_memory="",
        client_file="Synthetic client",
        session_metadata={},
        date_of_birth=None,
        current_year=2026,
    )
    # The block is now ALWAYS emitted, even with no date of birth, because it also carries
    # her gender — and an omitted line is what the reader fills in with a guess.
    assert "KNOWN NUMEROLOGY" in absent
    assert "Zodiac sign" not in absent          # nothing is invented when there is no DOB
    assert "Life Path:" not in absent
    assert "Client's gender: NOT STATED" in absent
    assert "client value not supplied as verified system data is explicitly NOT AVAILABLE" in reading_valentina.VALENTINA_SYSTEM_PROMPT
    assert "This restriction applies only to the client" in reading_valentina.VALENTINA_SYSTEM_PROMPT
    assert "For any OTHER person" in reading_valentina.VALENTINA_SYSTEM_PROMPT
    assert "calculate and discuss their numerology and astrology normally" in reading_valentina.VALENTINA_SYSTEM_PROMPT


# ── decision: NEW calls Valentina; CONTINUE works from reserve (no Valentina) ─
def test_new_turn_calls_valentina_continue_does_not(monkeypatch):
    from app.services.ai.reading_session import create_session_state

    val_calls, sabri_calls = [], []

    async def fake_valentina(chat_id, message, entry, state, user_id, psychic_id=None, gender=None):
        val_calls.append(message)
        return f"VALENTINA_PROSE::{message}"

    async def fake_sabri(chat_id, message, entry, state, source_content, waited_seconds=None, earlier_messages=(), verified_facts=""):
        sabri_calls.append({"source": source_content})
        return [f"b::{message}"]

    monkeypatch.setattr(reading_duo, "_write_valentina_turn", fake_valentina)
    monkeypatch.setattr(reading_duo, "_sabri_turn", fake_sabri)

    # NEW route → Valentina called, Sabri fed her fresh prose
    monkeypatch.setattr(reading_duo, "_resolve_route", lambda m, r="": _coro("new"))
    st = create_session_state("chat:x", chat_id=1)
    st.reserve = "OLD_RESERVE"
    b, reserve, route = asyncio.run(reading_duo._duo_generate(1, "will he come back?", None, st, 2))
    assert route == "new"
    assert val_calls == ["will he come back?"]
    # Sabri is handed the accumulation: what was already unsaid, plus her new writing.
    assert sabri_calls[-1] == {
        "source": "OLD_RESERVE\n\nVALENTINA_PROSE::will he come back?"
    }
    assert reserve == "OLD_RESERVE\n\nVALENTINA_PROSE::will he come back?"

    # CONTINUE route → Valentina NOT called again, Sabri fed the held reserve
    monkeypatch.setattr(reading_duo, "_resolve_route", lambda m, r="": _coro("continue"))
    st.reserve = "HELD_RESERVE_TEXT"
    b, reserve, route = asyncio.run(reading_duo._duo_generate(1, "wow", None, st, 2))
    assert route == "continue"
    assert val_calls == ["will he come back?"]                       # unchanged — no 2nd Valentina
    assert sabri_calls[-1] == {"source": "HELD_RESERVE_TEXT"}


async def _coro(v):
    return v


# ── fix: forced_route overrides re-classification for a dequeued redirect ──────
def test_forced_route_bypasses_classifier(monkeypatch):
    from app.services.ai.reading_session import create_session_state

    val_calls = []

    async def fake_valentina(chat_id, message, entry, state, user_id, psychic_id=None, gender=None):
        val_calls.append(message)
        return f"VALENTINA::{message}"

    async def fake_sabri(chat_id, message, entry, state, source_content, waited_seconds=None, earlier_messages=(), verified_facts=""):
        return [f"b::{message}"]

    # the classifier would say "continue" — forced_route="new" must win (no flip to stale reserve)
    monkeypatch.setattr(reading_duo, "_resolve_route", lambda m, r="": _coro("continue"))
    monkeypatch.setattr(reading_duo, "_write_valentina_turn", fake_valentina)
    monkeypatch.setattr(reading_duo, "_sabri_turn", fake_sabri)

    st = create_session_state("chat:fr", chat_id=1)
    _b, _r, route = asyncio.run(
        reading_duo._duo_generate(1, "he left", None, st, 2, forced_route="new"))
    assert route == "new"
    assert val_calls == ["he left"]        # Valentina called despite classifier saying continue


# ── fix: a failed Valentina write delivers a fallback and keeps prior reserve ──
def test_valentina_failure_delivers_fallback_keeps_reserve(monkeypatch):
    from app.services.ai.reading_llm import FALLBACK_MESSAGE
    from app.services.ai.reading_session import create_session_state

    async def failed_valentina(chat_id, message, entry, state, user_id, psychic_id=None, gender=None):
        return ""                           # write_valentina returns "" on SDK error

    called = []

    async def fake_sabri(chat_id, message, entry, state, source_content, is_new):
        called.append(True)
        return (["should not run"], "")

    monkeypatch.setattr(reading_duo, "_resolve_route", lambda m, r="": _coro("new"))
    monkeypatch.setattr(reading_duo, "_write_valentina_turn", failed_valentina)
    monkeypatch.setattr(reading_duo, "_sabri_turn", fake_sabri)

    st = create_session_state("chat:vf", chat_id=1)
    st.reserve = "PRIOR_RESERVE"
    bubbles, reserve, route = asyncio.run(reading_duo._duo_generate(1, "will he come back?", None, st, 2))
    assert bubbles == [FALLBACK_MESSAGE]     # never dead silence
    assert reserve == "PRIOR_RESERVE"        # prior reserve preserved (not wiped)
    assert called == []                      # Sabri never called with empty content


# ── reserve hold-and-release across turns (through the coordinator) ───────────
def _install_fakes(monkeypatch, routes, sabri_returns, sabri_seen):
    """Fakes that drive the turn loop: route per-turn from `routes`, Sabri returns per-turn from
    `sabri_returns` and records the source it was handed into `sabri_seen`. Reveal is a no-op."""
    r = {"i": 0}

    async def fake_generate(
        chat_id, message, entry, state, user_id, forced_route=None, *, psychic_id=None,
        waited_seconds=None,
    ):
        # Mirrors the real _duo_generate: a NEW turn ADDS her writing to whatever is still
        # unsaid, a CONTINUE turn hands over the same pile unchanged. Sending never shrinks
        # it, so the fake returns the accumulation, not whatever Sabri happened to echo.
        route = forced_route or routes[r["i"]]
        held = state.reserve or ""
        reserve = (
            reading_duo.accumulate_reserve(held, f"VALENTINA::{message}")
            if route == "new" else held
        )
        sabri_seen.append({"route": route, "source": reserve})
        bubbles = sabri_returns[r["i"]]
        r["i"] += 1
        return bubbles, reserve, route

    async def fake_reveal(chat_id, bubbles, psychic_id, state):
        return bubbles

    async def fake_active(chat_id):
        return True

    monkeypatch.setattr(reading_duo, "_duo_generate", fake_generate)
    monkeypatch.setattr(reading_duo, "_reveal_turn_duo", fake_reveal)
    monkeypatch.setattr(reading_duo, "_chat_active", fake_active)
    monkeypatch.setattr(reading_duo, "_reading_pause_s", lambda: 0.0)   # no real 2s sleep in tests


def test_reserve_set_on_new_then_released_on_continue(monkeypatch):
    chat_id = 80001
    _reset(chat_id)
    sabri_seen = []
    # turn 1: NEW → her writing is banked ; turn 2: CONTINUE → Sabri is fed the same pile
    routes = ["new", "continue"]
    sabri_returns = [["b1"], ["b2"]]

    async def scenario():
        _install_fakes(monkeypatch, routes, sabri_returns, sabri_seen)
        store = get_session_store()

        await reading_duo.handle_client_message(chat_id, "will he come back?", psychic_id=1, user_id=2)
        await asyncio.wait_for(reading_duo._turn_tasks[chat_id], 2)
        assert store.get(f"chat:{chat_id}").reserve == "VALENTINA::will he come back?"

        await reading_duo.handle_client_message(chat_id, "wow", psychic_id=1, user_id=2)
        await asyncio.wait_for(reading_duo._turn_tasks[chat_id], 2)
        return store.get(f"chat:{chat_id}").reserve

    final_reserve = asyncio.run(scenario())
    # The CONTINUE turn works from the same unsent pile, and sending does not consume it:
    # Sabri simply never repeats what the capsule shows she has already read.
    assert sabri_seen[1] == {"route": "continue", "source": "VALENTINA::will he come back?"}
    assert final_reserve == "VALENTINA::will he come back?"


def test_new_turn_adds_to_the_reserve_and_never_burns_it(monkeypatch):
    """The TODO at reading_duo.py:341-344, resolved.

    A second NEW turn used to REPLACE the reserve, so everything Valentina wrote on turn one
    and Sabri had not yet said was generated, paid for and deleted — around ninety percent of
    every reading. It accumulates now, oldest first."""
    chat_id = 80002
    _reset(chat_id)
    sabri_seen = []
    routes = ["new", "new"]
    sabri_returns = [["b1"], ["b2"]]

    async def scenario():
        _install_fakes(monkeypatch, routes, sabri_returns, sabri_seen)
        store = get_session_store()
        await reading_duo.handle_client_message(chat_id, "will he come back?", psychic_id=1, user_id=2)
        await asyncio.wait_for(reading_duo._turn_tasks[chat_id], 2)
        await reading_duo.handle_client_message(chat_id, "what about my career this year?", psychic_id=1, user_id=2)
        await asyncio.wait_for(reading_duo._turn_tasks[chat_id], 2)
        return store.get(f"chat:{chat_id}").reserve

    final = asyncio.run(scenario())
    assert sabri_seen[1]["route"] == "new"
    # Turn 2 sees BOTH readings — turn one's unsaid writing is still there, in order.
    both = "VALENTINA::will he come back?\n\nVALENTINA::what about my career this year?"
    assert sabri_seen[1]["source"] == both
    assert final == both


def test_continue_glue_reply_keeps_prior_reserve(monkeypatch):
    # A CONTINUE turn where Sabri just says "mm tell me more" must not cost the session the
    # writing it is still holding. The old guard tried to infer this from whether he echoed
    # anything and could not tell a drained reserve from a glue reply; nothing is inferred now.
    chat_id = 80006
    _reset(chat_id)
    sabri_seen = []
    routes = ["new", "continue"]
    sabri_returns = [["b1"], ["mm tell me more"]]

    async def scenario():
        _install_fakes(monkeypatch, routes, sabri_returns, sabri_seen)
        store = get_session_store()
        await reading_duo.handle_client_message(chat_id, "will he come back?", psychic_id=1, user_id=2)
        await asyncio.wait_for(reading_duo._turn_tasks[chat_id], 2)
        assert store.get(f"chat:{chat_id}").reserve == "VALENTINA::will he come back?"
        await reading_duo.handle_client_message(chat_id, "wow ok", psychic_id=1, user_id=2)
        await asyncio.wait_for(reading_duo._turn_tasks[chat_id], 2)
        return store.get(f"chat:{chat_id}").reserve

    assert asyncio.run(scenario()) == "VALENTINA::will he come back?"   # NOT wiped


# ── mid-reveal: continuer ignored, redirect queued after the current reveal ──
def _midreveal_fakes(gen_calls, started, release):
    async def fake_generate(
        chat_id, message, entry, state, user_id, forced_route=None, *, psychic_id=None
    ):
        gen_calls.append(message)
        return ([f"b::{message}"], "RES", "new")

    async def fake_reveal(chat_id, bubbles, psychic_id, state):
        started.set()
        await release.wait()
        return bubbles

    async def fake_active(chat_id):
        return True

    return fake_generate, fake_reveal, fake_active


def test_redirect_midreveal_runs_after_current(monkeypatch):
    chat_id = 80003
    _reset(chat_id)
    gen_calls = []
    MSG1 = "my ex daniel keeps going hot and cold and i dont know what it means"
    redirect = "wait but what does my career look like this year?"

    async def scenario():
        started, release = asyncio.Event(), asyncio.Event()
        g, r, a = _midreveal_fakes(gen_calls, started, release)
        monkeypatch.setattr(reading_duo, "_duo_generate", g)
        monkeypatch.setattr(reading_duo, "_reveal_turn_duo", r)
        monkeypatch.setattr(reading_duo, "_chat_active", a)
        monkeypatch.setattr(reading_duo, "_reading_pause_s", lambda: 0.0)

        await reading_duo.handle_client_message(chat_id, MSG1, psychic_id=1, user_id=2)
        task = reading_duo._turn_tasks[chat_id]
        await asyncio.wait_for(started.wait(), 2)                 # turn 1 mid-reveal

        await reading_duo.handle_client_message(chat_id, redirect, psychic_id=1, user_id=2)
        assert gen_calls == [MSG1]                                # current reveal not interrupted
        assert reading_duo._pending.get(chat_id) is not None      # redirect queued

        release.set()
        await asyncio.wait_for(task, 2)
        return gen_calls

    assert asyncio.run(scenario()) == [MSG1, redirect]            # redirect ran, in order


def test_continuer_midreveal_no_new_generation(monkeypatch):
    chat_id = 80004
    _reset(chat_id)
    gen_calls = []
    MSG1 = "my ex daniel keeps going hot and cold and i dont know what it means"

    async def scenario():
        started, release = asyncio.Event(), asyncio.Event()
        g, r, a = _midreveal_fakes(gen_calls, started, release)
        monkeypatch.setattr(reading_duo, "_duo_generate", g)
        monkeypatch.setattr(reading_duo, "_reveal_turn_duo", r)
        monkeypatch.setattr(reading_duo, "_chat_active", a)
        monkeypatch.setattr(reading_duo, "_reading_pause_s", lambda: 0.0)

        await reading_duo.handle_client_message(chat_id, MSG1, psychic_id=1, user_id=2)
        task = reading_duo._turn_tasks[chat_id]
        await asyncio.wait_for(started.wait(), 2)
        await reading_duo.handle_client_message(chat_id, "okay", psychic_id=1, user_id=2)
        assert gen_calls == [MSG1]                                # continuer → no new turn
        assert reading_duo._pending.get(chat_id) is None
        release.set()
        await asyncio.wait_for(task, 2)
        return gen_calls

    assert asyncio.run(scenario()) == [MSG1]


def test_reading_pause_reads_config():
    # This dead coordinator keeps only the base beat; the real length-aware read pause is
    # reading_burst.read_pause_ms and is tested in test_reading_client_clock.py.
    from app.config import get_app_settings
    assert reading_duo._reading_pause_s() == get_app_settings().READ_PAUSE_BASE_MS / 1000.0
    assert reading_duo._reading_pause_s() == 1.5


# ── typing shown before + through generation (no dead silence) ────────────────
def test_typing_shown_before_and_through_generation(monkeypatch):
    from app.services.ai import reading_executor

    chat_id = 80005
    _reset(chat_id)
    order = []

    async def rec_typing(cid, on, sid):
        order.append(("typing", on))

    async def fake_generate(
        cid, message, entry, state, user_id, forced_route=None, *, psychic_id=None
    ):
        order.append(("generate", message))
        return (["b1"], "RES", "new")

    async def fake_reveal(cid, bubbles, psychic_id, state):
        order.append(("reveal", None))
        return bubbles

    async def fake_active(cid):
        return True

    monkeypatch.setattr(reading_executor, "broadcast_typing", rec_typing)
    monkeypatch.setattr(reading_duo, "_duo_generate", fake_generate)
    monkeypatch.setattr(reading_duo, "_reveal_turn_duo", fake_reveal)
    monkeypatch.setattr(reading_duo, "_chat_active", fake_active)
    monkeypatch.setattr(reading_duo, "_reading_pause_s", lambda: 0.0)

    async def scenario():
        await reading_duo.handle_client_message(chat_id, "will he come back?", psychic_id=1, user_id=2)
        await asyncio.wait_for(reading_duo._turn_tasks[chat_id], 3)

    asyncio.run(scenario())
    # Reading beat FIRST (dots HIDDEN), THEN dots on and held continuously through generation +
    # reveal, then cleared. The only intentional silence is the initial reading gap.
    assert order == [
        ("typing", False),                       # reading beat — dots hidden the moment it arrives
        ("typing", True),                        # ...then dots turn on
        ("generate", "will he come back?"),      # ...and stay on through the (invisible) generation
        ("reveal", None),                        # ...and into the reveal
        ("typing", False),                       # cleared at the end
    ]
