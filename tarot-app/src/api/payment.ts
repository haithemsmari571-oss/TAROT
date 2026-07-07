import { api } from "./client";

/**
 * Current Stardust balance for the signed-in user. Mirrors the website's
 * Billing page, which reads the same endpoint (GET /api/transactions/me/balance).
 * `balance` is a whole-number Stardust total (points), NOT cents.
 */
export interface StardustBalance {
  user_id: number;
  balance: number;
  /** Remaining free welcome/gift credit, in pounds (£15 signup bonus lives here). */
  credit_balance?: number;
  /** Purchased balance remaining, in pounds. */
  paid_balance?: number;
  /** Earned (gamification) Stardust, unexpired. */
  earned_balance?: number;
  /** Display total (spendable + earned) — what the website's pill shows. */
  stardust_total?: number;
  last_updated: string;
}

/** Fetch the signed-in user's Stardust balance. */
export async function getMyBalance(): Promise<StardustBalance> {
  const res = await api.get("/api/transactions/me/balance");
  return res.data;
}

/**
 * Ask the backend to open a Stripe Checkout session for a custom Stardust
 * dollar amount. The server validates the range and computes the tier + bonus
 * Stardust itself — the client only sends the whole-dollar amount. Returns the
 * hosted Stripe Checkout URL to open in a browser.
 *
 * Same endpoint (and same Bearer-JWT auth) the website uses.
 */
export async function createStardustCheckoutSession(
  amountUsd: number
): Promise<{ url: string }> {
  const res = await api.post("/api/payment/create-stardust-checkout-session", {
    amount_usd: amountUsd,
  });
  return res.data;
}
