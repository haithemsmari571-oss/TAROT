import AsyncStorage from "@react-native-async-storage/async-storage";
import { TAROT_CARDS, type TarotCard } from "../data/tarotCards";

export type Position = "Past" | "Present" | "Future";

export interface DrawnCard {
  card: TarotCard;
  position: Position;
  reversed: boolean;
}

const STORAGE_KEY = "daily_draw_v1";
const POSITIONS: Position[] = ["Past", "Present", "Future"];

/**
 * Local device date as YYYY-MM-DD (no time component). This is the seed and the
 * "which day is it" key, so the draw resets at the device's local midnight.
 */
export function todayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Deterministic PRNG (mulberry32) seeded from a hashed string. */
function makeRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Compute the 3-card draw for a given date key. Pure and deterministic: the
 * same key always yields the same three cards, positions, and orientations —
 * so the draw is stable all day and resets when the date rolls over.
 */
export function computeDraw(dateKey: string): DrawnCard[] {
  const rng = makeRng(dateKey);

  // Seeded Fisher–Yates shuffle of the 22 card indices.
  const indices = TAROT_CARDS.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  // First three are unique by construction; orientation is seeded too.
  return indices.slice(0, 3).map((cardIndex, i) => ({
    card: TAROT_CARDS[cardIndex],
    position: POSITIONS[i],
    reversed: rng() < 0.5,
  }));
}

/**
 * Weave the three drawn cards into a short, mystical reading that pulls each
 * card's keyword by position and ends on a hook toward a real reading.
 */
export function generateReading(draw: DrawnCard[]): string {
  const [past, present, future] = draw;
  const kw = (d: DrawnCard, i: number) => d.card.keywords[i].toLowerCase();

  const s1 = `The ${past.card.name} behind you speaks of ${kw(
    past,
    0
  )} you've carried longer than you admit${
    past.reversed ? ", its weight not yet set down" : ""
  }.`;

  const s2 = `The ${present.card.name} stands with you now, pulling everything toward ${kw(
    present,
    1
  )}${present.reversed ? " — though it hides its full face from you" : ""}.`;

  const s3 = `And the ${future.card.name} waits ahead, where ${kw(
    future,
    2
  )} is already taking shape${
    future.reversed ? ", quieter than it first appears" : ""
  }.`;

  const hook =
    "The cards hint at more beneath the surface — a reader could tell you what they're holding back.";

  return `${s1} ${s2} ${s3} ${hook}`;
}

interface StoredDraw {
  dateKey: string;
  revealed: boolean;
}

/**
 * Load whether today's draw has already been revealed. The cards themselves are
 * recomputed from the date key (deterministic), so only the reveal flag needs
 * to persist. A stored entry from a previous day is ignored (fresh draw).
 */
export async function loadDrawState(): Promise<{
  dateKey: string;
  revealed: boolean;
}> {
  const dateKey = todayKey();
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredDraw;
      if (parsed.dateKey === dateKey) {
        return { dateKey, revealed: !!parsed.revealed };
      }
    }
  } catch {
    // Corrupt/absent storage — fall through to a fresh, unrevealed state.
  }
  return { dateKey, revealed: false };
}

/** Persist that today's draw has been revealed so it stays revealed on reopen. */
export async function markRevealed(dateKey: string): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ dateKey, revealed: true } satisfies StoredDraw)
    );
  } catch {
    // Best-effort; the reveal still holds for this session if it fails.
  }
}
