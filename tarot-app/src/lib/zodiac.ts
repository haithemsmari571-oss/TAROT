import type { ImageSourcePropType } from "react-native";

// Per-sign presentation helpers for the SANCTUARY.
//
// ART NOTE: 10 of 12 dedicated sign portraits live in assets/zodiac/ (webp,
// processed from assets/zodiac-raw). Cancer and Pisces don't have art yet —
// they fall back to their element's scene with a large sign-glyph watermark
// (hasDedicatedPortrait() is how screens know to draw it). When
// cancer-portrait.png / pisces-portrait.png appear in zodiac-raw, process them
// the same way and add the two require lines below — nothing else changes.

export type Element = "fire" | "earth" | "air" | "water";

const SIGN_ELEMENTS: Record<string, Element> = {
  aries: "fire",
  leo: "fire",
  sagittarius: "fire",
  taurus: "earth",
  virgo: "earth",
  capricorn: "earth",
  gemini: "air",
  libra: "air",
  aquarius: "air",
  cancer: "water",
  scorpio: "water",
  pisces: "water",
};

const SIGN_GLYPHS: Record<string, string> = {
  aries: "♈",
  taurus: "♉",
  gemini: "♊",
  cancer: "♋",
  leo: "♌",
  virgo: "♍",
  libra: "♎",
  scorpio: "♏",
  sagittarius: "♐",
  capricorn: "♑",
  aquarius: "♒",
  pisces: "♓",
};

const ELEMENT_SCENES: Record<Element, ImageSourcePropType> = {
  fire: require("../../assets/backgrounds/zodiac-hall-1.webp"),
  earth: require("../../assets/backgrounds/zodiac-hall-2.webp"),
  air: require("../../assets/backgrounds/zodiac-hall-3.webp"),
  water: require("../../assets/backgrounds/zodiac-hall-4.webp"),
};

const DEFAULT_SCENE: ImageSourcePropType = require("../../assets/backgrounds/celestial-portal.webp");

// Dedicated sign portraits (assets/zodiac/<sign>.webp). Cancer + Pisces
// pending — add their lines here once the art is processed.
const SIGN_PORTRAITS: Record<string, ImageSourcePropType> = {
  aries: require("../../assets/zodiac/aries.webp"),
  taurus: require("../../assets/zodiac/taurus.webp"),
  gemini: require("../../assets/zodiac/gemini.webp"),
  leo: require("../../assets/zodiac/leo.webp"),
  virgo: require("../../assets/zodiac/virgo.webp"),
  libra: require("../../assets/zodiac/libra.webp"),
  scorpio: require("../../assets/zodiac/scorpio.webp"),
  sagittarius: require("../../assets/zodiac/sagittarius.webp"),
  capricorn: require("../../assets/zodiac/capricorn.webp"),
  aquarius: require("../../assets/zodiac/aquarius.webp"),
};

/** Normalized lookup key for a backend sign name ("Pisces" → "pisces"). */
export function signKey(sign: string | null | undefined): string {
  return (sign ?? "").toLowerCase().trim();
}

export function signGlyph(sign: string | null | undefined): string {
  return SIGN_GLYPHS[signKey(sign)] ?? "✦";
}

export function signElement(sign: string | null | undefined): Element | null {
  return SIGN_ELEMENTS[signKey(sign)] ?? null;
}

/** True when the sign has its dedicated artwork (vs the glyph placeholder). */
export function hasDedicatedPortrait(
  sign: string | null | undefined
): boolean {
  return signKey(sign) in SIGN_PORTRAITS;
}

/** Sign hero artwork — dedicated portrait, else element scene (see ART NOTE). */
export function signPortrait(
  sign: string | null | undefined
): ImageSourcePropType {
  const dedicated = SIGN_PORTRAITS[signKey(sign)];
  if (dedicated) return dedicated;
  const el = signElement(sign);
  return el ? ELEMENT_SCENES[el] : DEFAULT_SCENE;
}

// ── Cosmic Weather ──────────────────────────────────────────────────────────
// Three glanceable meters for (sign, date). Deterministic — the same sign sees
// the same weather all day, and friends with the same sign can compare.

export interface CosmicWeatherValues {
  love: number; // 0-100
  clarity: number;
  energy: number;
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

/** Values live in 38-96 so no meter ever reads as "your day is ruined". */
export function cosmicWeather(
  sign: string | null | undefined,
  isoDate: string
): CosmicWeatherValues {
  const rng = makeRng(`${signKey(sign)}:${isoDate}`);
  const roll = () => Math.floor(38 + rng() * 59);
  return { love: roll(), clarity: roll(), energy: roll() };
}
