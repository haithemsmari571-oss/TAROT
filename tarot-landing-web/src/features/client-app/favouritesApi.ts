/* The client's favourite readers, as the backend keeps them: one row per
   (user, psychic) in favorite_psychics, served by
   TAROT-BACKEND/app/routers/profile.py:198-289 under /api/profile/me/favorites.
   The list answers ids only, newest first (:214-221). Add and remove are
   idempotent and answer 200 either way (:224-259, :262-289); an id that is
   not a reader answers 404 (:240-246). */
import axiosClient from "@/lib/axiosClient";

export const FAVOURITES_PATH = "/profile/me/favorites";

/** GET /profile/me/favorites (profile.py:219-221) */
interface FavouritesList { psychic_ids: number[] }

export const favouritesApi = {
  list: async (signal?: AbortSignal): Promise<number[]> => {
    const { data } = await axiosClient.get<FavouritesList>(FAVOURITES_PATH, { signal });
    return data.psychic_ids;
  },
  add: async (psychicId: number): Promise<void> => {
    await axiosClient.post(`${FAVOURITES_PATH}/${psychicId}`);
  },
  remove: async (psychicId: number): Promise<void> => {
    await axiosClient.delete(`${FAVOURITES_PATH}/${psychicId}`);
  },
};
