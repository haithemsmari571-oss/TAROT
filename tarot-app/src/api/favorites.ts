import { api } from "./client";

// Favourite readers — ids only; the app joins them against the psychic list
// it already loads (photos, rates, online status come from there).

export async function getFavorites(): Promise<number[]> {
  // TEMP DEBUG: tracing the favourites bug — remove once diagnosed.
  console.log("[favorites] GET list — firing");
  const res = await api.get("/api/profile/me/favorites");
  console.log("[favorites] GET list — OK:", JSON.stringify(res.data));
  return res.data?.psychic_ids ?? [];
}

export async function addFavorite(psychicId: number): Promise<void> {
  // TEMP DEBUG: tracing the favourites bug — remove once diagnosed.
  console.log(`[favorites] POST add ${psychicId} — firing`);
  await api.post(`/api/profile/me/favorites/${psychicId}`);
  console.log(`[favorites] POST add ${psychicId} — OK`);
}

export async function removeFavorite(psychicId: number): Promise<void> {
  // TEMP DEBUG: tracing the favourites bug — remove once diagnosed.
  console.log(`[favorites] DELETE remove ${psychicId} — firing`);
  await api.delete(`/api/profile/me/favorites/${psychicId}`);
  console.log(`[favorites] DELETE remove ${psychicId} — OK`);
}
