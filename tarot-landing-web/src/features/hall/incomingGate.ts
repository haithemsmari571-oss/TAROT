/* Holds the global Incoming Reading prompt back for a moment.

   The prompt (features/chat/components/IncomingReadingModal.tsx) covers the
   whole screen the instant a reader accepts. That is right everywhere on the
   site except inside the hall entry flow, where it lands on top of the hall's
   own arrival — the client never sees the moment she waited for.

   So while she is in the hall, the prompt is HELD, not cancelled. The hall plays
   its arrival, then releases the hold and the prompt appears exactly as it
   always does, with its Join button. Nothing about billing moves: joinChat is
   still anchored only to her explicit click on that button, which is the
   contract written at the top of IncomingReadingModal.tsx.

   If the hall unmounts for any reason the hold is released, so the prompt can
   never be lost. */

let held = false;
let queued: (() => void) | null = null;
const subs = new Set<() => void>();

const notify = () => subs.forEach((f) => { try { f(); } catch { /* a dead subscriber must not stop the rest */ } });

export const holdIncoming = () => { if (!held) { held = true; notify(); } };

export const releaseIncoming = () => {
  if (!held) return;
  held = false;
  const q = queued;
  queued = null;
  notify();
  if (q) q();
};

export const isIncomingHeld = () => held;

/** Called by the prompt when it wants to appear but is being held. */
export const queueIncoming = (show: () => void) => { queued = show; };

export const onIncomingHoldChange = (fn: () => void) => {
  subs.add(fn);
  return () => { subs.delete(fn); };
};

/* ── the requester's own acceptance ────────────────────────────────────────
   She clicked Begin in THIS browser session; being shown a Join prompt for the
   very reading she just asked for is a second confirmation that should not
   exist. While the entry hall's request is outstanding it registers the
   expectation here; the prompt's one shared funnel (showFor) consults it and,
   on a match, anchors the join directly — the same joinChat call, the same
   navigation, just not behind a second button. Cleared when she leaves the
   hall or its wait passes the poll bound, so an acceptance landing anywhere
   else on the site still prompts (the unexpected case keeps its gate). */
let expected: { psychicId: number } | null = null;

export const expectIncoming = (psychicId: number) => { expected = { psychicId }; };
export const clearExpectedIncoming = () => { expected = null; };
/** True when this session is waiting on this reading. An event that carries no
    psychic id matches whatever is expected — with at most one outstanding
    request per client, an anonymous acceptance mid-wait can only be ours. */
export const isIncomingExpected = (psychicId?: number) =>
  expected != null && (psychicId == null || psychicId === expected.psychicId);
