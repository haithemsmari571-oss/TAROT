import { api } from "./client";

// Client for the backend Constellation engine (TAROT-BACKEND
// app/routers/constellation.py): per-user daily pull with streaks + earned
// Stardust, per-sign daily content, and pending reward celebrations.

export interface StreakStatus {
  length: number;
  week_position: number; // 1..cycle position (0 when no streak)
  days_to_bonus: number;
  cycle: number; // 7
  bonus: number; // Stardust awarded on completing a cycle
}

export interface TodayCard {
  card_key: number; // 0-21, maps onto TAROT_CARDS[id]
  card_name: string;
  interpretation: string;
  manifestation: string;
  ritual: string;
  quote_line: string;
}

export interface UpsellCopy {
  headline: string;
  subline: string;
  cta_label: string;
}

export interface ConstellationPayload {
  dob_set: boolean;
  zodiac_sign: string | null; // e.g. "Pisces"
  today: {
    date: string; // ISO date
    pulled: boolean;
    reward: number | null; // today's pull reward if already pulled
    card: TodayCard | null;
  };
  streak: StreakStatus;
  upsell: UpsellCopy;
}

export interface PullResult {
  reward: number;
  bonus: number; // streak-cycle bonus (0 unless a cycle completed)
  streak: StreakStatus;
  card: TodayCard;
}

export interface Celebration {
  id: number; // notification id — used to ack
  kind: "gift" | "claim";
  amount: number;
  title: string;
  message: string | null;
}

/** Everything the SANCTUARY needs in one call. */
export async function getConstellation(): Promise<ConstellationPayload> {
  const res = await api.get("/api/constellation");
  return res.data;
}

/** Reveal today's card — server rolls and credits the reward. Once per day. */
export async function pullDailyCard(): Promise<PullResult> {
  const res = await api.post("/api/constellation/pull");
  return res.data;
}

/** Rewards not yet celebrated (gifts from Valentina, approved claims). */
export async function getCelebrations(): Promise<Celebration[]> {
  const res = await api.get("/api/constellation/celebrations");
  return res.data?.celebrations ?? [];
}

/** Mark celebrations as seen so they never fire again. */
export async function ackCelebrations(ids: number[]): Promise<void> {
  if (!ids.length) return;
  await api.post("/api/constellation/celebrations/ack", { ids });
}
