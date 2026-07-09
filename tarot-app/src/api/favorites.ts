import { api } from "./client";

// Favourite readers — ids only; the app joins them against the psychic list
// it already loads (photos, rates, online status come from there).

export async function getFavorites(): Promise<number[]> {
  const res = await api.get("/api/profile/me/favorites");
  return res.data?.psychic_ids ?? [];
}

export async function addFavorite(psychicId: number): Promise<void> {
  await api.post(`/api/profile/me/favorites/${psychicId}`);
}

export async function removeFavorite(psychicId: number): Promise<void> {
  await api.delete(`/api/profile/me/favorites/${psychicId}`);
}
