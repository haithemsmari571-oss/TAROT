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
  signUp as apiSignUp,
  type CurrentUser,
} from "../lib/auth";
import { setOnAuthFailure } from "../lib/refresh";

/**
 * Outcome of a sign-up attempt. On prod, new accounts must verify their email
 * before sign-in works, so registration can succeed without an active session.
 */
export type SignUpResult =
  | { status: "signed-in" }
  | { status: "needs-verification"; email: string };

interface AuthState {
  user: CurrentUser | null;
  loading: boolean; // true while restoring a stored session on startup
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    username: string,
    email: string,
    password: string
  ) => Promise<SignUpResult>;
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

  // When a token refresh definitively fails (refresh token expired), drop to a
  // signed-out state so the UI reflects it.
  useEffect(() => {
    setOnAuthFailure(() => setUser(null));
    return () => setOnAuthFailure(null);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await apiSignIn(email, password);
    setUser(await fetchCurrentUser());
  }, []);

  const signUp = useCallback(
    async (
      username: string,
      email: string,
      password: string
    ): Promise<SignUpResult> => {
      // Create the account first. A failure here (e.g. email already in use) is
      // surfaced to the caller so it can show the backend's message.
      await apiSignUp(username, email, password);

      // Registration returns no tokens, so sign in to capture them. On prod the
      // account isn't verified yet, so this sign-in is expected to fail with
      // "Account not verified" — treat any post-signup sign-in failure as the
      // verification gate rather than a hard error, since the account exists.
      try {
        await apiSignIn(email, password);
        setUser(await fetchCurrentUser());
        return { status: "signed-in" };
      } catch {
        return { status: "needs-verification", email };
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    await clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
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
