import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AppState,
  Image,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { pushSupported } from "../lib/notifications";
import {
  COLORS,
  FONTS,
  SPACING,
  RADII,
  TOUCH_TARGET,
  alpha,
} from "../theme";
import { useAuth } from "./AuthContext";
import { useRingtone } from "../hooks/useRingtone";
import { getValidAccessToken } from "../lib/refresh";
import { api } from "../api/client";
import { getMyChats } from "../api/chat";
import {
  NotificationSocket,
  type AppNotification,
} from "../api/notificationSocket";

interface IncomingCall {
  chatId: number;
  psychicName: string;
  psychicPhoto: string | null;
}

interface CallState {
  incomingCall: IncomingCall | null;
}

const CallContext = createContext<CallState>({ incomingCall: null });

/**
 * Keeps a global notifications WebSocket open while signed in. When the psychic
 * accepts (CHAT_ACCEPTED), the client is "called": a looping ringtone plays and
 * a full-screen prompt appears over any screen. Joining opens the chat (which
 * anchors the session timer); dismissing just silences the ring.
 *
 * The same overlay is raised by all three feeds of the accept moment — the
 * WebSocket event, a foreground push, and a TAP on the system notification
 * (backgrounded/killed app) — deduped by chat id so only the first presents.
 */
export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const ringtone = useRingtone();

  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  const socketRef = useRef<NotificationSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep the latest ring controls in a ref so the socket handler isn't stale.
  const ringRef = useRef(ringtone);
  ringRef.current = ringtone;

  // The current call's chat id, for deduping the two feeds (WS + push): the
  // accept moment can arrive over both; only the first one rings.
  const currentCallChatId = useRef<number | null>(null);

  const clearCall = useCallback(() => {
    ringRef.current.stop();
    currentCallChatId.current = null;
    setIncomingCall(null);
  }, []);

  const presentCall = useCallback(
    (chatId: number, psychicName: string, opts?: { ring?: boolean }) => {
      if (currentCallChatId.current === chatId) return; // already ringing
      currentCallChatId.current = chatId;
      setIncomingCall({ chatId, psychicName, psychicPhoto: null });
      // No ring when she TAPPED the notification to get here — the push
      // already sounded, and she's actively looking at the screen.
      if (opts?.ring !== false) ringRef.current.play();
    },
    []
  );

  // Dismiss only if the overlay currently shows this chat.
  const dismissCall = useCallback((chatId: number) => {
    setIncomingCall((cur) => {
      if (cur && cur.chatId === chatId) {
        ringRef.current.stop();
        currentCallChatId.current = null;
        return null;
      }
      return cur;
    });
  }, []);

  const setCallPhoto = useCallback((chatId: number, photo: string | null) => {
    setIncomingCall((cur) =>
      cur && cur.chatId === chatId ? { ...cur, psychicPhoto: photo } : cur
    );
  }, []);

  // Fill in the avatar once the psychic id is known. Photo is decoration —
  // any failure just leaves the fallback icon.
  const hydrateFromPsychicId = useCallback(
    async (chatId: number, psychicId: number) => {
      try {
        const res = await api.get(`/api/psychic/${psychicId}`);
        setCallPhoto(chatId, res.data?.profile_picture_url ?? null);
      } catch {
        // keep fallback icon
      }
    },
    [setCallPhoto]
  );

  // Push payloads only carry chat_id + name: resolve the psychic via my-chats.
  // Doubles as the stale-tap guard — a tap on an old notification for a chat
  // that already ended must not present a dead "incoming reading".
  const hydrateFromChatId = useCallback(
    async (chatId: number) => {
      try {
        const chats = await getMyChats();
        const chat = chats.find((c) => c.id === chatId);
        if (!chat) return;
        if (chat.status === "ENDED") {
          dismissCall(chatId);
          return;
        }
        await hydrateFromPsychicId(chatId, chat.psychic_id);
      } catch {
        // keep fallback icon
      }
    },
    [dismissCall, hydrateFromPsychicId]
  );

  const handleNotification = useCallback(
    (n: AppNotification) => {
      const chatId = Number(n.data?.chat_id);
      if (!Number.isFinite(chatId)) return;

      switch (n.notification_type) {
        case "CHAT_ACCEPTED": {
          const psychicName =
            (n.data?.psychic_name as string) || "Your psychic";
          presentCall(chatId, psychicName);
          const psychicId = Number(n.data?.psychic_id);
          if (Number.isFinite(psychicId)) {
            void hydrateFromPsychicId(chatId, psychicId);
          } else {
            void hydrateFromChatId(chatId);
          }
          break;
        }
        // If the request is cancelled or the chat ends, stop ringing.
        case "CHAT_ENDED":
        case "CHAT_REQUEST_CANCELLED": {
          dismissCall(chatId);
          break;
        }
        default:
          break;
      }
    },
    [presentCall, dismissCall, hydrateFromPsychicId, hydrateFromChatId]
  );

  // Connect while signed in; reconnect on unexpected drops.
  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      clearCall();
      return;
    }

    let cancelled = false;

    const scheduleReconnect = (delayMs: number) => {
      if (cancelled) return;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      reconnectRef.current = setTimeout(connect, delayMs);
    };

    const connect = async () => {
      if (cancelled) return;
      let token: string | null = null;
      try {
        token = await getValidAccessToken();
      } catch {
        token = null;
      }
      // A transient failure (offline moment, refresh hiccup) must never kill
      // the chain — this socket is what makes the phone "ring".
      if (!token) {
        scheduleReconnect(5000);
        return;
      }
      if (cancelled) return;

      const socket = new NotificationSocket(token);
      socket.onNotification(handleNotification);
      socket.onDisconnect(() => {
        // Reconnect after a short delay while still signed in.
        scheduleReconnect(3000);
      });
      socket.connect();
      socketRef.current = socket;
    };

    connect();

    // Coming back to the foreground: Android freely kills idle sockets in the
    // background, and a timer-based retry may have fired while the network was
    // suspended. If the socket isn't alive, reconnect right now.
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active" && !cancelled && !socketRef.current?.isAlive) {
        connect();
      }
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [user, handleNotification, clearCall]);

  // Second feed for the same moment: if the accept arrives as a foreground
  // push (notification WS down, or suppression raced), raise the same modal.
  // presentCall dedupes when both feeds deliver.
  useEffect(() => {
    if (!pushSupported || !user) return;
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, unknown>;
      if (data?.type !== "chat_accepted") return;
      const chatId = Number(data.chat_id);
      if (!Number.isFinite(chatId)) return;
      presentCall(
        chatId,
        (data.psychic_name as string) || "Your psychic"
      );
      void hydrateFromChatId(chatId);
    });
    return () => sub.remove();
  }, [user, presentCall, hydrateFromChatId]);

  // Third feed: the TAP on the system notification — app backgrounded or
  // killed. Raises the same global overlay instead of navigating, so there is
  // no race with auth restore or navigator mount (the old router.push from
  // PushManager silently lost that race and dumped her on the default tab).
  // Each response is handled once: the effect re-runs when `user` resolves,
  // and getLastNotificationResponseAsync re-returns the launching tap.
  const handledTapIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!pushSupported || !user) return;
    let cancelled = false;

    const handleTap = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as Record<
        string,
        unknown
      >;
      if (data?.type !== "chat_accepted") return;
      const chatId = Number(data.chat_id);
      if (!Number.isFinite(chatId)) return;
      const tapId = response.notification.request.identifier;
      if (handledTapIds.current.has(tapId)) return;
      handledTapIds.current.add(tapId);
      presentCall(chatId, (data.psychic_name as string) || "Your psychic", {
        ring: false,
      });
      void hydrateFromChatId(chatId);
    };

    // Cold start: the tap that launched the app (fires here only after auth
    // restores, so the overlay mounts over whatever screen loads).
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response && !cancelled) handleTap(response);
    });
    // Warm taps while merely backgrounded.
    const sub = Notifications.addNotificationResponseReceivedListener(handleTap);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [user, presentCall, hydrateFromChatId]);

  const onAccept = useCallback(() => {
    if (!incomingCall) return;
    const { chatId, psychicName } = incomingCall;
    clearCall();
    // intent:"join" — tapping JOIN READING here IS the explicit join; the chat
    // screen joins on arrival instead of asking again.
    router.push({
      pathname: "/sessions/[chatId]",
      params: {
        chatId: String(chatId),
        title: psychicName,
        status: "ACTIVE",
        intent: "join",
      },
    });
  }, [incomingCall, clearCall, router]);

  return (
    <CallContext.Provider value={{ incomingCall }}>
      {children}

      <Modal
        visible={!!incomingCall}
        transparent
        animationType="fade"
        onRequestClose={clearCall}
      >
        <View style={styles.overlay}>
          <View style={styles.card}>
            <View style={styles.avatar}>
              {incomingCall?.psychicPhoto ? (
                <Image
                  source={{ uri: incomingCall.psychicPhoto }}
                  style={styles.avatarPhoto}
                />
              ) : (
                <Ionicons name="sparkles" size={40} color={COLORS.accent} />
              )}
            </View>
            <Text style={styles.calling}>INCOMING READING</Text>
            <Text style={styles.name}>{incomingCall?.psychicName}</Text>
            <Text style={styles.sub}>is ready to begin your reading</Text>

            <TouchableOpacity
              style={styles.joinBtn}
              activeOpacity={0.85}
              onPress={onAccept}
            >
              <Ionicons name="chatbubbles" size={18} color={COLORS.ctaText} />
              <Text style={styles.joinText}>
                JOIN {(incomingCall?.psychicName || "READING").toUpperCase()}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dismissBtn}
              activeOpacity={0.7}
              onPress={clearCall}
            >
              <Text style={styles.dismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </CallContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCall(): CallState {
  return useContext(CallContext);
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xxl,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 28,
    borderRadius: RADII.xxl,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: alpha(COLORS.accent, 0.25),
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: alpha(COLORS.accent, 0.08),
    borderWidth: 1,
    borderColor: alpha(COLORS.accent, 0.35),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
    overflow: "hidden",
  },
  avatarPhoto: {
    width: "100%",
    height: "100%",
  },
  calling: {
    fontSize: 12,
    letterSpacing: 2.5,
    color: COLORS.accentGold,
    fontFamily: FONTS.bold,
    marginBottom: 10,
  },
  name: {
    fontSize: 26,
    lineHeight: 32,
    color: COLORS.accent,
    fontFamily: FONTS.heading,
    textAlign: "center",
  },
  sub: {
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    marginTop: SPACING.xs,
    marginBottom: 34,
    textAlign: "center",
  },
  joinBtn: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    backgroundColor: COLORS.cta,
    paddingVertical: SPACING.lg,
    borderRadius: RADII.lg,
    shadowColor: COLORS.cta,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 6,
  },
  joinText: {
    color: COLORS.ctaText,
    fontSize: 15,
    letterSpacing: 1.2,
    fontFamily: FONTS.bold,
  },
  dismissBtn: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: 20,
  },
  dismissText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontFamily: FONTS.semiBold,
  },
});
