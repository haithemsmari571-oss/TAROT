import { api } from "./client";

// Client for the backend zodiac compatibility engine
// (TAROT-BACKEND app/routers/zodiac.py, mounted at /api/zodiac).

export interface CosmicBond {
  user_sign: string;
  partner_sign: string;
  love_percentage: number;
  communication_percentage: number;
  emotional_bond_percentage: number;
  overall_harmony_percentage: number;
  elemental_insight: string;
  compatibility_description: string | null;
}

/**
 * Cosmic bond between two birthdays. The backend expects DD/MM/YYYY strings
 * (see BirthdayCompatibilityRequest) and works out both signs itself.
 */
export async function getBirthdayCompatibility(
  userBirthday: string,
  partnerBirthday: string
): Promise<CosmicBond> {
  const res = await api.post("/api/zodiac/birthday-compatibility", {
    user_birthday: userBirthday,
    partner_birthday: partnerBirthday,
  });
  return res.data;
}
