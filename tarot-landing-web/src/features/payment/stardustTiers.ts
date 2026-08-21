// Stardust custom-amount ("glider") pricing — display mirror of the backend
// source of truth in app/services/stardust.py. The server always recomputes
// tier + points from the dollar amount; these numbers are for live preview only.

export const STARDUST_MIN_USD = 15;
export const STARDUST_MAX_USD = 1000; // top of the slider == Lifetime Access

export const LIFETIME_COPY =
  "Lifetime Access Unlocked — 1 hour of reading time, daily, for life.";

export type StardustTierKey =
  | "base"
  | "whisper"
  | "revelation"
  | "devotion"
  | "lifetime";

export interface StardustQuote {
  amountUsd: number;
  tier: StardustTierKey;
  tierName: string;
  bonusPct: number; // 0.25 == +25%
  basePoints: number;
  bonusPoints: number;
  totalPoints: number;
  isLifetime: boolean;
}

// Tier bands for teasers / legends (excludes the base no-bonus band).
export const STARDUST_TIERS: {
  key: StardustTierKey;
  name: string;
  bonusPct: number;
  minUsd: number;
  maxUsd: number;
}[] = [
  { key: "whisper", name: "Whisper", bonusPct: 0.25, minUsd: 100, maxUsd: 249 },
  { key: "revelation", name: "Revelation", bonusPct: 0.4, minUsd: 250, maxUsd: 449 },
  { key: "devotion", name: "Devotion", bonusPct: 0.6, minUsd: 450, maxUsd: 999 },
];

/* The in-reading hold panel's preset amounts. Derived, not copied: the site
   minimum, the panel's own quick step (the one number this panel chooses), and
   the first bonus threshold — so a customer topping up mid-reading can reach a
   bonus at all. The panel renders these through calculateStardustQuote below,
   the same function the /billing glider renders from, so the two surfaces can
   never disagree on what a pound buys. */
export const STARDUST_HOLD_PRESETS: number[] = [
  STARDUST_MIN_USD,
  50,
  STARDUST_TIERS[0].minUsd,
];

export const clampStardustAmount = (amount: number): number =>
  Math.min(STARDUST_MAX_USD, Math.max(STARDUST_MIN_USD, Math.round(amount)));

export const calculateStardustQuote = (amountUsd: number): StardustQuote => {
  const amount = clampStardustAmount(amountUsd);

  if (amount >= STARDUST_MAX_USD) {
    return {
      amountUsd: STARDUST_MAX_USD,
      tier: "lifetime",
      tierName: "Lifetime Access",
      bonusPct: 0,
      basePoints: 0,
      bonusPoints: 0,
      totalPoints: 0,
      isLifetime: true,
    };
  }

  let bonusPct = 0;
  let tier: StardustTierKey = "base";
  let tierName = "Stardust";

  if (amount >= 450) {
    bonusPct = 0.6;
    tier = "devotion";
    tierName = "Devotion";
  } else if (amount >= 250) {
    bonusPct = 0.4;
    tier = "revelation";
    tierName = "Revelation";
  } else if (amount >= 100) {
    bonusPct = 0.25;
    tier = "whisper";
    tierName = "Whisper";
  }

  const basePoints = amount; // £1 = 1 point
  const bonusPoints = Math.floor(basePoints * bonusPct); // matches Python int()

  return {
    amountUsd: amount,
    tier,
    tierName,
    bonusPct,
    basePoints,
    bonusPoints,
    totalPoints: basePoints + bonusPoints,
    isLifetime: false,
  };
};
