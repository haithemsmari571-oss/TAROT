"""Two-role coordinator (Valentina writes / Sabri delivers): the NEW-vs-CONTINUE router, the
decision to call Valentina vs work from reserve, the reserve hold-and-release across turns, and
mid-reveal continue/redirect handling. No real model or DB — the generate/reveal seams are injected."""

import asyncio

from app.services.ai import reading_duo
from app.services.ai.reading_session import get_session_store


def _reset(chat_id):
    reading_duo._active.pop(chat_id, None)
    reading_duo._pending.pop(chat_id, None)
    reading_duo._turn_tasks.pop(chat_id, None)
    reading_duo._locks.pop(chat_id, None)
    get_session_store().delete(f"chat:{chat_id}")


# ── router: redirect→new, continuer→continue (pure heuristic on clear cases) ──
def test_resolve_route():
    assert asyncio.run(reading_duo._resolve_route("will he come back to me?")) == "new"
    assert asyncio.run(reading_duo._resolve_route(
        "so my sister told me he was seen with his ex last night")) == "new"
    assert asyncio.run(reading_duo._resolve_route("okay")) == "continue"
    assert asyncio.run(reading_duo._resolve_route("wow youre good")) == "continue"


# ── decision: NEW calls Valentina; CONTINUE works from reserve (no Valentina) ─
def test_new_turn_calls_valentina_continue_does_not(monkeypatch):
    from app.services.ai.reading_session import create_session_state

    val_calls, sabri_calls = [], []

    async def fake_valentina(chat_id, message, entry, state, user_id):
        val_calls.append(message)
        return f"VALENTINA_PROSE::{message}"

    async def fake_sabri(chat_id, message, entry, state, source_content, is_new):
        sabri_calls.append({"source": source_content, "is_new": is_new})
        return ([f"b::{message}"], f"RESERVE::{message}")

    monkeypatch.setattr(reading_duo, "_write_valentina_turn", fake_valentina)
    monkeypatch.setattr(reading_duo, "_sabri_turn", fake_sabri)

    # NEW route → Valentina called, Sabri fed her fresh prose
    monkeypatch.setattr(reading_duo, "_resolve_route", lambda m: _coro("new"))
    st = create_session_state("chat:x", chat_id=1)
    st.reserve = "OLD_RESERVE"
    b, reserve, route = asyncio.run(reading_duo._duo_generate(1, "will he come back?", None, st, 2))
    assert route == "new"
    assert val_calls == ["will he come back?"]
    assert sabri_calls[-1] == {"source": "VALENTINA_PROSE::will he come back?", "is_new": True}

    # CONTINUE route → Valentina NOT called again, Sabri fed the held reserve
    monkeypatch.setattr(reading_duo, "_resolve_route", lambda m: _coro("continue"))
    st.reserve = "HELD_RESERVE_TEXT"
    b, reserve, route = asyncio.run(reading_duo._duo_generate(1, "wow", None, st, 2))
    assert route == "continue"
    assert val_calls == ["will he come back?"]                       # unchanged — no 2nd Valentina
    assert sabri_calls[-1] == {"source": "HELD_RESERVE_TEXT", "is_new": False}


async def _coro(v):
    return v


# ── fix: forced_route overrides re-classification for a dequeued redirect ──────
def test_forced_route_bypasses_classifier(monkeypatch):
    from app.services.ai.reading_session import create_session_state

    val_calls = []

    async def fake_valentina(chat_id, message, entry, state, user_id):
        val_calls.append(message)
        return f"VALENTINA::{message}"

    async def fake_sabri(chat_id, message, entry, state, source_content, is_new):
        return ([f"b::{message}"], "R")

    # the classifier would say "continue" — forced_route="new" must win (no flip to stale reserve)
    monkeypatch.setattr(reading_duo, "_resolve_route", lambda m: _coro("continue"))
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

    async def failed_valentina(chat_id, message, entry, state, user_id):
        return ""                           # write_valentina returns "" on SDK error

    called = []

    async def fake_sabri(chat_id, message, entry, state, source_content, is_new):
        called.append(True)
        return (["should not run"], "")

    monkeypatch.setattr(reading_duo, "_resolve_route", lambda m: _coro("new"))
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

    async def fake_generate(chat_id, message, entry, state, user_id, forced_route=None):
        route = forced_route or routes[r["i"]]
        if route == "new":
            src = f"VALENTINA::{message}"
        else:
            src = state.reserve or ""
        sabri_seen.append({"route": route, "source": src})
        bubbles, reserve = sabri_returns[r["i"]]
        r["i"] += 1
        return bubbles, reserve, route

    async def fake_reveal(chat_id, bubbles, psychic_id, state):
        return bubbles

    async def fake_active(chat_id):
        return True

    monkeypatch.setattr(reading_duo, "_duo_generate", fake_generate)
    monkeypatch.setattr(reading_duo, "_reveal_turn_duo", fake_reveal)
    monkeypatch.setattr(reading_duo, "_chat_active", fake_active)


