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
import {
  COLORS,
  FONTS,
  TYPOGRAPHY,
  SPACING,
  RADII,
  TOUCH_TARGET,
  alpha,
} from "../../src/theme";
import ScreenBackground, {
  BACKGROUNDS,
} from "../../src/components/ScreenBackground";
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
  return `£${(Math.max(0, cents) / 100).toFixed(2)}`;
}

// Remaining-time color: red under 1 min, gold under 5 min, normal otherwise.
function remainingColor(sec: number): string {
  if (sec <= 60) return COLORS.error;
  if (sec <= 300) return COLORS.accentGold;
  return COLORS.textPrimary;
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
      ? COLORS.error
      : COLORS.accentGold;

  return (
    <ScreenBackground source={BACKGROUNDS.chat} scrimOpacity={0.72}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <StatusBar style="light" />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
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
                <ActivityIndicator size="small" color={COLORS.error} />
              ) : (
                <Text style={styles.endBtnText}>End</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={{ width: TOUCH_TARGET }} />
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
            <Ionicons name="pause-circle" size={16} color={COLORS.accentGold} />
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
              <ActivityIndicator color={COLORS.accent} />
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
              placeholderTextColor={COLORS.textFaint}
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
              <Ionicons name="arrow-up" size={20} color={COLORS.ctaText} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: {
    fontSize: 17,
    color: COLORS.textPrimary,
    fontFamily: FONTS.semiBold,
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
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
  },
  endBtn: {
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  endBtnText: {
    color: COLORS.error,
    fontSize: 15,
    fontFamily: FONTS.semiBold,
  },
  // Session bar
  sessionBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: 10,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sessionStat: { alignItems: "center", flex: 1, gap: 3 },
  sessionLabel: {
    fontSize: 11,
    letterSpacing: 1,
    color: COLORS.textFaint,
    fontFamily: FONTS.semiBold,
  },
  sessionValue: {
    fontSize: 17,
    color: COLORS.textPrimary,
    fontFamily: FONTS.bold,
    fontVariant: ["tabular-nums"],
  },
  sessionDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.border,
  },
  endedBanner: {
    paddingVertical: SPACING.sm,
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  endedText: {
    fontSize: 14,
    letterSpacing: 0.5,
    color: COLORS.textSecondary,
    fontFamily: FONTS.semiBold,
  },
  pausedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: 10,
    paddingHorizontal: SPACING.lg,
    backgroundColor: alpha(COLORS.accentGold, 0.1),
    borderBottomWidth: 1,
    borderBottomColor: alpha(COLORS.accentGold, 0.25),
  },
  pausedText: {
    fontSize: 14,
    color: COLORS.accentGold,
    fontFamily: FONTS.semiBold,
    textAlign: "center",
  },

  messages: { padding: SPACING.lg, gap: SPACING.sm, flexGrow: 1 },
  empty: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: "center",
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
    borderRadius: RADII.pill,
    backgroundColor: COLORS.frost,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
  },
  systemText: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    textAlign: "center",
  },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: RADII.lg,
  },
  bubbleMine: {
    backgroundColor: COLORS.cta,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    ...TYPOGRAPHY.body,
    lineHeight: 24,
  },
  bubbleTextMine: { color: COLORS.ctaText },
  errorBar: {
    color: COLORS.error,
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 6,
    fontFamily: FONTS.regular,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  input: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    maxHeight: 120,
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 24,
    paddingHorizontal: SPACING.lg,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 17,
    lineHeight: 24,
    color: COLORS.textPrimary,
    fontFamily: FONTS.regular,
  },
  sendBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    backgroundColor: COLORS.cta,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
});
