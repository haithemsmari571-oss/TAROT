/* The closing card's eyebrow, in words.

   A session ends with one of ChatTerminationReason's values
   (TAROT-BACKEND/app/enums/chat_termination_reason.py:4-13), which the server
   sends verbatim in the session-ended event; the client's own reducer adds two
   lowercase literals of its own (useChatSessionState.ts:335 'user_initiated',
   :356 'insufficient_balance'). All of them used to print raw onto the card —
   customers saw USER_INITIATED and MANUAL_EXIT as the eyebrow above
   "Valentina will remember this".

   This is the one place a reason becomes words, in the hall's voice. Quiet
   context, never a status code: a value with no customer-facing sense shows
   nothing at all rather than a fallback, and an unrecognised value shows
   nothing rather than itself. */

const EYEBROW: Record<string, string> = {
  /* a deliberate end by either party — the status route raises MANUAL_EXIT and
     sends the same event as "user_initiated" whoever pressed End, so neither
     can honestly say who did; the card's own plain line covers both */
  MANUAL_EXIT: "Your reading has ended",
  USER_INITIATED: "Your reading has ended",
  /* out of Stardust: the grace expired, or the balance could not cover another minute */
  INSUFFICIENT_FUNDS: "Your Stardust ran out",
  INSUFFICIENT_BALANCE: "Your Stardust ran out",
  NO_TOPUP: "Your Stardust ran out",
  /* the hold panel's own word for a pause: she was holding your place */
  PAUSE_TIMEOUT: "The hold ran out",
  /* every flavour of lost link reads the same to her */
  SOCKET_LOST: "The connection was lost",
  TIMEOUT: "The connection was lost",
  CLIENT_DISCONNECTED: "The connection was lost",
  /* an interval's pause marker, not an ending — nothing to say */
  PAUSE_FOR_TOPUP: "",
};

/** The card's plain eyebrow when no reason was recorded at all. */
export const DEFAULT_END_EYEBROW = "Your reading has ended";

export function endReasonEyebrow(reason: string | null | undefined): string {
  if (reason == null || String(reason).trim() === "") return DEFAULT_END_EYEBROW;
  const key = String(reason).trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(EYEBROW, key) ? EYEBROW[key] : "";
}
