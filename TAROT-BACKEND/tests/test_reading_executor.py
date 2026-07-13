"""Tests for the delivery execution engine — fake clock, recording send, no real timing."""

import asyncio

import pytest

from app.services.ai import reading_executor as ex
from app.services.ai.reading_contracts import DeliveryItem
from app.services.ai.reading_executor import (
    COMPLETED,
    WAITING,
    PacingConfig,
    compute_typing_duration,
    execute_delivery,
    gap_after,
)
from app.services.ai.reading_session import create_session_state

CFG = PacingConfig()  # defaults
LOW = lambda a, b: a  # deterministic rng -> always the low bound  # noqa: E731


class _Rec:
    def __init__(self, fail_on=None):
        self.sent = []
        self.typing_log = []
        self.sleeps = []
        self._fail_on = fail_on  # 1-indexed send call to raise on

    async def send(self, item):
        if self._fail_on is not None and len(self.sent) + 1 == self._fail_on:
            raise RuntimeError("send interrupted")
        self.sent.append(item.message)

    async def typing(self, on):
        self.typing_log.append(on)

    async def sleep(self, secs):
        self.sleeps.append(round(secs, 3))


def _state(items):
    s = create_session_state("t", chat_id=1)
    s.delivery_queue = items
    s.queue_position = 0
    return s


def _run(state, rec, rng=LOW):
    return asyncio.run(
        execute_delivery(state, send_fn=rec.send, typing_fn=rec.typing,
                         sleep_fn=rec.sleep, rng=rng, config=CFG)
    )


# ── typing duration ──────────────────────────────────────────────────────────
def test_typing_duration_explicit_is_clamped():
    assert compute_typing_duration("x", 999999, config=CFG) == CFG.typing_max_ms
    assert compute_typing_duration("x", 10, config=CFG) == CFG.typing_min_ms


def test_typing_duration_calculated_and_clamped():
    # short message -> below the floor -> clamped up to typing_min_ms
    assert compute_typing_duration("ab", rng=lambda a, b: 0.0, config=CFG) == CFG.typing_min_ms
    # 200 chars * 35 = 7000, no variance -> 7000 (within range)
    assert compute_typing_duration("x" * 200, rng=lambda a, b: 0.0, config=CFG) == 7000
    # huge message clamps to the ceiling
    assert compute_typing_duration("x" * 1000, rng=lambda a, b: 0.0, config=CFG) == CFG.typing_max_ms
    # variance bounds: -0.2 -> base*0.8, +0.3 -> base*1.3
    assert compute_typing_duration("x" * 200, rng=lambda a, b: -0.2, config=CFG) == 5600
    assert compute_typing_duration("x" * 200, rng=lambda a, b: 0.3, config=CFG) == 9100


def test_gap_after_by_pacing():
    assert gap_after("send_now", rng=LOW, config=CFG) == CFG.send_now_gap_ms
    assert gap_after("pause_short", rng=LOW, config=CFG) == CFG.pause_short_min_ms
    assert gap_after("pause_long", rng=LOW, config=CFG) == CFG.pause_long_min_ms
    assert gap_after("weird", rng=LOW, config=CFG) == CFG.send_now_gap_ms


# ── the delivery loop ────────────────────────────────────────────────────────
def test_all_send_now_plays_in_order_with_gaps():
    state = _state([DeliveryItem("aa", "send_now"), DeliveryItem("bb", "send_now")])
    rec = _Rec()
    result = _run(state, rec)
    assert result == COMPLETED
    assert rec.sent == ["aa", "bb"]
    assert rec.typing_log == [True, False, True, False]
    # short msgs clamp to 1.5s typing; send_now gap 0.4s
    assert rec.sleeps == [1.5, 0.4, 1.5, 0.4]
    assert state.queue_position == 2


def test_pause_long_uses_long_gap():
    state = _state([DeliveryItem("aa", "pause_long"), DeliveryItem("bb", "send_now")])
    rec = _Rec()
    _run(state, rec)
    # after "aa": pause_long gap -> 6.0s (min with LOW rng)
    assert 6.0 in rec.sleeps


