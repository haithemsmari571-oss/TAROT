import axios from "axios";
import { API_BASE_URL } from "../api/config";
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  isJwtExpired,
  saveTokens,
} from "./tokens";

// Called when refresh definitively fails (refresh token invalid/expired) so the
// UI can drop to a signed-out state. AuthContext registers this.
let onAuthFailure: (() => void) | null = null;
export function setOnAuthFailure(cb: (() => void) | null): void {
  onAuthFailure = cb;
}

// Dedupe concurrent refreshes: many requests may 401 at once, but only one
// refresh call should go out; the rest await the same promise.
let inflight: Promise<string | null> | null = null;

export function refreshAccessToken(): Promise<string | null> {
  if (!inflight) {
    inflight = doRefresh().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function doRefresh(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) return null; // not signed in — nothing to refresh

  try {
    // Bare axios (not the intercepted client) to avoid recursive refresh.
    const res = await axios.post(`${API_BASE_URL}/api/auth/refresh-token`, {
      refresh_token: refreshToken,
    });
    const access: string | undefined = res.data?.access_token;
    if (!access) throw new Error("No access token in refresh response");
    await saveTokens(access, res.data?.refresh_token);
    return access;
  } catch {
    // Refresh token is invalid/expired → force a clean signed-out state.
    await clearTokens();
    onAuthFailure?.();
    return null;
  }
}

/**
 * Returns a usable access token, refreshing first if it's expired. Use this for
 * non-axios callers (e.g. the chat WebSocket) that can't rely on the 401
 * response interceptor.
 */
export async function getValidAccessToken(): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) return null;
  if (!isJwtExpired(token)) return token;
  return refreshAccessToken();
}
