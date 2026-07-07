import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../api/client";

// ─────────────────────────────────────────────────────────────────────────────
// Expo push plumbing. IMPORTANT: since SDK 53, REMOTE push does not work in
// Expo Go — it needs a development/production build (EAS). Everything here
// no-ops silently in Expo Go so nothing crashes during Go testing; the real
// dialog/token/deep-link path lights up in a dev build.
// ─────────────────────────────────────────────────────────────────────────────

export const isExpoGo =
  Constants.executionEnvironment === "storeClient" ||
  Constants.appOwnership === "expo";

/** Remote push is available (i.e. we're in a real build, not Expo Go). */
export const pushSupported = !isExpoGo;

// Once she says "Not now" to OUR sheet, never auto-nag again. (The quiet
// re-entry point lives in PROFILE.)
const PROMPT_DECLINED_KEY = "push_prompt_declined_v1";

export type PushPermission =
  | "unsupported" // Expo Go — feature off
  | "granted"
  | "denied"
  | "undetermined";

/**
 * Foreground behavior: show NOTHING while the app is open — every push event
 * (reading accepted, new message) is already handled live by the UI (INCOMING
 * READING modal, open chat). System banners are for locked/background only.
 */
export function configureForegroundHandling(): void {
  if (!pushSupported) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Android needs a channel before anything can display (API 26+). */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Readings & messages",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#D2B9FF",
  });
}

export async function getPushPermission(): Promise<PushPermission> {
  if (!pushSupported) return "unsupported";
  try {
    const s = await Notifications.getPermissionsAsync();
    return s.status as PushPermission;
  } catch {
    return "unsupported";
  }
}

/**
 * Should we show OUR branded pre-permission sheet? Only when the OS dialog
 * would actually appear (never asked yet, or askable again) and she hasn't
 * already told us "Not now".
 */
export async function shouldOfferPushPrompt(): Promise<boolean> {
  if (!pushSupported) return false;
  try {
    if (await AsyncStorage.getItem(PROMPT_DECLINED_KEY)) return false;
    const s = await Notifications.getPermissionsAsync();
    if (s.status === "granted") return false;
    return s.status === "undetermined" || s.canAskAgain === true;
  } catch {
    return false;
  }
}

export async function markPushPromptDeclined(): Promise<void> {
  try {
    await AsyncStorage.setItem(PROMPT_DECLINED_KEY, "1");
  } catch {
    // best effort
  }
}

/** Fetch the Expo token and register it with the backend. */
async function fetchAndRegisterToken(): Promise<boolean> {
  const projectId =
    (Constants.expoConfig as any)?.extra?.eas?.projectId ??
    (Constants as any)?.easConfig?.projectId;
  if (!projectId) {
    // No EAS project configured yet (needs `eas init`) — degrade silently.
    console.warn("[push] no EAS projectId — skipping token registration");
    return false;
  }
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.post("/api/profile/me/push-token", {
    token: token.data,
    platform: Platform.OS,
  });
  return true;
}

/**
 * Trigger the REAL OS permission dialog (call only from an explicit user
 * action), then register the device token on grant. Returns whether push is
 * now active.
 */
export async function requestPushPermissionAndRegister(): Promise<boolean> {
  if (!pushSupported) return false;
  try {
    await ensureAndroidChannel();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== "granted") return false;
    return await fetchAndRegisterToken();
  } catch (e) {
    console.warn("[push] enable failed:", e);
    return false;
  }
}

/**
 * Silent re-registration for already-granted permission — run on every
 * sign-in, since tokens are per-device but accounts are not.
 */
export async function registerPushIfGranted(): Promise<void> {
  if (!pushSupported) return;
  try {
    const s = await Notifications.getPermissionsAsync();
    if (s.status !== "granted") return;
    await ensureAndroidChannel();
    await fetchAndRegisterToken();
  } catch {
    // silent — retried on next sign-in
  }
}
