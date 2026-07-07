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
import {
  endChat,
  getMyChats,
  getSessionTime,
  joinChat,
  requestChat,
  type ChatMessage,
} from "../../src/api/chat";
import { openBillingPage } from "../../src/lib/billing";
import BottomSheet, {
  SheetTitle,
  SheetBody,
  SheetNote,
  SheetPrimaryButton,
  SheetQuietButton,
} from "../../src/components/BottomSheet";

// Below this many remaining seconds, the session bar shows the gentle
// "running low" top-up prompt.
const LOW_BALANCE_SECONDS = 180;

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

// The /session-time endpoint returns balances in pounds (not pence).
function fmtMoney(pounds: number): string {
  return `£${Math.max(0, pounds).toFixed(2)}`;
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
    endedNoBalance,
  } = useChatWebSocket(Number.isFinite(chatId) ? chatId : null);

  const [draft, setDraft] = useState("");
  const [ended, setEnded] = useState(false);
  const [ending, setEnding] = useState(false);
  // Which kind of pause: the reader paused, or the balance ran out (GRACE).
  const [pauseKind, setPauseKind] = useState<"reader" | "balance" | null>(null);
  const [toppingUp, setToppingUp] = useState(false);
  // Balance-ended sheet state.
  const [endSheetDismissed, setEndSheetDismissed] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
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
  const sessionActive =
    status === "ACTIVE" && !ended && !sessionPaused && !endedNoBalance;
  const timer = useSessionTimer(
    Number.isFinite(chatId) ? chatId : null,
    sessionActive
  );
  // Ended because the money ran out: the server said so, or the local
  // countdown hit zero while the server isn't holding a top-up (GRACE) pause.
  const balanceEnded =
    status === "ACTIVE" &&
    !ended &&
    (endedNoBalance || (timer.depleted && !sessionPaused));
  const sessionEnded = ended || balanceEnded;
  const showSession =
    status === "ACTIVE" && timer.ready && !sessionEnded && !sessionPaused;
  const paused =
    status === "ACTIVE" && sessionPaused && !ended && !endedNoBalance;
  const showEndSheet = balanceEnded && !endSheetDismissed;

  // Classify a pause by asking the server: session_status === "GRACE" (or a
  // top-up in flight) means her balance ran out; anything else is the reader's
  // own pause. Re-checks every 10s while paused so the copy stays truthful.
  useEffect(() => {
    if (!paused || !Number.isFinite(chatId)) {
      setPauseKind(null);
      return;
    }
    let cancelled = false;
    const classify = async () => {
      try {
        const s = await getSessionTime(chatId);
        if (cancelled) return;
        setPauseKind(
          s.session_status === "GRACE" || s.is_topping_up ? "balance" : "reader"
        );
      } catch {
        if (!cancelled) setPauseKind("reader");
      }
    };
    classify();
    const id = setInterval(classify, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [paused, chatId]);

  // Open the website billing page; on return re-anchor the timer to the live
  // server balance (session-time reads the DB, so added funds extend the
  // countdown; a GRACE pause is auto-resumed by the payment webhook).
  const onTopUp = useCallback(async () => {
    setToppingUp(true);
    await openBillingPage();
    await timer.refresh();
    setToppingUp(false);
  }, [timer]);

  // From the "session ended" sheet: top up, then either the webhook has already
  // revived the held session (best case) or we request a fresh reading with the
  // same psychic and land on Sessions to wait for the accept.
  const onTopUpReconnect = useCallback(async () => {
    setReconnecting(true);
    setSheetError(null);
    await openBillingPage();
    try {
      const s = await getSessionTime(chatId);
      if (s.session_status === "ACTIVE" && (s.remaining_seconds ?? 0) > 0) {
        setEndSheetDismissed(true);
        await timer.refresh();
        return;
      }
    } catch {
      // fall through to re-requesting
    }
    try {
      const chats = await getMyChats();
      const mine = chats.find((c) => c.id === chatId);
      if (!mine) throw new Error("chat not found");
      await requestChat(mine.psychic_id, "I'd like to continue my reading.");
      setEndSheetDismissed(true);
      router.replace("/sessions");
    } catch (err: any) {
      if (err?.response?.data?.existing_chat_id) {
        // A live/paused chat already exists — nothing to re-request.
        setEndSheetDismissed(true);
        await timer.refresh();
      } else {
        setSheetError(
          "Payments can take a few seconds to arrive — try again in a moment."
        );
      }
    } finally {
      setReconnecting(false);
    }
  }, [chatId, router, timer]);

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
                {fmtMoney(timer.clientBalancePounds)}
              </Text>
            </View>
          </View>
        )}
        {/* Gentle low-balance prompt attached to the session bar */}
        {showSession && timer.remainingSeconds <= LOW_BALANCE_SECONDS && (
          <View style={styles.lowRow}>
            <Text style={styles.lowText}>
              Running low — top up to keep going
            </Text>
            <TouchableOpacity
              style={styles.lowTopUpBtn}
              activeOpacity={0.85}
              onPress={onTopUp}
              disabled={toppingUp}
            >
              {toppingUp ? (
                <ActivityIndicator size="small" color={COLORS.accentGold} />
              ) : (
                <Text style={styles.lowTopUpText}>+ TOP UP</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
        {sessionEnded && status === "ACTIVE" && (
          <View style={styles.endedBanner}>
            <Text style={styles.endedText}>Session ended</Text>
          </View>
        )}
        {/* Two distinct pauses: out-of-balance (top up to continue) vs the
            reader's own pause. */}
        {paused && pauseKind === "balance" ? (
          <View style={styles.graceBanner}>
            <View style={styles.graceRow}>
              <Ionicons
                name="hourglass-outline"
                size={16}
                color={COLORS.accentGold}
              />
              <Text style={styles.pausedText}>
                Your balance ran out — top up to continue. Your reading resumes
                automatically.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.graceTopUpBtn}
              activeOpacity={0.85}
              onPress={onTopUp}
              disabled={toppingUp}
            >
              {toppingUp ? (
                <ActivityIndicator size="small" color={COLORS.background} />
              ) : (
                <Text style={styles.graceTopUpText}>+ TOP UP</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : paused ? (
          <View style={styles.pausedBanner}>
            <Ionicons name="pause-circle" size={16} color={COLORS.accentGold} />
            <Text style={styles.pausedText}>
              {title || "Your reader"} paused the session — they&apos;ll resume
              shortly.
            </Text>
          </View>
        ) : null}

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
                  ? pauseKind === "balance"
                    ? "Top up to continue"
                    : "Reading paused"
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

      {/* Session ended because the balance ran out — branded sheet, no silence. */}
      <BottomSheet
        visible={showEndSheet}
        onClose={() => setEndSheetDismissed(true)}
      >
        <SheetTitle>Your reading has ended</SheetTitle>
        <SheetBody>
          You spoke with {title || "your reader"} for{" "}
          {fmtTime(timer.elapsedSeconds)}. Your reading ended when your balance
          ran out.
        </SheetBody>
        {!!sheetError && <SheetNote>{sheetError}</SheetNote>}
        <SheetPrimaryButton
          label="TOP UP & RECONNECT"
          loading={reconnecting}
          onPress={onTopUpReconnect}
        />
        <SheetQuietButton
          label="Done"
          onPress={() => setEndSheetDismissed(true)}
        />
      </BottomSheet>
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
  // "Running low" prompt attached under the session bar
  lowRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  lowText: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 19,
    color: COLORS.accentGold,
    fontFamily: FONTS.semiBold,
  },
  lowTopUpBtn: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: alpha(COLORS.accentGold, 0.5),
    backgroundColor: alpha(COLORS.accentGold, 0.08),
  },
  lowTopUpText: {
    fontSize: 14,
    letterSpacing: 0.8,
    color: COLORS.accentGold,
    fontFamily: FONTS.bold,
  },
  // Out-of-balance (GRACE) pause banner with its own top-up action
  graceBanner: {
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    backgroundColor: alpha(COLORS.accentGold, 0.1),
    borderBottomWidth: 1,
    borderBottomColor: alpha(COLORS.accentGold, 0.25),
  },
  graceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
  },
  graceTopUpBtn: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.accentGold,
    borderRadius: RADII.md,
  },
  graceTopUpText: {
    fontSize: 14,
    letterSpacing: 1,
    color: COLORS.background,
    fontFamily: FONTS.bold,
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
