import { COLORS } from "../../../theme";
import type { Psychic } from "../../browse/types/psychic.types";

// Re-export the backend-aligned Psychic type
export type { Psychic };

export interface Availability {
  day_of_the_week: string;
  start_at: string;
  end_at: string;
}

export const getCategoryColor = (categoryTitle: string) => {
  const normalizedTitle = categoryTitle.toLowerCase();
  
  if (normalizedTitle.includes("astrology")) return COLORS.primary;
  if (normalizedTitle.includes("tarot")) return COLORS.primaryDark; 
  if (normalizedTitle.includes("reiki")) return "#4ADE80"; 
  if (normalizedTitle.includes("medium")) return COLORS.starGold;
  if (normalizedTitle.includes("numerology")) return "#F59E0B";
  
  return COLORS.neutralGray;
};