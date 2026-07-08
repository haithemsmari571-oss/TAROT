import { api } from "../api/client";
import { clearTokens, getAccessToken, saveTokens } from "./tokens";

export interface CurrentUser {
  id: number;
  username: string;
  email: string;
  /** ISO "YYYY-MM-DD"; null for accounts created before DOB capture. */
  date_of_birth?: string | null;
}

// Re-exported for existing callers (AuthContext, chat hook).
export const getToken = getAccessToken;
export const clearToken = clearTokens;

/**
 * Sign in with email + password. Stores BOTH the access token and the refresh
 * token so the axios client and the WebSocket can auth, and so expired access
 * tokens can be refreshed transparently.
 */
export async function signIn(email: string, password: string): Promise<string> {
  const res = await api.post("/api/auth/sign-in", { email, password });
  const access: string | undefined = res.data?.access_token;
  if (!access) {
    throw new Error("No access token returned from sign-in.");
  }
  await saveTokens(access, res.data?.refresh_token);
  return access;
}

/**
 * Register a new account. The backend returns a confirmation message (and sends
 * a verification email) but NOT tokens, so callers must sign in separately to
 * capture the access + refresh tokens.
 *
 * `dateOfBirth` must be an ISO "YYYY-MM-DD" string — the backend's UserSignup
 * schema requires date_of_birth (it powers zodiac/horoscope personalisation)
 * and rejects future dates or ages over 120.
 */
export async function signUp(
  username: string,
  email: string,
  password: string,
  dateOfBirth: string
): Promise<void> {
  await api.post("/api/auth/sign-up", {
    username,
    email,
    password,
    date_of_birth: dateOfBirth,
  });
}

/** Fetch the currently authenticated user (used to tell "my" messages apart). */
export async function fetchCurrentUser(): Promise<CurrentUser> {
  const res = await api.get("/api/profile/me");
  return res.data;
}