def test_reserve_set_on_new_then_released_on_continue(monkeypatch):
    chat_id = 80001
    _reset(chat_id)
    sabri_seen = []
    # turn 1: NEW → reserve R1 ; turn 2: CONTINUE → Sabri fed R1, returns smaller R2
    routes = ["new", "continue"]
    sabri_returns = [(["b1"], "RESERVE_1"), (["b2"], "RESERVE_2")]

    async def scenario():
        _install_fakes(monkeypatch, routes, sabri_returns, sabri_seen)
        store = get_session_store()

        await reading_duo.handle_client_message(chat_id, "will he come back?", psychic_id=1, user_id=2)
        await asyncio.wait_for(reading_duo._turn_tasks[chat_id], 2)
        assert store.get(f"chat:{chat_id}").reserve == "RESERVE_1"        # NEW set the reserve

        await reading_duo.handle_client_message(chat_id, "wow", psychic_id=1, user_id=2)
        await asyncio.wait_for(reading_duo._turn_tasks[chat_id], 2)
        return store.get(f"chat:{chat_id}").reserve

    final_reserve = asyncio.run(scenario())
    assert sabri_seen[1] == {"route": "continue", "source": "RESERVE_1"}  # CONTINUE released from R1
    assert final_reserve == "RESERVE_2"                                   # reserve shrank


def test_new_turn_replaces_stale_reserve(monkeypatch):
    chat_id = 80002
    _reset(chat_id)
    sabri_seen = []
    # turn 1: NEW → R1 ; turn 2: NEW (redirect) → Sabri fed FRESH Valentina (not R1), replaces reserve
    routes = ["new", "new"]
    sabri_returns = [(["b1"], "RESERVE_1"), (["b2"], "RESERVE_FRESH")]

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
    assert sabri_seen[1]["source"] == "VALENTINA::what about my career this year?"  # fresh, not R1
    assert final == "RESERVE_FRESH"                                                 # old reserve dropped


def test_continue_glue_reply_keeps_prior_reserve(monkeypatch):
    # Review finding (high): a CONTINUE turn where Sabri gives a glue reply and echoes NO reserve
    # must NOT wipe the banked content. Prior reserve is retained when a turn releases nothing.
    chat_id = 80006
    _reset(chat_id)
    sabri_seen = []
    routes = ["new", "continue"]
    sabri_returns = [(["b1"], "BANKED_RESERVE"), (["mm tell me more"], "")]  # T2 glue reply, empty reserve

    async def scenario():
        _install_fakes(monkeypatch, routes, sabri_returns, sabri_seen)
        store = get_session_store()
        await reading_duo.handle_client_message(chat_id, "will he come back?", psychic_id=1, user_id=2)
        await asyncio.wait_for(reading_duo._turn_tasks[chat_id], 2)
        assert store.get(f"chat:{chat_id}").reserve == "BANKED_RESERVE"
        await reading_duo.handle_client_message(chat_id, "wow ok", psychic_id=1, user_id=2)
        await asyncio.wait_for(reading_duo._turn_tasks[chat_id], 2)
        return store.get(f"chat:{chat_id}").reserve

    assert asyncio.run(scenario()) == "BANKED_RESERVE"     # NOT wiped by the empty-reserve glue turn


# ── mid-reveal: continuer ignored, redirect queued after the current reveal ──
def _midreveal_fakes(gen_calls, started, release):
    async def fake_generate(chat_id, message, entry, state, user_id, forced_route=None):
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


# ── typing shown before + through generation (no dead silence) ────────────────
def test_typing_shown_before_and_through_generation(monkeypatch):
    from app.services.ai import reading_executor

    chat_id = 80005
    _reset(chat_id)
    order = []

    async def rec_typing(cid, on, sid):
        order.append(("typing", on))

    async def fake_generate(cid, message, entry, state, user_id, forced_route=None):
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

    async def scenario():
        await reading_duo.handle_client_message(chat_id, "will he come back?", psychic_id=1, user_id=2)
        await asyncio.wait_for(reading_duo._turn_tasks[chat_id], 3)

    asyncio.run(scenario())
    assert order[0] == ("typing", True)                     # dots ON before anything
    assert order[1] == ("generate", "will he come back?")   # ...held through generation
    assert order[-1] == ("typing", False)                   # cleared at the end
