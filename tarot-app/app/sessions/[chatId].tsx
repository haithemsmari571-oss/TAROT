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
  startChatTopUp,
  type ChatMessage,
} from "../../src/api/chat";
import { getMyBalance } from "../../src/api/payment";
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
    intent,
  } = useLocalSearchParams<{
    chatId: string;
    title?: string;
    status?: string;
    // "join" = she already tapped an explicit JOIN affordance (the INCOMING
    // READING modal) — join on arrival instead of showing the overlay again.
    intent?: string;
  }>();
  const router = useRouter();
  const { user } = useAuth();
  const chatId = Number(chatIdParam);

  const {
    messages,
    sendMessage,
    sendTyping,
    connectionStatus,
    isConnected,
    loadingHistory,
    error,
    sessionPaused,
    endedNoBalance,
    sessionStatus: wsSessionStatus,
    liveBalance,
    feeRejection,
    clearRejection,
  } = useChatWebSocket(Number.isFinite(chatId) ? chatId : null);

  const [draft, setDraft] = useState("");
  const clientTypingActiveRef = useRef(false);
  const clientTypingSignalAtRef = useRef(0);
  const clientTypingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ended, setEnded] = useState(false);
  const [ending, setEnding] = useState(false);
  // Branded end-session confirm sheet (replaces the old raw Alert).
  const [endConfirm, setEndConfirm] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  // Which kind of pause: the reader paused, or the balance ran out (GRACE).
  const [pauseKind, setPauseKind] = useState<"reader" | "balance" | null>(null);
  const [toppingUp, setToppingUp] = useState(false);
  // Balance-ended sheet state.
  const [endSheetDismissed, setEndSheetDismissed] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // ── Chat + session state (authoritative, never trusted from params) ──────
  // chatStatus: the Chat row's status (REQUESTED/ACTIVE/PAUSED/ENDED…), seeded
  // from the route param and confirmed from the server on mount.
  // sessionStatus: the live session's state (AWAITING_JOIN/ACTIVE/GRACE/ENDED)
  // — WS events win once they arrive; the REST fetch covers the gap.
  const [chatStatus, setChatStatus] = useState<string>(status ?? "");
  const [restSessionStatus, setRestSessionStatus] = useState<string | null>(
    null
  );
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  // Opened as a between-sessions chat (accepted before, no live session):
  // messages cost 1 ⭐. Request-phase (REQUESTED) messages stay free.
  const [feeMode, setFeeMode] = useState(
    status === "ENDED" || status === "ARCHIVED"
  );
  const [outBalance, setOutBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(chatId)) return;
    let cancelled = false;
    (async () => {
      let confirmed = status ?? "";
      try {
        const mine = (await getMyChats()).find((c) => c.id === chatId);
        if (mine) confirmed = mine.status;
      } catch {
        // keep the param-seeded status
      }
      if (cancelled) return;
      setChatStatus(confirmed);
      setFeeMode(confirmed === "ENDED" || confirmed === "ARCHIVED");
      // PAUSED included: a chat opened mid-GRACE must land in the locked
      // top-up state, not a plain composer.
      if (confirmed === "ACTIVE" || confirmed === "PAUSED") {
        try {
          const s = await getSessionTime(chatId);
          if (!cancelled && s.session_status) {
            setRestSessionStatus(s.session_status);
          }
        } catch {
          // Unknown session state on an ACTIVE chat: assume not joined — the
          // JOIN button is the safe, explicit way forward (idempotent if
          // already joined).
          if (!cancelled && confirmed === "ACTIVE") {
            setRestSessionStatus("AWAITING_JOIN");
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // WS events are the live truth; the REST snapshot fills in before they land.
  const sessionStatus = wsSessionStatus ?? restSessionStatus;

  // Session timer runs only while the session is genuinely billing.
  const sessionActive =
    chatStatus === "ACTIVE" &&
    sessionStatus === "ACTIVE" &&
    !ended &&
    !sessionPaused &&
    !endedNoBalance;
  const timer = useSessionTimer(
    Number.isFinite(chatId) ? chatId : null,
    sessionActive
  );

  // Explicit join — the ONLY place the app ever calls /join. Charges minute 1
  // upfront server-side; a client who can't afford it lands in GRACE.
  const onJoin = useCallback(async () => {
    if (!Number.isFinite(chatId) || joining) return;
    setJoining(true);
    setJoinError(null);
    try {
      const result = await joinChat(chatId);
      setRestSessionStatus(result.session_status ?? "ACTIVE");
      await timer.refresh();
    } catch {
      setJoinError("Couldn't join — check your connection and try again.");
    } finally {
      setJoining(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, joining]);

  // She already tapped JOIN READING on the incoming-call modal — that was the
  // explicit act, so don't make her confirm twice.
  const autoJoinDone = useRef(false);
  useEffect(() => {
    if (
      intent === "join" &&
      !autoJoinDone.current &&
      sessionStatus === "AWAITING_JOIN"
    ) {
      autoJoinDone.current = true;
      void onJoin();
    }
  }, [intent, sessionStatus, onJoin]);

  const awaitingJoin =
    chatStatus === "ACTIVE" && sessionStatus === "AWAITING_JOIN" && !ended;

  // Ended because the money ran out: the server said so, or the local
  // countdown hit zero while the server isn't holding a top-up (GRACE) pause.
  const balanceEnded =
    (chatStatus === "ACTIVE" || chatStatus === "PAUSED") &&
    !ended &&
    (endedNoBalance || (timer.depleted && !sessionPaused));
  const sessionEnded = ended || balanceEnded || sessionStatus === "ENDED";
  const showSession = sessionActive && timer.ready && !sessionEnded;
  const paused =
    (sessionPaused || sessionStatus === "GRACE") &&
    !ended &&
    !endedNoBalance &&
    (chatStatus === "ACTIVE" || chatStatus === "PAUSED");
  const showEndSheet = balanceEnded && !endSheetDismissed;

  // Balance shown on the between-sessions fee pill: live WS value when the
  // server has spoken, otherwise the fetched profile balance.
  useEffect(() => {
    if (!feeMode) return;
    let cancelled = false;
    getMyBalance()
      .then((bal) => {
        if (cancelled) return;
        setOutBalance(
          bal.stardust_total ?? (bal.balance ?? 0) + (bal.earned_balance ?? 0)
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [feeMode]);
  const feeBalance = liveBalance ?? outBalance;

  // GRACE from the live event stream is definitive; the poll below only
  // classifies pauses the events didn't already explain (reader's manual pause).
  const effectivePauseKind: "reader" | "balance" | null = !paused
    ? null
    : sessionStatus === "GRACE"
    ? "balance"
    : pauseKind;

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

  // During GRACE, tell the backend checkout is starting before opening billing.
  // That extends the server hold from 60s to 5 minutes; the payment webhook
  // resumes the reading after crediting the balance.
  const onTopUp = useCallback(async () => {
    setToppingUp(true);
    try {
      if (sessionStatus === "GRACE") {
        await startChatTopUp(chatId);
      }
      await openBillingPage();
      await timer.refresh();
    } finally {
      setToppingUp(false);
    }
  }, [chatId, sessionStatus, timer]);

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

  const stopClientTyping = useCallback(() => {
    if (clientTypingStopTimerRef.current) {
      clearTimeout(clientTypingStopTimerRef.current);
      clientTypingStopTimerRef.current = null;
    }
    if (clientTypingActiveRef.current) {
      clientTypingActiveRef.current = false;
      sendTyping(false);
    }
  }, [sendTyping]);

  const onDraftChange = useCallback((value: string) => {
    setDraft(value);
    if (!isConnected || !value) {
      stopClientTyping();
      return;
    }
    const now = Date.now();
    if (
      !clientTypingActiveRef.current ||
      now - clientTypingSignalAtRef.current >= 4000
    ) {
      sendTyping(true);
      clientTypingActiveRef.current = true;
      clientTypingSignalAtRef.current = now;
    }
    if (clientTypingStopTimerRef.current) {
      clearTimeout(clientTypingStopTimerRef.current);
    }
    clientTypingStopTimerRef.current = setTimeout(stopClientTyping, 2000);
  }, [isConnected, sendTyping, stopClientTyping]);

  useEffect(() => () => stopClientTyping(), [stopClientTyping]);

  const onSend = () => {
    const text = draft.trim();
    if (!text) return;
    stopClientTyping();
    sendMessage(text);
    setDraft("");
  };

  const onEndSession = useCallback(() => {
    setEndError(null);
    setEndConfirm(true);
  }, []);

  const onConfirmEnd = useCallback(async () => {
    setEnding(true);
    setEndError(null);
    try {
      await endChat(chatId);
      setEnded(true);
      setEndConfirm(false);
    } catch {
      setEndError("Couldn't end the session. Please try again.");
    } finally {
      setEnding(false);
    }
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
          {chatStatus === "ACTIVE" && !sessionEnded ? (
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
        {sessionEnded && (chatStatus === "ACTIVE" || chatStatus === "PAUSED") && (
          <View style={styles.endedBanner}>
            <Text style={styles.endedText}>Session ended</Text>
          </View>
        )}
        {/* Two distinct pauses: out-of-balance (top up to continue) vs the
            reader's own pause. */}
        {paused && effectivePauseKind === "balance" ? (
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

          {/* Your reading is ready — the one explicit moment billing begins. */}
          {awaitingJoin && (
            <View style={styles.joinCard}>
              <View style={styles.joinHalo}>
                <Ionicons name="sparkles" size={22} color={COLORS.accent} />
              </View>
              <Text style={styles.joinTitle}>
                {title || "Your reader"} is ready for you
              </Text>
              <Text style={styles.joinSub}>
                Your time together begins when you join.
              </Text>
              {!!joinError && <Text style={styles.joinError}>{joinError}</Text>}
              <TouchableOpacity
                style={styles.joinNowBtn}
                activeOpacity={0.85}
                onPress={onJoin}
                disabled={joining}
              >
                {joining ? (
                  <ActivityIndicator size="small" color={COLORS.ctaText} />
                ) : (
                  <>
                    <Ionicons
                      name="chatbubbles"
                      size={16}
                      color={COLORS.ctaText}
                    />
                    <Text style={styles.joinNowText}>JOIN NOW</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Between sessions: each message carries a small fee. */}
          {feeMode && !sessionEnded && (
            <View style={styles.feeRow}>
              <Ionicons name="star" size={12} color={COLORS.accentGold} />
              <Text style={styles.feeText}>
                Between sessions — 1 ⭐ per message
                {feeBalance != null
                  ? ` · Balance ${fmtMoney(feeBalance)}`
                  : ""}
              </Text>
            </View>
          )}

          {/* Composer */}
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              placeholder={
                awaitingJoin
                  ? "Join to start your reading"
                  : sessionEnded && !feeMode
                  ? "Session ended"
                  : paused
                  ? effectivePauseKind === "balance"
                    ? "Top up to continue"
                    : "Reading paused"
                  : "Type a message…"
              }
              placeholderTextColor={COLORS.textFaint}
              value={draft}
              onChangeText={onDraftChange}
              onBlur={stopClientTyping}
              multiline
              onSubmitEditing={onSend}
              editable={
                isConnected &&
                !awaitingJoin &&
                !paused &&
                (!sessionEnded || feeMode)
              }
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!isConnected ||
                  !draft.trim() ||
                  awaitingJoin ||
                  paused ||
                  (sessionEnded && !feeMode)) &&
                  styles.sendBtnDisabled,
              ]}
              onPress={onSend}
              disabled={
                !isConnected ||
                !draft.trim() ||
                awaitingJoin ||
                paused ||
                (sessionEnded && !feeMode)
              }
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-up" size={20} color={COLORS.ctaText} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Out of Stardust for a between-sessions message — branded, recoverable. */}
      <BottomSheet visible={!!feeRejection} onClose={clearRejection}>
        <SheetTitle>A little more Stardust needed</SheetTitle>
        <SheetBody>
          Messages between sessions cost 1 ⭐ each
          {feeRejection?.client_balance != null
            ? ` — your balance is ${fmtMoney(feeRejection.client_balance)}`
            : ""}
          . Top up and your message will be on its way.
        </SheetBody>
        <SheetPrimaryButton
          label="+ TOP UP"
          loading={toppingUp}
          onPress={async () => {
            setToppingUp(true);
            await openBillingPage();
            try {
              const bal = await getMyBalance();
              setOutBalance(
                bal.stardust_total ??
                  (bal.balance ?? 0) + (bal.earned_balance ?? 0)
              );
            } catch {
              // balance refresh is best-effort
            }
            setToppingUp(false);
            clearRejection();
          }}
        />
        <SheetQuietButton label="Not now" onPress={clearRejection} />
      </BottomSheet>

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

      {/* End-session confirm — branded and explicit, destruction in red. */}
      <BottomSheet
        visible={endConfirm}
        onClose={() => {
          if (!ending) setEndConfirm(false);
        }}
      >
        <SheetTitle>End session?</SheetTitle>
        <SheetBody>This ends the reading for you and the psychic.</SheetBody>
        {!!endError && <SheetNote>{endError}</SheetNote>}
        <TouchableOpacity
          style={[styles.endConfirmBtn, ending && styles.endConfirmBtnDisabled]}
          activeOpacity={0.85}
          onPress={onConfirmEnd}
          disabled={ending}
        >
          {ending ? (
            <ActivityIndicator color={COLORS.error} />
          ) : (
            <Text style={styles.endConfirmText}>END SESSION</Text>
          )}
        </TouchableOpacity>
        <SheetQuietButton
          label="Cancel"
          onPress={() => setEndConfirm(false)}
        />
      </BottomSheet>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  endConfirmBtn: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: RADII.md,
    paddingVertical: SPACING.lg,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: alpha(COLORS.error, 0.7),
    backgroundColor: alpha(COLORS.error, 0.08),
  },
  endConfirmBtnDisabled: { opacity: 0.6 },
  endConfirmText: {
    color: COLORS.error,
    fontSize: 15,
    letterSpacing: 1.2,
    fontFamily: FONTS.bold,
  },
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
  // "Your reading is ready" join card — pinned above the composer.
  joinCard: {
    alignItems: "center",
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.xl,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: alpha(COLORS.accent, 0.3),
  },
  joinHalo: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: alpha(COLORS.accent, 0.08),
    borderWidth: 1,
    borderColor: alpha(COLORS.accent, 0.35),
    marginBottom: SPACING.md,
  },
  joinTitle: {
    fontSize: 19,
    lineHeight: 25,
    color: COLORS.textPrimary,
    fontFamily: FONTS.heading,
    textAlign: "center",
  },
  joinSub: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    textAlign: "center",
    marginTop: SPACING.xs,
    marginBottom: SPACING.lg,
  },
  joinError: {
    fontSize: 13,
    color: COLORS.error,
    fontFamily: FONTS.regular,
    textAlign: "center",
    marginBottom: SPACING.sm,
  },
  joinNowBtn: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
    backgroundColor: COLORS.cta,
    borderRadius: RADII.lg,
    paddingVertical: SPACING.md,
    shadowColor: COLORS.cta,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 5,
  },
  joinNowText: {
    color: COLORS.ctaText,
    fontSize: 15,
    letterSpacing: 1.2,
    fontFamily: FONTS.bold,
  },
  // Between-sessions fee notice above the composer.
  feeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: SPACING.lg,
    backgroundColor: alpha(COLORS.accentGold, 0.07),
    borderTopWidth: 1,
    borderTopColor: alpha(COLORS.accentGold, 0.2),
  },
  feeText: {
    fontSize: 13,
    color: COLORS.accentGold,
    fontFamily: FONTS.semiBold,
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
