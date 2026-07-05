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
 * THE shared money/stardust formatter — use everywhere (header, session bar,
 * cockpit, modals, ledger, admin) so every screen shows the exact same number.
 *
 * Shows the EXACT value: whole numbers stay whole ("15"), fractional values keep
 * their decimals up to 2 dp ("9.6", "0.2"), never truncated, floored or rounded,
 * and no trailing zeros. Balances are stored to 2 dp (pennies), so 2 dp is the
 * full precision.
 */
export function formatStardust(amount: number | null | undefined): string {
  const n = Number(amount);
  if (!isFinite(n)) return "0";
  // Snap to 2 dp to kill float noise (e.g. 9.599999), then drop trailing zeros.
  const twoDp = (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
  return twoDp.replace(/\.?0+$/, "");
}

/**
 * Format an amount already denominated in GBP (wallet top-ups, session cost,
 * balances) with the £ symbol. Uses the shared exact formatter (1 credit = £1),
 * so "£15", "£9.6", "£0.2" — matching the Stardust figure everywhere.
 */
export function formatGbp(amount: number): string {
  return `${GBP}${formatStardust(amount)}`;
}
