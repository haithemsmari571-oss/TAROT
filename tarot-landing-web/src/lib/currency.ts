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

/**
 * Whole minutes of reading time the welcome credit buys with a given reader,
 * rounded DOWN so the offer never over-promises. The credit is the server's
 * figure (features/client-app/useWelcomeCredit.ts). Uses the same GBP
 * per-minute rate the card shows, so "£X/min" and "£Y = Z min" always agree.
 */
export function welcomeCreditMinutes(creditGbp: number, pricePerSecond: number): number {
  const perMin = (pricePerSecond || 0) * 60;
  if (perMin <= 0) return 0;
  return Math.floor(creditGbp / perMin);
}

/**
 * THE shared Stardust count formatter (no £ symbol) — use everywhere (header,
 * session bar, modals) so every screen shows the exact same number. Amounts in
 * pounds go through formatGbp below.
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
 * THE pounds formatter: every amount shown with the £ symbol (prices, wallet
 * top-ups, session cost, balances) goes through here. One rule: a thousands
 * separator always, two decimals when there are pence, none when the amount is
 * whole. "£2.50", "£15", "£9,997.50", "£10,000". A column that wants one
 * precision asks for the pence always: "£15.00", "£10,000.00".
 */
export function formatGbp(amount: number, options: { pence?: "auto" | "always" } = {}): string {
  const n = Number(amount);
  // Snap to whole pence first, as formatStardust does, so float noise never shows.
  const pence = isFinite(n) ? Math.round((n + Number.EPSILON) * 100) : 0;
  const decimals = options.pence === "always" || pence % 100 !== 0 ? 2 : 0;
  const pounds = (pence / 100 || 0).toLocaleString("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${GBP}${pounds}`;
}

/**
 * Whole minutes of reading time, written so a large balance stays readable.
 *   under an hour   ->  "38 min"
 *   an hour or more ->  "2 h 14 min"
 *   a day or more   ->  "3 d 4 h"
 *
 * PRESENTATION ONLY. This formats a number that has already been calculated;
 * it never rounds, caps or alters the value used for charging.
 */
export function formatMinutesLeft(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  const m = Math.max(0, Math.floor(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) {
    const rem = m % 60;
    return rem ? `${h} h ${rem} min` : `${h} h`;
  }
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH ? `${d} d ${remH} h` : `${d} d`;
}
