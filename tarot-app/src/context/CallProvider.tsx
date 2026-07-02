import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { COLORS } from "../theme/colors";
import { useAuth } from "./AuthContext";
import { useRingtone } from "../hooks/useRingtone";
import { getValidAccessToken } from "../lib/refresh";
import {
  NotificationSocket,
  type AppNotification,
} from "../api/notificationSocket";

interface IncomingCall {
  chatId: number;
  psychicName: string;
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

  const clearCall = useCallback(() => {
    ringRef.current.stop();
    setIncomingCall(null);
  }, []);

  const handleNotification = useCallback((n: AppNotification) => {
    const chatId = Number(n.data?.chat_id);
    if (!Number.isFinite(chatId)) return;

    switch (n.notification_type) {
      case "CHAT_ACCEPTED": {
        const psychicName =
          (n.data?.psychic_name as string) || "Your psychic";
        setIncomingCall({ chatId, psychicName });
        ringRef.current.play();
        break;
      }
      // If the request is cancelled or the chat ends, stop ringing.
      case "CHAT_ENDED":
      case "CHAT_REQUEST_CANCELLED": {
        setIncomingCall((cur) => {
          if (cur && cur.chatId === chatId) {
            ringRef.current.stop();
            return null;
          }
          return cur;
        });
        break;
      }
      default:
        break;
    }
  }, []);

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

    const connect = async () => {
      const token = await getValidAccessToken();
      if (cancelled || !token) return;

      const socket = new NotificationSocket(token);
      socket.onNotification(handleNotification);
      socket.onDisconnect(() => {
        if (cancelled) return;
        // Reconnect after a short delay while still signed in.
        reconnectRef.current = setTimeout(connect, 3000);
      });
      socket.connect();
      socketRef.current = socket;
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [user, handleNotification, clearCall]);

  const onAccept = useCallback(() => {
    if (!incomingCall) return;
    const { chatId, psychicName } = incomingCall;
    clearCall();
    router.push({
      pathname: "/sessions/[chatId]",
      params: { chatId: String(chatId), title: psychicName, status: "ACTIVE" },
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
              <Ionicons name="sparkles" size={40} color={COLORS.lavender} />
            </View>
            <Text style={styles.calling}>INCOMING READING</Text>
            <Text style={styles.name}>{incomingCall?.psychicName}</Text>
            <Text style={styles.sub}>is ready to begin your reading</Text>

            <TouchableOpacity
              style={styles.joinBtn}
              activeOpacity={0.85}
              onPress={onAccept}
            >
              <Ionicons name="chatbubbles" size={18} color="#fff" />
              <Text style={styles.joinText}>JOIN READING</Text>
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
    backgroundColor: "rgba(5,5,8,0.92)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 28,
    borderRadius: 28,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: "rgba(210,185,255,0.25)",
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(210,185,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(210,185,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  calling: {
    fontSize: 11,
    letterSpacing: 2.5,
    color: COLORS.gold,
    fontFamily: "Poppins_700Bold",
    marginBottom: 10,
  },
  name: {
    fontSize: 24,
    color: COLORS.lavender,
    fontFamily: "Poppins_700Bold",
    textAlign: "center",
  },
  sub: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontFamily: "Poppins_400Regular",
    marginTop: 4,
    marginBottom: 34,
    textAlign: "center",
  },
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: "100%",
    backgroundColor: COLORS.purple,
    paddingVertical: 16,
    borderRadius: 14,
    shadowColor: COLORS.purple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 6,
  },
  joinText: {
    color: "#fff",
    fontSize: 14,
    letterSpacing: 1.2,
    fontFamily: "Poppins_700Bold",
  },
  dismissBtn: { marginTop: 18, paddingVertical: 8, paddingHorizontal: 20 },
  dismissText: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
});
