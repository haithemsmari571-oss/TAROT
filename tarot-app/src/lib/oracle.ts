import AsyncStorage from "@react-native-async-storage/async-storage";
import { TAROT_CARDS, type TarotCard } from "../data/tarotCards";
import { todayKey } from "../utils/dailyDraw";

// Yes/No Oracle — one card, one answer, purely local ritual. Her question is
// never stored or sent anywhere; only the pull COUNT persists (per user, per
// local date) so the three nightly pulls reset at her midnight.

export type OracleBucket = "yes" | "no" | "unclear";

export interface OracleAnswer {
  bucket: OracleBucket;
  text: string;
  card: TarotCard;
  reversed: boolean;
}

// Answer copy is fixed product copy — do not edit without a copy decision.
const YES_ANSWERS = [
  "The cards are certain of this.",
  "Yes — and sooner than you think.",
  "The stars have already aligned for it.",
  "Yes, without a doubt.",
  "All signs point toward yes.",
  "The universe is nodding.",
  "Yes — trust what you already feel.",
];

const UNCLEAR_ANSWERS = [
  "The cards are veiled tonight — ask again tomorrow.",
  "Something is still in motion. Not yet decided.",
  "The answer is shifting as we speak.",
  "This one is deeper than one card can hold.",
];

const NO_ANSWERS = [
  "The cards say no — gently, but no.",
  "Not this path. Not now.",
  "The signs lean away from it.",
  "Doubtful — the energy isn't there.",
  "No — something better is behind this door.",
];

// Bucket weights: ~40% yes / 27% no / 33% unclear. Yes-leaning on purpose —
// she should leave feeling lifted more often than not.
const YES_WEIGHT = 0.4;
const NO_WEIGHT = 0.27;

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Roll a fresh answer: weighted bucket, random line within it, random card. */
export function drawOracleAnswer(): OracleAnswer {
  const r = Math.random();
  const bucket: OracleBucket =
    r < YES_WEIGHT ? "yes" : r < YES_WEIGHT + NO_WEIGHT ? "no" : "unclear";
  const text =
    bucket === "yes"
      ? pick(YES_ANSWERS)
      : bucket === "no"
        ? pick(NO_ANSWERS)
        : pick(UNCLEAR_ANSWERS);
  return {
    bucket,
    text,
    card: pick(TAROT_CARDS),
    reversed: Math.random() < 0.5,
  };
}

export const ORACLE_DAILY_LIMIT = 3;

const STORAGE_PREFIX = "oracle_pulls_v1";

interface StoredPulls {
  dateKey: string;
  count: number;
}

function storageKey(userId: number | null | undefined): string {
  return `${STORAGE_PREFIX}:${userId ?? "guest"}`;
}

/** Pulls already used today (0 when the stored entry is from a previous day). */
export async function loadPullsUsed(
  userId: number | null | undefined
): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as StoredPulls;
      if (parsed.dateKey === todayKey() && Number.isFinite(parsed.count)) {
        return Math.max(0, Math.floor(parsed.count));
      }
    }
  } catch {
    // Corrupt/absent storage — treat as a fresh day.
  }
  return 0;
}

/** Record one more pull used today and return the new count. */
export async function recordPull(
  userId: number | null | undefined
): Promise<number> {
  const used = await loadPullsUsed(userId);
  const next = used + 1;
  try {
    await AsyncStorage.setItem(
      storageKey(userId),
      JSON.stringify({ dateKey: todayKey(), count: next } satisfies StoredPulls)
    );
  } catch {
    // Best-effort; the in-memory count still gates this session.
  }
  return next;
}
