// Currency display helpers. The site trades in GBP (£) — the wallet/checkout is
// charged in GBP by the backend (Stripe currency "gbp"), so 1 credit = £1.
//
// Per-minute reader rates use a fixed USD->GBP conversion table supplied by the
// business (not a live FX rate). Anything not in the table falls back to a clean
// rounded-to-10p figure so we never show odd fractions.

export const GBP = "£";

// Exact per-minute conversions (USD -> GBP), keyed by USD pennies to dodge float
// comparison issues.
const PER_MINUTE_TABLE: Record<number, number> = {
  180: 1.4,
  240: 1.9,
  270: 2.1,
  294: 2.3,
  300: 2.4,
  360: 2.8,
  396: 3.1,
  462: 3.6,
  540: 4.2,
  594: 4.7,
  660: 5.2,
};

/** Round a number to the nearest clean 10p (e.g. 2.844 -> 2.80). */
export function roundToTenPence(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Format a per-minute reader rate (given as a USD/min figure, e.g. price_per_second*60)
 * as a GBP string like "£5.20".
 */
export function formatPerMinuteGbp(usdPerMinute: number): string {
  const cents = Math.round(usdPerMinute * 100);
  const gbp =
    PER_MINUTE_TABLE[cents] ?? roundToTenPence(usdPerMinute * 0.79);
  return `${GBP}${gbp.toFixed(2)}`;
}

/**
 * Format an amount already denominated in GBP (wallet top-ups, session cost,
 * balances) — just adds the £ symbol. 1 credit = £1.
 */
export function formatGbp(amount: number, decimals = 2): string {
  return `${GBP}${amount.toFixed(decimals)}`;
}
