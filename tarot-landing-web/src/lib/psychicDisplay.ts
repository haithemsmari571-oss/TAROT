// Shared, display-only presentation logic for psychic cards (both the
// /psychics-browse grid card and the homepage carousel card). Keeping it here
// means the halo colors, tier badges and cosmetic ratings stay in sync across
// both surfaces. NONE of this is persisted — see DISPLAY_RATINGS note below.

// --- Display-only ratings -----------------------------------------------------
// Psychics have no rating field in the DB (real ratings are averages of user
// reviews). Per product decision these are cosmetic values keyed by psychic id.
// Valentina (flagship) is the only 5.0; everyone else is unique with higher rate
// -> generally higher, natural variance. 12 psychics can't fit uniquely in
// 4.1–4.9 (only 9 slots), so the floor is extended to 3.9 to keep them distinct.
export const DISPLAY_RATINGS: Record<number, number> = {
  13: 5.0, // Valentina — flagship, $6.60/min
  4: 4.9, //  AMRIT     — $5.94
  10: 4.8, // SAMANTHA  — $5.40
  5: 4.7, //  BRITNEY   — $3.96
  8: 4.6, //  JESSICA   — $4.62
  6: 4.5, //  FATIMA    — $3.00
  12: 4.4, // YUSUF     — $3.60
  9: 4.3, //  MATT      — $2.94
  21: 4.2, // tabitha   — $3.00
  3: 4.1, //  ALEXIA    — $2.70
  11: 4.0, // SOPHIE    — $2.40
  7: 3.9, //  JAMIE     — $1.80
};

// --- Category -> halo color ---------------------------------------------------
// Keyed by the psychic's PRIMARY category (categories[0]), lowercased/trimmed.
export const CATEGORY_HALO: Record<string, string> = {
  // Love & relationships
  love: "#FF4D8D",
  "love reading": "#FF4D8D",
  romantic: "#FF4D8D",
  "relationship advice": "#FF5C72",

  // Career & finance
  career: "#F2AE40",
  finance: "#F2AE40",
  business: "#F2AE40",

  // Spiritual
  "spiritual guidance": "#D2B9FF",
  "spiritual counseling": "#D2B9FF",
  spiritual: "#D2B9FF",

  // Crystal & energy
  "crystal healing": "#00C9A7",
  "energy healing": "#00C9A7",
  "reiki healing": "#00C9A7",
  reiki: "#00C9A7",

  // Past life & soul
  "past life": "#9B59B6",
  "past life regression": "#9B59B6",
  "soul reading": "#BA68C8",

  // Aura
  "aura reading": "#64B5F6",
  aura: "#64B5F6",

  // Tarot
  "tarot reading": "#7B1FA2",
  tarot: "#7B1FA2",

  // Clairvoyance / Psychic medium
  clairvoyance: "#E040FB",
  "psychic medium": "#CE93D8",

  // Dream interpretation
  "dream interpretation": "#5C6BC0",
  dreams: "#5C6BC0",

  // Health
  health: "#66BB6A",
  wellness: "#66BB6A",

  // Divination (Valentina's primary category)
  divination: "#D2B9FF",

  // Astrology / horoscope / life path
  "horoscope insights": "#FFB300",
  astrology: "#FFB300",
  "life path guidance": "#FFB300",
  "life path": "#FFB300",

  // Shamanic
  "shamanic journeying": "#8D6E63",
  shamanic: "#8D6E63",

  // Default fallback
  default: "#8A63D2",
};

export type CategoryLike = { title?: string; name?: string };

export function getHaloColor(categories?: CategoryLike[]): string {
  if (!categories || categories.length === 0) return CATEGORY_HALO.default;
  // Real API uses `title`; original spec referenced `name` — support both.
  const primary = (categories[0]?.title || categories[0]?.name || "")
    .toLowerCase()
    .trim();
  return CATEGORY_HALO[primary] || CATEGORY_HALO.default;
}

// --- Tier (display only) ------------------------------------------------------
// `ratePerMinute` is price_per_second * 60.
export function getTier(
  ratePerMinute: number
): { label: string; gradient: string; color: string } {
  if (ratePerMinute < 3.5)
    return {
      label: "Rising",
      gradient: "linear-gradient(135deg, #9E9E9E, #E0E0E0)",
      color: "#C0C0C0", // silver
    };
  if (ratePerMinute <= 5.5)
    return {
      label: "Elite",
      gradient: "linear-gradient(135deg, #B8860B, #F2AE40, #FFD700)",
      color: "#F2AE40", // gold
    };
  return {
    label: "Master",
    gradient: "linear-gradient(135deg, #8A63D2, #D2B9FF, #8A63D2)",
    color: "#8A63D2", // purple
  };
}

export function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}
