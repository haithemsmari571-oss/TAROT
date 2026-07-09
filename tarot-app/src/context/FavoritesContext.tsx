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
    } catch {
      // Keep the last known set on a transient failure.
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
      } catch {
        // Roll back quietly — the heart just returns to its previous state.
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
