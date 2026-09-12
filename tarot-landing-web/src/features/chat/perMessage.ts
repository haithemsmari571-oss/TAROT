/* Per-message billing, the room's constants. One place for the cap, the lines
   the composer shows when the server refuses a message, and the URL Stripe
   returns to so she lands back in this room. */

/** The composer's character cap under per-message billing. The room's counter
    reads "{n}/300" from this same number. */
export const PER_MESSAGE_MAX_CHARS = 300;

export const PER_MESSAGE_COPY = {
  /** under the composer when her balance no longer covers one message */
  addStardust: "Add Stardust to keep going",
  /** message_rejected READER_UNAVAILABLE */
  readerUnavailable: "This reader is not available right now.",
  /** message_rejected SESSION_NOT_ACTIVE */
  sessionNotActive: "The reader has not joined yet.",
} as const;

/** Where Stripe Checkout returns after a per-message top-up: this room, with a
    marker the payment-return effect recognises. The backend appends
    "&status=success", so the query string must already exist. */
export function perMessageReturnUrl(chatId: number): string {
  return `/chats?chat_id=${chatId}&per_message=1`;
}
