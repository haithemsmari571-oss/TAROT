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

/**
 * Request a password-reset email. The backend answers with the same generic
 * message whether or not the email exists (never leaks registered addresses),
 * and the emailed link expires after 5 minutes.
 */
export async function forgotPassword(email: string): Promise<void> {
  await api.post("/api/auth/forgot-password", { email });
}

/**
 * Re-send the account verification email. Unlike forgot-password this DOES
 * error for unknown emails (404) and already-verified accounts (400) — the
 * error body carries `message`, not `detail`.
 */
export async function resendVerification(email: string): Promise<void> {
  await api.post("/api/auth/resend-verify-email", { email });
}

/**
 * Change the signed-in user's password. Wrong current password -> 400 with
 * {message: "Current password is incorrect"}.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await api.post("/api/profile/me/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

/**
 * Update own profile fields (only username / bio / date_of_birth are accepted
 * by the backend schema). date_of_birth is ISO "YYYY-MM-DD". Duplicate
 * username -> 400/409 with a UserAlreadyExists message.
 */
export async function updateProfile(fields: {
  username?: string;
  date_of_birth?: string;
  bio?: string;
}): Promise<void> {
  await api.patch("/api/profile/me", fields);
}

/**
 * Permanently delete (soft-delete + anonymize) the signed-in account.
 * Irreversible. The server blocks it with 409 while a reading is in progress
 * and invalidates every token on success — callers must sign out locally
 * right after. Remaining Stardust is forfeited (warn before calling).
 */
export async function deleteAccount(): Promise<void> {
  await api.delete("/api/profile/me");
}
