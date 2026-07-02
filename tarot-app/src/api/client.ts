import axios from "axios";

export const api = axios.create({
  baseURL: "https://askvalentina.co.uk",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach auth token if available
api.interceptors.request.use(async (config) => {
  const AsyncStorage = (
    await import("@react-native-async-storage/async-storage")
  ).default;
  const token = await AsyncStorage.getItem("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
