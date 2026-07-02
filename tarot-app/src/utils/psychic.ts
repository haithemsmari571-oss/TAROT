import { COLORS } from "../theme/colors";

// Category -> halo color (mirrors the web app)
export const CATEGORY_HALO: Record<string, string> = {
  love: "#FF4D8D",
  "love reading": "#FF4D8D",
  romantic: "#FF4D8D",
  "relationship advice": "#FF5C72",
  career: "#F2AE40",
  finance: "#F2AE40",
  business: "#F2AE40",
  "spiritual guidance": "#D2B9FF",
  "spiritual counseling": "#D2B9FF",
  spiritual: "#D2B9FF",
  "crystal healing": "#00C9A7",
  "energy healing": "#00C9A7",
  "reiki healing": "#00C9A7",
  reiki: "#00C9A7",
  "past life": "#9B59B6",
  "past life regression": "#9B59B6",
  "soul reading": "#BA68C8",
  "aura reading": "#64B5F6",
  aura: "#64B5F6",
  "tarot reading": "#7B1FA2",
  tarot: "#7B1FA2",
  clairvoyance: "#E040FB",
  "psychic medium": "#CE93D8",
  "dream interpretation": "#5C6BC0",
  dreams: "#5C6BC0",
  health: "#66BB6A",
  wellness: "#66BB6A",
  divination: "#D2B9FF",
  "horoscope insights": "#FFB300",
  astrology: "#FFB300",
  "life path guidance": "#FFB300",
  "life path": "#FFB300",
  "shamanic journeying": "#8D6E63",
  shamanic: "#8D6E63",
  default: "#8A63D2",
};

// Turn a 6-digit hex into an rgba() string (RN needs this for opacity blends).
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getHalo(categories?: { title?: string }[]): string {
  if (!categories?.length) return CATEGORY_HALO.default;
  const primary = (categories[0]?.title || "").toLowerCase().trim();
  return CATEGORY_HALO[primary] || CATEGORY_HALO.default;
}

export function getTier(
  pricePerSecond: number | null
): { label: string; color: string } {
  const perMin = (pricePerSecond || 0) * 60;
  if (perMin < 3.5) return { label: "Rising", color: COLORS.rising };
  if (perMin <= 5.5) return { label: "Elite", color: COLORS.elite };
  return { label: "Master", color: COLORS.master };
}

export function perMinute(pricePerSecond: number | null): string {
  return ((pricePerSecond || 0) * 60).toFixed(2);
}
