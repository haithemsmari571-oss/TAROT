# Single-agent Reader redesign

Status: **approved 2026-07-13**, in progress on branch `single-agent-reader`. Nothing on
`main`/prod until an A/B proves quality parity and the latency win. Feature-flagged
(`READING_ENGINE`) so both pipelines coexist and rollback is instant.

## Why

The two-agent pipeline makes **3-4 sequential LLM calls per client turn**
(Sabri assess → Valentina draft → Sabri review/±correct → Sabri select/transform/pace),
then plays the result out with **artificial `pause_short`/`pause_long` delays on top of the
real compute time**. That is the source of both:

- **Latency** — sequential calls (~75-140s for a real question) plus fake pacing.
- **A whole bug class at the handoff** — the hold-back-candidate leak and the message-ordering
  glitch both lived in the seam where Sabri parses/re-styles Valentina's output.

## The change

```
                 BEFORE (two_agent)                          AFTER (single_agent)
  client msg                                        client msg
     ▼                                                 ▼   held buffer + dossier + transcript
  Sabri assess    (Haiku)                          ONE Reader call  (Opus, STREAMING)
  Valentina draft (Sonnet)   handoff bugs             │  persona + delivery craft + self-check
  Sabri review/correct       live here                ▼  streams bubbles, marks holds at end
  Sabri select/transform                          per-bubble → _strip_return_acks (regex, no LLM)
  executor: fake pauses                               ▼
                                                  stream bubble to client (typing = real gen time)
```

One model call produces the **final, human-typed chat bubbles directly** — no "Valentina writes
raw, Sabri restyles." Self-correction is an **internal pre-emit check** inside that one call, not
a second critic agent round-tripping critiques.

## Components

### 1. The Reader agent (`reading_reader.py`, new)
- One **merged "Logan" system prompt** fusing Valentina (psychic engine: tarot/astrology/
  numerology, the 13 techniques, the 4-part structure, golden rules) + Sabri (delivery craft:
  fragmentation, abbreviations, length variation, the quality gate → now an internal self-check).
- **Input each turn:** client message · recent transcript · client_file (dossier) · session
  metadata · the held-back buffer (lines it may deploy now).
- **Output (stream-friendly plain text):** one bubble per block, blank line between; an optional
  `@@HOLD@@` trailer of `trigger :: line` holds. No JSON, no preamble.
- **Model:** Opus (`READER_MODEL`) for the A/B — see the quality ceiling before considering a
  cheaper tier.

### 2. Streaming delivery (`reading_executor.py`)
- Anthropic **streaming API**; the orchestrator splits the stream on the blank-line delimiter.
- **Pacing is the real generation time** — typing indicator shows while the next bubble
  generates; the bubble is sent when complete. `compute_typing_duration`/`gap_after`/
  `pause_short`/`pause_long` are deleted.
- A **light `READER_MIN_TYPING_MS` (≈800ms) floor** per bubble so a fast bubble still reads as
  typed — not the old multi-second artificial pauses.
- **v1 granularity = bubble-level** (each bubble is buffered until its delimiter, filtered, then
  sent — required so the return-ack filter never streams a bubble it would drop). Token-level
  streaming into a growing bubble is a **deferred v2** (needs a small frontend change).

### 3. Hold-back → orchestrator session state
State moves out of the model into `ReadingSessionState.held_back_buffer` (already exists):
- The Reader **designates** holds in `@@HOLD@@`; the orchestrator **stores** them
  (reusing `_merge_buffer`); next turn it **feeds the buffer back** into the Reader's input; the
  Reader deploys any that now fit and the orchestrator removes deployed ones. The model never has
  to remember — killing the hold-back-leak bug, which was a Sabri-JSON artifact.

### 4. Deterministic guardrails — kept, run on the single output
- **Return-acknowledgment strip** (`is_return_acknowledgment` + `_strip_return_acks`): transfers
  **1:1**, run on each bubble before send. The piece that hit 0% this session; unchanged.
- **Correction-loop cap:** honest note — a single-agent design has **no correction loop to cap**
  (removing that loop is the point). Its *guarantee* — never spin, always deliver something
  non-silent — transfers as (a) the existing empty/all-filtered fallback and (b) a bounded retry
  (`READER_MAX_ATTEMPTS`) if the single call is malformed/empty. Same guarantee, no multi-round LLM
  correction.

## File-by-file

| File | Change |
|---|---|
| `reading_reader.py` (new) | the Reader: prompt, streaming call, bubble+hold parser |
| `reading_pipeline.py` | orchestrator branches on `READING_ENGINE`; single path = one call + filter + stream |
| `reading_executor.py` | streaming delivery; delete artificial pacing |
| `reading_contracts.py` | keep the return-ack strip; small delimiter parser instead of `parse_sabri_output` |
| `reading_session.py` | unchanged — held buffer, transcript, dossier, metadata stay |
| `reading_assistant.py` + `sabri_check.py` | deprecated behind the flag; deleted after cutover |
| `client.py` | add `run_chat_stream` (SSE) |
| frontend | v1 none; v2 token streaming into a bubble |
| Atlas / disconnect / post-end-cancel / dossier load | unchanged |

## Rollout

1. Branch + `READING_ENGINE` flag (default `two_agent`) — done in Phase 1.
2. `reading_reader.py` + merged-prompt skeleton (Logan fills persona) — Phase 2.
3. Streaming in `client.py` + bubble/hold parser + wire the return-ack filter + retry cap.
4. Streaming executor.
5. Hold-back feedback loop through session state.
6. **A/B harness** (latency + return-ack leak + a blind quality read by Logan) → review → cutover
   → delete two-agent code.
7. Frontend token streaming (optional v2).

## Open questions — resolved

- **Model tier:** Opus for the A/B (quality ceiling first).
- **Streaming granularity:** bubble-level v1; token-level deferred.
- **Pacing floor:** keep ≈800ms/bubble.
- **Merged prompt:** build the skeleton with overlapping sections (banned lists, voice rules)
  flagged for de-duping; the **fused persona text is a placeholder** — written in Logan's Cowork
  session, same as the Sabri/Valentina edits.

## Risks

- **Quality (the real one):** two specialists can out-quality one generalist. Mitigated by Opus +
  the A/B gate; do not cut over until single-agent matches or beats two-agent on a blind read.
- **Prompt fusion:** Valentina's golden rules and Sabri's "rules that never bend" overlap and must
  merge without contradiction; both carry banned-phrase lists that need de-duping.