def test_wait_for_response_stops_and_resumes():
    items = [DeliveryItem("A", "send_now"), DeliveryItem("B", "wait_for_response"),
             DeliveryItem("C", "send_now")]
    state = _state(items)
    rec = _Rec()
    result = _run(state, rec)
    assert result == WAITING
    assert rec.sent == ["A", "B"]        # C not sent
    assert state.queue_position == 2     # stopped after B

    # the client's next message would re-plan; but a bare resume of the SAME queue
    # continues from the saved position:
    rec2 = _Rec()
    result2 = _run(state, rec2)
    assert result2 == COMPLETED
    assert rec2.sent == ["C"]
    assert state.queue_position == 3


def test_interrupted_send_preserves_position_for_resume():
    items = [DeliveryItem("A", "send_now"), DeliveryItem("B", "send_now"),
             DeliveryItem("C", "send_now")]
    state = _state(items)
    rec = _Rec(fail_on=2)  # raise on the 2nd send (simulates a mid-delivery drop)
    with pytest.raises(RuntimeError):
        _run(state, rec)
    assert rec.sent == ["A"]
    assert state.queue_position == 1     # B not advanced past -> resume replays it
    assert rec.typing_log[-1] is False       # typing indicator cleared in finally

    rec2 = _Rec()
    result = _run(state, rec2)
    assert result == COMPLETED
    assert rec2.sent == ["B", "C"]


# ── task lifecycle ───────────────────────────────────────────────────────────
def test_resume_guards(monkeypatch):
    from app.services.ai.reading_session import get_session_store

    # disabled -> no-op
    monkeypatch.setattr(
        "app.config.get_app_settings",
        lambda: type("S", (), {"AI_DRAFTING_ENABLED": False})(),
    )
    assert asyncio.run(ex.resume_delivery(12345)) is None
    monkeypatch.undo()  # re-enable for the rest

    store = get_session_store()
    # queue already finished -> None
    st = create_session_state("chat:99999", chat_id=99999)
    st.delivery_queue = [DeliveryItem("x", "send_now")]
    st.queue_position = 1
    store.put(st)
    assert asyncio.run(ex.resume_delivery(99999)) is None

    # parked at a wait_for_response barrier -> a reconnect must NOT resume past it
    st2 = create_session_state("chat:88888", chat_id=88888)
    st2.delivery_queue = [DeliveryItem("a", "wait_for_response"), DeliveryItem("b", "send_now")]
    st2.queue_position = 1
    st2.waiting_for_response = True
    store.put(st2)
    assert asyncio.run(ex.resume_delivery(88888)) is None


def test_resume_launches_unfinished_non_barrier(monkeypatch):
    from app.services.ai.reading_session import get_session_store

    st = create_session_state("chat:77777", chat_id=77777)
    st.delivery_queue = [DeliveryItem("a", "send_now"), DeliveryItem("b", "send_now")]
    st.queue_position = 1          # mid-delivery (disconnect), not at a barrier
    st.waiting_for_response = False
    get_session_store().put(st)
    launched = []
    monkeypatch.setattr(ex, "start_delivery", lambda cid, s, config=None: launched.append(cid) or "task")
    assert asyncio.run(ex.resume_delivery(77777)) == "task"
    assert launched == [77777]


# ── post-end cancellation (Fix 2) ────────────────────────────────────────────
def test_chat_is_deliverable_only_active():
    from app.enums.chat_status import ChatStatus

    def chat(status):
        return type("C", (), {"status": status})()

    assert ex._chat_is_deliverable(chat(ChatStatus.ACTIVE)) is True
    # Every non-active state (including a missing chat) blocks delivery.
    for st in (ChatStatus.ENDED, ChatStatus.PAUSED, ChatStatus.ARCHIVED, ChatStatus.BLOCKED):
        assert ex._chat_is_deliverable(chat(st)) is False
    assert ex._chat_is_deliverable(None) is False


