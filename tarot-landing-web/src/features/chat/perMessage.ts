/* Per-message billing, the room's constants. One place for the cap, the lines
   the composer shows when the server refuses a message, the refund promise and
   the refund line, and the URL Stripe returns to so she lands back in this room. */
import { formatGbp } from "@/lib/currency";

/** The composer's character cap under per-message billing. The room's counter
    reads "{n}/300" from this same number. */
export const PER_MESSAGE_MAX_CHARS = 300;

/** A refunded message, in the owner's words when the reader's name is not
    known. The backend writes exactly these words as the system row a refund
    leaves in her thread (offline_replies.REFUND_NOTE); the room finds the row
    by them and draws PER_MESSAGE_COPY.refund with the reader's name. */
export const REFUND_NOTE = "Refund · no reply";

export const PER_MESSAGE_COPY = {
  /** under the composer until her first paid message, and on the reader's
      profile under the price; the hours are the backend's refund window */
  refundPromise: (price: number, hours: number) =>
    `Her hello is free. Each message you send is ${formatGbp(price)}, refunded automatically if she has not replied within ${hours} hours.`,
  /** the owner's refund line where she pays and decides: the top-up window
      and the guest reader profile beside the price; the hours are the
      backend's refund window (24 today, which gives the owner's exact words) */
  refundGuarantee: (hours: number) =>
    `If your reader doesn't reply within ${hours} hours, your Stardust is refunded automatically.`,
  /** a refunded message: the quiet line in the room, the row in the You tab */
  refund: (reader?: string) => (reader ? `${REFUND_NOTE} from ${reader}` : REFUND_NOTE),
  /** under the composer when her balance no longer covers one message */
  addStardust: "Add Stardust to keep going",
  /** message_rejected READER_UNAVAILABLE */
  readerUnavailable: "This reader is not available right now.",
  /** message_rejected SESSION_NOT_ACTIVE */
  sessionNotActive: "The reader has not joined yet.",
  /** back in the room from Stripe Checkout with status=success */
  paymentReceived: "Payment received. Your Stardust is in the room.",
  /** POST /chat/conversation failed for any reason other than READER_UNAVAILABLE */
  openFailed: "This conversation could not be opened. Try again.",
  /** a hidden reader's profile, and POST /chat/conversation's 410 for her
      (TAROT-BACKEND per_message_start.py READER_NO_LONGER_AVAILABLE) */
  readerGone: "This reader is no longer available.",
} as const;

/** Where Stripe Checkout returns after a per-message top-up: this room, with a
    marker the payment-return effect recognises. The backend appends
    "&status=success", so the query string must already exist. */
export function perMessageReturnUrl(chatId: number): string {
  return `/chats?chat_id=${chatId}&per_message=1`;
}
