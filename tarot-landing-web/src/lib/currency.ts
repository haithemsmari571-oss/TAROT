// Currency display helpers. The site trades in GBP (£). Reader rates are stored
// in the DB as GBP (price_per_second is £/second), and the wallet/checkout is
// charged in GBP by the backend (Stripe currency "gbp"), so 1 credit = £1.
// Per-minute rates are formatted, never converted — the displayed price equals
// the billed price.

export const GBP = "£";

/** Numeric per-minute reader rate in GBP (price_per_second * 60, already GBP). */
export function perMinuteGbp(gbpPerMinute: number): number {
  return gbpPerMinute;
}

/** Format a per-minute reader rate (price_per_second * 60, in GBP) as "£5.20". */
export function formatPerMinuteGbp(gbpPerMinute: number): string {
  return `${GBP}${gbpPerMinute.toFixed(2)}`;
}

/** Free credit granted to a new member on their first reading (in GBP). */
export const WELCOME_CREDIT_GBP = 15;

/**
 * Whole minutes of reading time the £15 welcome credit buys with a given reader,
 * rounded DOWN so the offer never over-promises. Uses the same GBP per-minute
 * rate the card shows, so "£X/min" and "£15 = Y min" always agree.
 */
export function welcomeCreditMinutes(pricePerSecond: number): number {
  const perMin = (pricePerSecond || 0) * 60;
  if (perMin <= 0) return 0;
  return Math.floor(WELCOME_CREDIT_GBP / perMin);
}

/**
 * Format an amount already denominated in GBP (wallet top-ups, session cost,
 * balances) — just adds the £ symbol. 1 credit = £1.
 */
export function formatGbp(amount: number, decimals = 2): string {
  return `${GBP}${amount.toFixed(decimals)}`;
}