def test_cancel_pipeline_cancels_and_clears():
    from app.services.ai import reading_pipeline as rp

    async def _scenario():
        cancelled = {"v": False}

        async def long_pipeline():
            try:
                await asyncio.sleep(100)
            except asyncio.CancelledError:
                cancelled["v"] = True
                raise

        rp._pipeline_tasks[4242] = asyncio.create_task(long_pipeline())
        await asyncio.sleep(0)  # let it start
        await rp.cancel_pipeline(4242)
        assert cancelled["v"] is True
        assert 4242 not in rp._pipeline_tasks
        # calling again with nothing registered is a safe no-op
        await rp.cancel_pipeline(4242)

    asyncio.run(_scenario())


def test_start_and_cancel_lifecycle(monkeypatch):
    async def _scenario():
        flag = {"cancelled": False}

        async def fake_run(chat_id, state, config):
            try:
                await asyncio.sleep(100)
            except asyncio.CancelledError:
                flag["cancelled"] = True
                raise

        monkeypatch.setattr(ex, "_run_delivery", fake_run)
        task = ex.start_delivery(777, object())
        assert task is not None and 777 in ex._delivery_tasks
        await asyncio.sleep(0)  # let the task start
        await ex.cancel_delivery(777)
        assert 777 not in ex._delivery_tasks
        assert flag["cancelled"] is True

    asyncio.run(_scenario())


# ── single-agent Reader streaming delivery (Phase 4) ─────────────────────────
async def _aiter(items):
    for i in items:
        yield i


def test_execute_reader_stream_sends_bubbles_typing_and_holds():
    from app.services.ai.reading_executor import execute_reader_stream

    events = [("bubble", "a"), ("bubble", "b"), ("hold", ("t", "h")), ("bubble", "c")]
    sent, typing, sleeps = [], [], []
    clock_vals = iter([0, 10, 20, 30, 40, 50])  # big jumps -> gap always > floor -> no sleeps

    async def send(t): sent.append(t)
    async def typ(on): typing.append(on)
    async def slp(s): sleeps.append(s)

    out_sent, out_holds = asyncio.run(execute_reader_stream(
        _aiter(events), send_bubble=send, typing_fn=typ, sleep_fn=slp,
        min_typing_sec=0.8, clock=lambda: next(clock_vals),
    ))
    assert out_sent == ["a", "b", "c"]
    assert out_holds == [("t", "h")]
    assert typing == [True, False]          # typing on for the turn, off at the end
    assert sleeps == []                     # fast-arriving? no — big gaps, floor never fires


def test_execute_reader_stream_floor_sleeps_when_bubbles_arrive_fast():
    from app.services.ai.reading_executor import execute_reader_stream

    sleeps = []
    clock_vals = iter([0.0, 0.1, 0.1, 0.2, 0.2])  # 2nd bubble arrives 0.1s after 1st

    async def send(_t): pass
    async def typ(_on): pass
    async def slp(s): sleeps.append(round(s, 3))

    asyncio.run(execute_reader_stream(
        _aiter([("bubble", "a"), ("bubble", "b")]), send_bubble=send, typing_fn=typ,
        sleep_fn=slp, min_typing_sec=0.8, clock=lambda: next(clock_vals),
    ))
    assert sleeps == [0.7]                   # floor: 0.8 - 0.1 elapsed = 0.7s of typing


def test_merge_reader_holds_keeps_undeployed_drops_deployed_adds_new():
    from app.services.ai.reading_contracts import HeldItem
    from app.services.ai.reading_executor import _merge_reader_holds

    class _S:
        held_back_buffer = [
            HeldItem(text="old kept line", hold_trigger="if A"),
            HeldItem(text="deployed line", hold_trigger="if B"),
        ]

    state = _S()
    sent = ["hey", "so here is the deployed line woven in as a live read"]
    _merge_reader_holds(state, sent, [("if C", "brand new hold")])
    texts = [h.text for h in state.held_back_buffer]
    assert "old kept line" in texts        # not deployed -> kept
    assert "deployed line" not in texts    # its text appeared in a sent bubble -> dropped
    assert "brand new hold" in texts       # new @@HOLD@@ line added
