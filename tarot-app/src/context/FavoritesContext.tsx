import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { addFavorite, getFavorites, removeFavorite } from "../api/favorites";
import { useAuth } from "./AuthContext";

// App-wide favourite-readers state. Loaded once per sign-in; every heart
// (browse card, psychic profile, favourites filter) reads and toggles the
// same set. Toggles are optimistic — the heart flips instantly and quietly
// rolls back if the server call fails.

interface FavoritesState {
  /** Favourited psychic ids. Empty while signed out or still loading. */
  ids: ReadonlySet<number>;
  isFavorite: (psychicId: number) => boolean;
  toggle: (psychicId: number) => Promise<void>;
  refresh: () => Promise<void>;
}

const FavoritesContext = createContext<FavoritesState>({
  ids: new Set(),
  isFavorite: () => false,
  toggle: async () => {},
  refresh: async () => {},
});

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ids, setIds] = useState<Set<number>>(new Set());

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      setIds(new Set(await getFavorites()));
    } catch (err: any) {
      // Keep the last known set on a transient failure — but never silently:
      // an invisible catch here cost us a whole debugging round.
      console.warn(
        "[favorites] refresh failed:",
        err?.response?.status ?? "(no response)",
        JSON.stringify(err?.response?.data ?? err?.message ?? String(err))
      );
    }
  }, [user]);

  // Load on sign-in, clear on sign-out.
  useEffect(() => {
    if (!user) {
      setIds(new Set());
      return;
    }
    refresh();
  }, [user, refresh]);

  const toggle = useCallback(
    async (psychicId: number) => {
      const wasFavorite = ids.has(psychicId);
      // Optimistic flip.
      setIds((cur) => {
        const next = new Set(cur);
        if (wasFavorite) next.delete(psychicId);
        else next.add(psychicId);
        return next;
      });
      try {
        if (wasFavorite) await removeFavorite(psychicId);
        else await addFavorite(psychicId);
      } catch (err: any) {
        // Roll back — but log WHAT failed. "Network Error" with no status
        // means the request never left the device; a status + body names the
        // server's rejection.
        console.warn(
          `[favorites] toggle ${psychicId} failed:`,
          err?.response?.status ?? "(no response)",
          JSON.stringify(err?.response?.data ?? err?.message ?? String(err))
        );
        setIds((cur) => {
          const next = new Set(cur);
          if (wasFavorite) next.add(psychicId);
          else next.delete(psychicId);
          return next;
        });
      }
    },
    [ids]
  );

  const isFavorite = useCallback((psychicId: number) => ids.has(psychicId), [ids]);

  return (
    <FavoritesContext.Provider value={{ ids, isFavorite, toggle, refresh }}>
      {children}
    </FavoritesContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFavorites(): FavoritesState {
  return useContext(FavoritesContext);
}
