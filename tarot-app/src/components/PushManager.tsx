import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useAuth } from "../context/AuthContext";
import {
  configureForegroundHandling,
  pushSupported,
  registerPushIfGranted,
} from "../lib/notifications";

// Invisible glue mounted once in the root layout:
//  • suppresses system banners while the app is open (the UI handles those
//    moments live),
//  • re-registers the device token on every sign-in,
//  • routes notification taps into the right chat (cold start included).
// Entirely inert in Expo Go (remote push needs a development build).

function chatParamsFromPayload(data: unknown): {
  chatId: string;
  title?: string;
  status?: string;
} | null {
  const d = (data ?? {}) as Record<string, unknown>;
  const chatId = Number(d.chat_id);
  if (!Number.isFinite(chatId)) return null;
  return {
    chatId: String(chatId),
    ...(typeof d.psychic_name === "string" && d.psychic_name
      ? { title: d.psychic_name }
      : {}),
    // An accepted reading is live — arm the session UI on arrival.
    ...(d.type === "chat_accepted" ? { status: "ACTIVE" } : {}),
  };
}

export default function PushManager() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    configureForegroundHandling();
  }, []);

  // Tokens are per-device; accounts are not. Re-register whenever a user
  // signs in, if permission was already granted.
  useEffect(() => {
    if (user) void registerPushIfGranted();
  }, [user]);

  // Taps open the relevant chat directly.
  useEffect(() => {
    if (!pushSupported) return;

    const open = (data: unknown) => {
      const params = chatParamsFromPayload(data);
      if (!params) return;
      router.push({ pathname: "/sessions/[chatId]", params });
    };

    // Cold start: the app was launched by tapping a notification. Small delay
    // so the root navigator is mounted before we push.
    let cancelled = false;
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response || cancelled) return;
      const data = response.notification.request.content.data;
      setTimeout(() => {
        if (!cancelled) open(data);
      }, 500);
    });

    // Warm taps (app backgrounded).
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => open(response.notification.request.content.data)
    );
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [router]);

  return null;
}
