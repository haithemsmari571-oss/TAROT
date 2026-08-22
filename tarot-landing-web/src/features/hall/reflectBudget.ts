/* REFLECTION BUDGET — one constant, one source.

   A customer in a reading can pause to sit with what she said. She gets two
   minutes at the start and two more at every fifteen-minute mark of PAID
   session time; unused time banks. These two numbers and this one function are
   the only arithmetic for that budget anywhere on the site. The server will
   mirror this module word for word and become the authority; until then the
   room computes it from sessionState.elapsedSeconds.

   earned    = GRANT + GRANT * floor(paidSeconds / EVERY)
   remaining = earned - spent          (spent accrues only while reflecting) */

/** Seconds granted at the start and again at every mark. */
export const REFLECT_GRANT_SECONDS = 120;

/** The mark: every this many seconds of paid session time earns another grant. */
export const REFLECT_MARK_SECONDS = 900;

/** Total reflection seconds earned so far for `paidSeconds` of paid session
    time (sessionState.elapsedSeconds). Never negative, never fractional. */
export function reflectEarnedSeconds(paidSeconds: number): number {
  const paid = Number.isFinite(paidSeconds) ? Math.max(0, Math.floor(paidSeconds)) : 0;
  return REFLECT_GRANT_SECONDS + REFLECT_GRANT_SECONDS * Math.floor(paid / REFLECT_MARK_SECONDS);
}

/** What is left to spend: earned minus spent, floored at zero. */
export function reflectRemainingSeconds(paidSeconds: number, spentSeconds: number): number {
  const spent = Number.isFinite(spentSeconds) ? Math.max(0, Math.floor(spentSeconds)) : 0;
  return Math.max(0, reflectEarnedSeconds(paidSeconds) - spent);
}

/** Reflection time actually used, in whole minutes, rounded UP — the closing
    card's number. 0 for nothing used. */
export function reflectMinutesUsed(spentSeconds: number): number {
  const s = Number.isFinite(spentSeconds) ? Math.max(0, spentSeconds) : 0;
  return Math.ceil(s / 60);
}

/** The closing card's one quiet line: "4 minutes of reflection, never charged"
    ("1 minute" singular). Empty when nothing was used — the caller omits the
    element, never renders a blank. */
export function formatReflectUsed(spentSeconds: number): string {
  const m = reflectMinutesUsed(spentSeconds);
  if (m <= 0) return "";
  return `${m} minute${m === 1 ? "" : "s"} of reflection, never charged`;
}

/** "2:00" — the hold panel's own m:ss shape (startHall's mmss), for the banked
    time in the header and the countdown on the panel. */
export function formatReflectClock(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
