import AsyncStorage from "@react-native-async-storage/async-storage";

const ACCESS_KEY = "auth_token"; // must match what older builds stored
const REFRESH_KEY = "refresh_token";

export async function getAccessToken(): Promise<string | null> {
  return AsyncStorage.getItem(ACCESS_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_KEY);
}

export async function saveTokens(
  access: string,
  refresh?: string | null
): Promise<void> {
  await AsyncStorage.setItem(ACCESS_KEY, access);
  if (refresh) {
    await AsyncStorage.setItem(REFRESH_KEY, refresh);
  }
}

export async function clearTokens(): Promise<void> {
  await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
}

/**
 * True only when we can confirm the JWT is at/near expiry. If the token can't
 * be decoded, returns false so callers use it as-is (reactive 401 handling
 * still covers a genuinely-expired token).
 */
export function isJwtExpired(token: string, skewSeconds = 30): boolean {
  const exp = decodeExp(token);
  if (exp == null) return false;
  return Math.floor(Date.now() / 1000) >= exp - skewSeconds;
}

function decodeExp(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part || typeof atob !== "function") return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload?.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}
