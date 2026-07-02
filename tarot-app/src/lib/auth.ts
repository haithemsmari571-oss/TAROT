import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../api/client";

// Must match the key the axios client reads in src/api/client.ts
export const TOKEN_KEY = "auth_token";

export interface CurrentUser {
  id: number;
  username: string;
  email: string;
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

/**
 * Sign in with email + password. Stores the access token so the axios client
 * and the chat WebSocket can both use it. Returns the raw access token.
 */
export async function signIn(email: string, password: string): Promise<string> {
  const res = await api.post("/api/auth/sign-in", { email, password });
  const token: string | undefined = res.data?.access_token;
  if (!token) {
    throw new Error("No access token returned from sign-in.");
  }
  await setToken(token);
  return token;
}

/** Fetch the currently authenticated user (used to tell "my" messages apart). */
export async function fetchCurrentUser(): Promise<CurrentUser> {
  const res = await api.get("/api/profile/me");
  return res.data;
}
