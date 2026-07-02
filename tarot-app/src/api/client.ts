import axios from "axios";
import { API_BASE_URL } from "./config";
import { getAccessToken } from "../lib/tokens";
import { refreshAccessToken } from "../lib/refresh";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach the current access token to every request.
api.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, refresh the access token once and retry the original request.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as
      | (typeof error.config & { _retry?: boolean })
      | undefined;
    const url: string = original?.url ?? "";
    const isAuthEndpoint = url.includes("/auth/"); // sign-in / sign-up / refresh

    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !isAuthEndpoint
    ) {
      original._retry = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization =
          `Bearer ${newToken}`;
        return api(original);
      }
    }

    return Promise.reject(error);
  }
);
