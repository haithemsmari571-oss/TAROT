import axios, { AxiosError } from "axios";
import {
  getToken,
  getRefreshToken,
  saveToken,
  saveRefreshToken,
  clearTokens,
  isTokenExpired
} from "@/features/auth/utils";
import { OWNER_SIGN_IN_PATH, isOwnerPath } from "@/features/owner/ownerPaths";

/* Where a session that cannot be refreshed signs in again: on the owner's
   pages, the owner's own sign-in, so AV Admin never leaves /owner for the
   website's /login, which sends the superadmin on to the CRM (ROUND55);
   everywhere else /login. */
function signInPathHere(): string {
  return isOwnerPath(window.location.pathname) ? OWNER_SIGN_IN_PATH : "/login";
}

const axiosClient = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api`,
  withCredentials: false,
  headers: {
    Accept: "application/json",
    "Accept-Language": "en",
  },
});

// --- Production write-guard ---------------------------------------------------
// When a LOCAL dev build is pointed at the live production API, block mutating
// requests so local experiments can't alter real data. Auth endpoints stay
// allowed so you can still log in to browse authenticated views. To run fully
// local (writes enabled), set VITE_API_URL back to http://localhost:8000.
const API_BASE = import.meta.env.VITE_API_URL ?? "";
const PROD_WRITE_GUARD =
  import.meta.env.DEV && /askvalentina\.co\.uk/i.test(API_BASE);
const WRITE_METHODS = new Set(["post", "put", "patch", "delete"]);
const GUARD_ALLOWLIST = ["/auth/sign-in", "/auth/refresh-token"];

if (PROD_WRITE_GUARD) {
  console.warn(
    `[axiosClient] Local dev is connected to the PRODUCTION API (${API_BASE}). ` +
      "Write requests (POST/PUT/PATCH/DELETE) are BLOCKED to protect live data. " +
      "Set VITE_API_URL to http://localhost:8000 to enable them."
  );
}

/* One refresh at a time, shared by the 401 handler below and AuthContext's
   start (ROUND65): whoever asks while one is running gets the same answer, so
   the server sees a single POST. Resolves with the new access token, already
   saved; rejects with the request's error and clears nothing (each caller
   decides what a failure means). */
let refreshing: Promise<string> | null = null;

export function refreshSession(): Promise<string> {
  refreshing ??= (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) throw new Error("No refresh token stored");

    console.log("Attempting to refresh token...");
    const response = await axios.post(
      `${import.meta.env.VITE_API_URL}/api/auth/refresh-token`,
      { refresh_token: refreshToken }
    );

    const { access_token, refresh_token: new_refresh_token } = response.data;
    console.log("Token refresh successful");

    saveToken(access_token);
    if (new_refresh_token) {
      saveRefreshToken(new_refresh_token);
    }
    return access_token as string;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

axiosClient.interceptors.request.use(
  (config) => {
    // Block mutating calls when local dev is aimed at the production API.
    if (PROD_WRITE_GUARD) {
      const method = (config.method ?? "get").toLowerCase();
      const url = config.url ?? "";
      const isAllowed = GUARD_ALLOWLIST.some((path) => url.includes(path));
      if (WRITE_METHODS.has(method) && !isAllowed) {
        return Promise.reject(
          new Error(
            `[prod-write-guard] Blocked ${method.toUpperCase()} ${url} — local dev ` +
              "is connected to the production API. This write was prevented to avoid " +
              "modifying live data. Point VITE_API_URL at a local backend to allow it."
          )
        );
      }
    }

    const token = getToken();
    if (token) {
      // Check if token is expired before making request
      if (isTokenExpired(token)) {
        console.log("Token expired in request interceptor, will be refreshed");
      }
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

axiosClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean };

    // Don't try to refresh if we're already on the login page or if this is a login/refresh request
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/sign-in') ||
                           originalRequest?.url?.includes('/auth/sign-up') ||
                           originalRequest?.url?.includes('/auth/refresh-token');
    
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      // Refreshed since this request left (by AuthContext's start or another
      // 401): retry with the new token instead of refreshing again.
      const storedToken = getToken();
      if (
        storedToken &&
        !isTokenExpired(storedToken) &&
        originalRequest.headers &&
        originalRequest.headers.Authorization !== `Bearer ${storedToken}`
      ) {
        originalRequest.headers.Authorization = `Bearer ${storedToken}`;
        return axiosClient(originalRequest);
      }

      const refreshToken = getRefreshToken();

      if (!refreshToken) {
        // No refresh token, redirect to login
        clearTokens();
        const signInPath = signInPathHere();
        if (window.location.pathname !== signInPath) {
          window.location.href = signInPath;
        }
        return Promise.reject(error);
      }

      try {
        // The one shared refresh: requests that fail together wait for it.
        const access_token = await refreshSession();

        // Update the authorization header
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
        }

        // Retry the original request
        return axiosClient(originalRequest);
      } catch (refreshError: any) {
        console.error("Token refresh failed:", refreshError?.response?.status, refreshError?.response?.data);
        // Refresh failed, clear tokens and redirect
        clearTokens();
        const signInPath = signInPathHere();
        if (window.location.pathname !== signInPath) {
          console.log("Redirecting to login after refresh failure");
          window.location.href = signInPath;
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default axiosClient;
