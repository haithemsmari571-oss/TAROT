"""A/B harness — single-agent Reader vs two-agent (Valentina+Sabri) pipeline.

Runs a battery of client turns through BOTH engines and prints, per case: latency,
message count, return-ack leaks, and the full raw output of each — so Logan can do a
blind quality read alongside the hard numbers before any cutover.

Real Claude calls. Calls each engine directly (does not need the READING_ENGINE flag).
Point it at a real dossier for the returning-client cases:

    AB_DOSSIER_FILE=/path/to/dossier.txt PYTHONPATH=. python scripts/ab_reader.py

Without AB_DOSSIER_FILE the returning cases fall back to a thin (first-session) file.
"""
import io
import logging
import os
import time

logging.disable(logging.CRITICAL)

from app.services.ai import reading_assistant, reading_session, sabri_check
from app.services.ai.reading_pipeline import (
    _sabri_instructions,
    is_return_acknowledgment,
    process_client_message,
)
from app.services.ai.reading_reader import build_reader_input, run_reader_turn

_DOSSIER_PATH = os.environ.get("AB_DOSSIER_FILE")
DOSSIER = io.open(_DOSSIER_PATH, encoding="utf-8").read() if _DOSSIER_PATH else None

# (label, client message, dossier?, session metadata)
CASES = [
    ("GREETING (micro)", "hi", None, {"first_session": True}),
    ("REAL QUESTION (full)",
     "my ex daniel keeps going hot and cold, born march 3 1990. im sarah, july 22 1992. "
     "will he actually come back to me?", DOSSIER, {"first_session": DOSSIER is None}),
    ("RETURNING + HEATED", "im honestly done waiting for him", DOSSIER, {"first_session": False}),
]


def run_single(msg, dossier, meta):
    inp = build_reader_input(client_message=msg, chat_transcript=[], client_file=dossier,
                             session_metadata=meta, held_back_buffer=[])
    t0 = time.time()
    bubbles, holds = run_reader_turn(inp)  # one streamed Opus call + strip + retry cap
    dt = time.time() - t0
    leaks = sum(1 for b in bubbles if is_return_acknowledgment(b))
    return bubbles, holds, dt, leaks


def run_two(msg, dossier, meta):
    state = reading_session.create_session_state(
        "chat:ab", client_id=1, chat_id=1, client_file=dossier, is_first_session=(dossier is None))

    def scall(inp):
        return sabri_check.call_sabri(inp)

    def vcall(req):
        return reading_assistant.call_valentina(
            client_message=msg, client_file=dossier,
            sabri_instructions=_sabri_instructions(req), chat_transcript=state.chat_transcript)

    t0 = time.time()
    plan = process_client_message(state, msg, sabri_call=scall, valentina_call=vcall)
    dt = time.time() - t0
    msgs = [i.message for i in plan.queue]
    leaks = sum(1 for m in msgs if is_return_acknowledgment(m))
    return msgs, plan.hold_back, dt, leaks


def main():
    summary = []
    for label, msg, dossier, meta in CASES:
        print("=" * 82)
        print(f"{label}   client: {msg!r}")
        print("=" * 82)

        b, bh, bdt, bl = run_single(msg, dossier, meta)
        print(f"\n--- SINGLE-AGENT  (Opus, 1 call · {bdt:.1f}s · {len(b)} bubbles · "
              f"{len(bh)} holds · leaks={bl}) ---")
        for x in b:
            print("   |", x)
        for t, l in bh:
            print("   HOLD", t, "::", l)

        m, mh, mdt, ml = run_two(msg, dossier, meta)
        print(f"\n--- TWO-AGENT  (Sonnet+Haiku, 3-4 calls · {mdt:.1f}s · {len(m)} msgs · "
              f"{len(mh)} holds · leaks={ml}) ---")
        for x in m:
            print("   |", x)
        print()
        summary.append((label, bdt, mdt, bl, ml))

    print("=" * 82)
    print("SUMMARY  (latency single vs two ; return-ack leaks)")
    print("=" * 82)
    for label, bdt, mdt, bl, ml in summary:
        print(f"  {label:22}  single {bdt:6.1f}s / two {mdt:6.1f}s  "
              f"({mdt / bdt:.1f}x faster)   leaks single={bl} two={ml}")


if __name__ == "__main__":
    main()
