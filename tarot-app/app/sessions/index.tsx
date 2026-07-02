import { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../src/theme/colors";
import { useAuth } from "../../src/context/AuthContext";
import { getMyChats, type MyChat } from "../../src/api/chat";

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: COLORS.online,
  PAUSED: COLORS.gold,
  REQUESTED: COLORS.lavender,
  ENDED: "rgba(255,255,255,0.35)",
  ARCHIVED: "rgba(255,255,255,0.35)",
};

function statusLabel(status: string, otherName: string): string {
  switch (status) {
    case "REQUESTED":
      return `Requested — waiting for ${otherName}`;
    case "ACTIVE":
      return "Active now";
    case "PAUSED":
      return "Paused";
    case "ENDED":
      return "Ended";
    case "ARCHIVED":
      return "Archived";
    default:
      return status;
  }
}

export default function SessionsScreen() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [chats, setChats] = useState<MyChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setChats(await getMyChats());
      setError(null);
    } catch {
      setError("Couldn't load your chats. Pull to retry.");
    }
  }, []);

  // Refetch whenever the tab regains focus, so a request accepted on the web
  // flips to ACTIVE without a manual pull. The first load shows the spinner;
  // later focus refetches happen quietly in the background.
  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setLoading(false);
        return;
      }
      let active = true;
      load().finally(() => {
        if (active) setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [user, load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.lavender} />
      </View>
    );
  }

  // Signed out — send them to the Profile tab to sign in.
  if (!user) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <StatusBar style="light" />
        <View style={styles.center}>
          <Ionicons
            name="chatbubbles-outline"
            size={48}
            color="rgba(255,255,255,0.25)"
          />
          <Text style={styles.emptyTitle}>Sign in to see your chats</Text>
          <Text style={styles.emptyText}>
            Head to the Profile tab to sign in, then your reading sessions will
            appear here.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.lavender} />
      </View>
    );
  }

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={COLORS.lavender}
      colors={[COLORS.lavender]}
      progressBackgroundColor={COLORS.surface}
    />
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <StatusBar style="light" />
      <FlatList
        data={chats}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={styles.list}
        refreshControl={refreshControl}
        ListHeaderComponent={<Text style={styles.header}>SESSIONS</Text>}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {error ?? "No chats yet. Start a reading from a psychic's profile."}
          </Text>
        }
        renderItem={({ item }) => {
          const iAmClient = item.user_id === user.id;
          const other =
            (iAmClient ? item.psychic_username : item.client_username) ||
            "Unknown";
          const statusColor =
            STATUS_COLOR[item.status] || "rgba(255,255,255,0.35)";
          return (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: "/sessions/[chatId]",
                  params: {
                    chatId: String(item.id),
                    title: other,
                    status: item.status,
                  },
                })
              }
            >
              <View style={styles.rowAvatar}>
                <Ionicons name="moon" size={20} color={COLORS.lavender} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowName}>{other}</Text>
                <View style={styles.statusWrap}>
                  <View
                    style={[styles.statusDot, { backgroundColor: statusColor }]}
                  />
                  <Text
                    style={[styles.statusText, { color: statusColor }]}
                    numberOfLines={1}
                  >
                    {statusLabel(item.status, other)}
                  </Text>
                </View>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color="rgba(255,255,255,0.3)"
              />
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  list: { padding: 16, paddingBottom: 40 },
  header: {
    fontSize: 22,
    color: COLORS.text,
    letterSpacing: 1,
    marginBottom: 16,
    marginTop: 4,
    fontFamily: "Poppins_700Bold",
  },
  emptyTitle: {
    fontSize: 16,
    color: COLORS.text,
    fontFamily: "Poppins_600SemiBold",
    textAlign: "center",
  },
  emptyText: {
    color: COLORS.textMuted,
    textAlign: "center",
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 21,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  rowAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, gap: 4 },
  rowName: {
    fontSize: 15,
    color: COLORS.text,
    fontFamily: "Poppins_600SemiBold",
    textTransform: "capitalize",
  },
  statusWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: {
    flexShrink: 1,
    fontSize: 10,
    letterSpacing: 0.8,
    fontFamily: "Poppins_600SemiBold",
  },
});
