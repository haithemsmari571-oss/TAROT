import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../src/theme/colors";
import { useAuth } from "../../src/context/AuthContext";
import { useChatWebSocket } from "../../src/hooks/useChatWebSocket";
import { useSessionTimer } from "../../src/hooks/useSessionTimer";
import { endChat, joinChat, type ChatMessage } from "../../src/api/chat";

const STATUS_LABEL = {
  connecting: "Connecting…",
  connected: "Connected",
  disconnected: "Offline",
  error: "Connection error",
} as const;

function fmtTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

function fmtMoney(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

// Remaining-time color: red under 1 min, gold under 5 min, normal otherwise.
function remainingColor(sec: number): string {
  if (sec <= 60) return "#FF6B6B";
  if (sec <= 300) return COLORS.gold;
  return COLORS.text;
}

export default function ChatScreen() {
  const {
    chatId: chatIdParam,
    title,
    status,
  } = useLocalSearchParams<{
    chatId: string;
    title?: string;
    status?: string;
  }>();
  const router = useRouter();
  const { user } = useAuth();
  const chatId = Number(chatIdParam);

  const {
    messages,
    sendMessage,
    connectionStatus,
    isConnected,
    loadingHistory,
    error,
    sessionPaused,
  } = useChatWebSocket(Number.isFinite(chatId) ? chatId : null);

  const [draft, setDraft] = useState("");
  const [ended, setEnded] = useState(false);
  const [ending, setEnding] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Announce that the client has joined so the backend anchors the session
  // timer to now (it doesn't run between accept and join). Idempotent server-side.
  useEffect(() => {
    if (Number.isFinite(chatId) && status === "ACTIVE") {
      joinChat(chatId).catch(() => {
        // Non-fatal: the WebSocket/timer still work; a retry happens on remount.
      });
    }
  }, [chatId, status]);

  // Session timer runs only while active, not ended, and not paused.
  const sessionActive = status === "ACTIVE" && !ended && !sessionPaused;
  const timer = useSessionTimer(
    Number.isFinite(chatId) ? chatId : null,
    sessionActive
  );
  const sessionEnded = ended || timer.depleted;
  const showSession = status === "ACTIVE" && timer.ready && !sessionEnded;
  const paused = status === "ACTIVE" && sessionPaused && !sessionEnded;

  const onSend = () => {
    const text = draft.trim();
    if (!text) return;
    sendMessage(text);
    setDraft("");
  };

  const onEndSession = useCallback(() => {
    Alert.alert(
      "End session?",
      "This ends the reading for you and the psychic.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "End session",
          style: "destructive",
          onPress: async () => {
            setEnding(true);
            try {
              await endChat(chatId);
              setEnded(true);
            } catch {
              Alert.alert("Couldn't end session", "Please try again.");
            } finally {
              setEnding(false);
            }
          },
        },
      ]
    );
  }, [chatId]);

  const statusColor =
    connectionStatus === "connected"
      ? COLORS.online
      : connectionStatus === "error"
      ? "#FF6B6B"
      : COLORS.gold;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title || "Chat"}
          </Text>
          <View style={styles.statusWrap}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={styles.statusText}>
              {STATUS_LABEL[connectionStatus]}
            </Text>
          </View>
        </View>
        {status === "ACTIVE" && !sessionEnded ? (
          <TouchableOpacity
            onPress={onEndSession}
            disabled={ending}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.endBtn}
          >
            {ending ? (
              <ActivityIndicator size="small" color="#FF6B6B" />
            ) : (
              <Text style={styles.endBtnText}>End</Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      {/* Session bar — live timer, remaining time and client balance */}
      {showSession && (
        <View style={styles.sessionBar}>
          <View style={styles.sessionStat}>
            <Text style={styles.sessionLabel}>SESSION</Text>
            <Text style={styles.sessionValue}>
              {fmtTime(timer.elapsedSeconds)}
            </Text>
          </View>
          <View style={styles.sessionDivider} />
          <View style={styles.sessionStat}>
            <Text style={styles.sessionLabel}>REMAINING</Text>
            <Text
              style={[
                styles.sessionValue,
                { color: remainingColor(timer.remainingSeconds) },
              ]}
            >
              {fmtTime(timer.remainingSeconds)}
            </Text>
          </View>
          <View style={styles.sessionDivider} />
          <View style={styles.sessionStat}>
            <Text style={styles.sessionLabel}>BALANCE</Text>
            <Text style={styles.sessionValue}>
              {fmtMoney(timer.clientBalanceCents)}
            </Text>
          </View>
        </View>
      )}
      {sessionEnded && status === "ACTIVE" && (
        <View style={styles.endedBanner}>
          <Text style={styles.endedText}>Session ended</Text>
        </View>
      )}
      {paused && (
        <View style={styles.pausedBanner}>
          <Ionicons name="pause-circle" size={16} color={COLORS.gold} />
          <Text style={styles.pausedText}>
            Reading paused — waiting for your reader to resume.
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        {loadingHistory && messages.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.lavender} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m, i) => (m.id != null ? String(m.id) : `idx-${i}`)}
            contentContainerStyle={styles.messages}
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: true })
            }
            ListEmptyComponent={
              <Text style={styles.empty}>
                {error ?? "No messages yet. Say hello ✦"}
              </Text>
            }
            renderItem={({ item }) => {
              // System/event messages (accepted, paused, resumed, ended) render
              // as a centered muted pill, not a chat bubble — matching the website.
              if (item.type === "system" || item.is_system) {
                return (
                  <View style={styles.systemRow}>
                    <View style={styles.systemPill}>
                      <Text style={styles.systemText}>{item.content}</Text>
                    </View>
                  </View>
                );
              }
              const mine = user != null && item.sender_id === user.id;
              return (
                <View
                  style={[
                    styles.bubbleRow,
                    mine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
                  ]}
                >
                  <View
                    style={[
                      styles.bubble,
                      mine ? styles.bubbleMine : styles.bubbleTheirs,
                    ]}
                  >
                    <Text
                      style={[
                        styles.bubbleText,
                        mine && styles.bubbleTextMine,
                      ]}
                    >
                      {item.content}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {!!error && messages.length > 0 && (
          <Text style={styles.errorBar}>{error}</Text>
        )}

        {/* Composer */}
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder={
              sessionEnded
                ? "Session ended"
                : paused
                ? "Reading paused"
                : "Type a message…"
            }
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={draft}
            onChangeText={setDraft}
            multiline
            onSubmitEditing={onSend}
            editable={isConnected && !sessionEnded && !paused}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!isConnected || !draft.trim() || sessionEnded || paused) &&
                styles.sendBtnDisabled,
            ]}
            onPress={onSend}
            disabled={!isConnected || !draft.trim() || sessionEnded || paused}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: {
    fontSize: 16,
    color: COLORS.text,
    fontFamily: "Poppins_600SemiBold",
    textTransform: "capitalize",
  },
  statusWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 2,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontFamily: "Poppins_400Regular",
  },
  endBtn: {
    minWidth: 44,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  endBtnText: {
    color: "#FF6B6B",
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
  },
  // Session bar
  sessionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  sessionStat: { alignItems: "center", flex: 1, gap: 3 },
  sessionLabel: {
    fontSize: 9,
    letterSpacing: 1,
    color: "rgba(255,255,255,0.4)",
    fontFamily: "Poppins_600SemiBold",
  },
  sessionValue: {
    fontSize: 16,
    color: COLORS.text,
    fontFamily: "Poppins_700Bold",
    fontVariant: ["tabular-nums"],
  },
  sessionDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  endedBanner: {
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  endedText: {
    fontSize: 12,
    letterSpacing: 0.5,
    color: COLORS.textMuted,
    fontFamily: "Poppins_600SemiBold",
  },
  pausedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "rgba(242,174,64,0.1)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(242,174,64,0.25)",
  },
  pausedText: {
    fontSize: 12,
    color: COLORS.gold,
    fontFamily: "Poppins_600SemiBold",
    textAlign: "center",
  },

  messages: { padding: 16, gap: 8, flexGrow: 1 },
  empty: {
    color: COLORS.textMuted,
    textAlign: "center",
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    marginTop: 40,
  },
  bubbleRow: { flexDirection: "row" },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubbleRowTheirs: { justifyContent: "flex-start" },
  systemRow: { alignItems: "center", marginVertical: 6 },
  systemPill: {
    maxWidth: "85%",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  systemText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
  },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleMine: {
    backgroundColor: COLORS.purple,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.text,
    fontFamily: "Poppins_400Regular",
  },
  bubbleTextMine: { color: "#fff" },
  errorBar: {
    color: "#FF6B6B",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 6,
    fontFamily: "Poppins_400Regular",
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: COLORS.surface,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    color: COLORS.text,
    fontFamily: "Poppins_400Regular",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.purple,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
});
