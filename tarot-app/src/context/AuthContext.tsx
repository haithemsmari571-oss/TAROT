import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  clearToken,
  fetchCurrentUser,
  getToken,
  signIn as apiSignIn,
  type CurrentUser,
} from "../lib/auth";

interface AuthState {
  user: CurrentUser | null;
  loading: boolean; // true while restoring a stored session on startup
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On startup, if a token is already stored, restore the user session.
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          setUser(await fetchCurrentUser());
        }
      } catch {
        // Stored token is invalid/expired — drop it and stay logged out.
        await clearToken();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await apiSignIn(email, password);
    setUser(await fetchCurrentUser());
  }, []);

  const signOut = useCallback(async () => {
    await clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
