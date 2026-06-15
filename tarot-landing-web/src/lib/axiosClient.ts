import axios, { AxiosError } from "axios";
import { 
  getToken, 
  getRefreshToken, 
  saveToken, 
  saveRefreshToken, 
  clearTokens,
  isTokenExpired 
} from "@/features/auth/utils";

const axiosClient = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL}/api`,
  withCredentials: false,
  headers: {
    Accept: "application/json",
    "Accept-Language": "en",
  },
});

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
