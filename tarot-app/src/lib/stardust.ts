// Stardust custom-amount pricing — DISPLAY MIRROR of the backend source of
// truth (TAROT-BACKEND/app/services/stardust.py) and the website's
// stardustTiers.ts. These numbers drive the live preview only; the server
// always recomputes the tier + awarded Stardust from the dollar amount, so a
// wrong client-side estimate can never be exploited.

/**
 * Preset offering amounts shown as quick-pick buttons. The website's slider
 * also allows $1000 (Lifetime Access), but that tier requires MANUAL
 * fulfilment and is intentionally excluded from the automated app flow.
 */
export const STARDUST_PRESETS = [15, 50, 100, 250, 500] as const;

export interface StardustPreview {
  amountUsd: number;
  tierName: string;
  bonusPct: number; // 0.25 == +25%
  basePoints: number;
  bonusPoints: number;
  totalPoints: number;
}

/**
 * Mirror of `calculate_stardust_quote`. $1 = 1 base Stardust; bonus Stardust is
 * floored, matching the backend's int() truncation. Lifetime ($1000) is out of
 * scope here, so no lifetime branch.
 */
export function previewStardust(amountUsd: number): StardustPreview {
  let bonusPct = 0;
  let tierName = "Stardust";

  if (amountUsd >= 450) {
    bonusPct = 0.6;
    tierName = "Devotion";
  } else if (amountUsd >= 250) {
    bonusPct = 0.4;
    tierName = "Revelation";
  } else if (amountUsd >= 100) {
    bonusPct = 0.25;
    tierName = "Whisper";
  }

  const basePoints = amountUsd; // $1 = 1 point
  const bonusPoints = Math.floor(basePoints * bonusPct);

  return {
    amountUsd,
    tierName,
    bonusPct,
    basePoints,
    bonusPoints,
    totalPoints: basePoints + bonusPoints,
  };
}
