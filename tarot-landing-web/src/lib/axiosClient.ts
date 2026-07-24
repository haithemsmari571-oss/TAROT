import axios, { AxiosError } from "axios";
import {
  getToken,
  getRefreshToken,
  saveToken,
  saveRefreshToken,
  clearTokens,
  isTokenExpired
} from "@/features/auth/utils";
import { classifyDestructive, divertToVulcan, isVulcanEmbedActive } from "./vulcanEmbed";

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

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  failedQueue = [];
};

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

    // Vulcan embedded mode: when this panel runs inside the CRM's Vulcan room,
    // divert destructive writes to the CRM approval gateway instead of firing
    // them directly. Inactive (and a no-op) in the standalone panel.
    if (isVulcanEmbedActive()) {
      const method = (config.method ?? "get").toLowerCase();
      if (WRITE_METHODS.has(method)) {
        const apiPath = `/api${config.url ?? ""}`;
        const verdict = classifyDestructive(method, apiPath, config.data);
        if (verdict.destructive) {
          divertToVulcan(method, apiPath, config.data, verdict.reason);
          return Promise.reject(
            new Error(`[vulcan] "${verdict.reason}" was sent to the Second Brain approval inbox instead of running directly.`)
          );
        }
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
      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return axiosClient(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = getRefreshToken();

      if (!refreshToken) {
        // No refresh token, redirect to login
        clearTokens();
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }

      try {
        console.log("Attempting to refresh token...");
        // Try to refresh the token
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL}/api/auth/refresh-token`,
          { refresh_token: refreshToken }
        );

        const { access_token, refresh_token: new_refresh_token } = response.data;
        console.log("Token refresh successful");

        // Save new tokens
        saveToken(access_token);
        if (new_refresh_token) {
          saveRefreshToken(new_refresh_token);
        }

        // Update the authorization header
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
        }

        // Process queued requests
        processQueue(null, access_token);

        // Retry the original request
        return axiosClient(originalRequest);
      } catch (refreshError: any) {
        console.error("Token refresh failed:", refreshError?.response?.status, refreshError?.response?.data);
        // Refresh failed, clear tokens and redirect
        processQueue(refreshError as Error, null);
        clearTokens();
        if (window.location.pathname !== "/login") {
          console.log("Redirecting to login after refresh failure");
          window.location.href = "/login";
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default axiosClient;
