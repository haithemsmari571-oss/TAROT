// Shared, display-only presentation logic for psychic cards (both the
// /psychics-browse grid card and the homepage carousel card): the halo
// colour keyed by a psychic's primary category. NONE of this is persisted.

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

export function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}
