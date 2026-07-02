import { useRef, useState } from "react";
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
import { COLORS } from "../../src/theme/colors";
import { useAuth } from "../../src/context/AuthContext";
import { useChatWebSocket } from "../../src/hooks/useChatWebSocket";
import type { ChatMessage } from "../../src/api/chat";

const STATUS_LABEL = {
  connecting: "Connecting…",
  connected: "Connected",
  disconnected: "Offline",
  error: "Connection error",
} as const;

export default function ChatScreen() {
  const { chatId: chatIdParam, title } = useLocalSearchParams<{
    chatId: string;
    title?: string;
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
  } = useChatWebSocket(Number.isFinite(chatId) ? chatId : null);

  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const onSend = () => {
    const text = draft.trim();
    if (!text) return;
    sendMessage(text);
    setDraft("");
  };

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
        <View style={{ width: 24 }} />
      </View>

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
            placeholder="Type a message…"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={draft}
            onChangeText={setDraft}
            multiline
            onSubmitEditing={onSend}
            editable={isConnected}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!isConnected || !draft.trim()) && styles.sendBtnDisabled]}
            onPress={onSend}
            disabled={!isConnected || !draft.trim()}
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
