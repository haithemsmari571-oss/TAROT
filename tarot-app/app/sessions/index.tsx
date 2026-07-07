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
import {
  COLORS,
  FONTS,
  TYPOGRAPHY,
  SPACING,
  RADII,
} from "../../src/theme";
import ScreenBackground, {
  BACKGROUNDS,
} from "../../src/components/ScreenBackground";
import { useAuth } from "../../src/context/AuthContext";
import { getMyChats, type MyChat } from "../../src/api/chat";

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: COLORS.online,
  PAUSED: COLORS.accentGold,
  REQUESTED: COLORS.accent,
  ENDED: COLORS.textFaint,
  ARCHIVED: COLORS.textFaint,
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
      <ScreenBackground source={BACKGROUNDS.moonlitBalcony} scrimOpacity={0.7}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      </ScreenBackground>
    );
  }

  // Signed out — send them to the Profile tab to sign in.
  if (!user) {
    return (
      <ScreenBackground source={BACKGROUNDS.moonlitBalcony} scrimOpacity={0.7}>
        <SafeAreaView style={styles.safe} edges={["top"]}>
          <StatusBar style="light" />
          <View style={styles.center}>
            <Ionicons
              name="chatbubbles-outline"
              size={48}
              color={COLORS.textFaint}
            />
            <Text style={styles.emptyTitle}>Sign in to see your chats</Text>
            <Text style={styles.emptyText}>
              Head to the Profile tab to sign in, then your reading sessions will
              appear here.
            </Text>
          </View>
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  if (loading) {
    return (
      <ScreenBackground source={BACKGROUNDS.moonlitBalcony} scrimOpacity={0.7}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      </ScreenBackground>
    );
  }

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={COLORS.accent}
      colors={[COLORS.accent]}
      progressBackgroundColor={COLORS.surface}
    />
  );

  return (
    <ScreenBackground source={BACKGROUNDS.moonlitBalcony} scrimOpacity={0.7}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
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
            const statusColor = STATUS_COLOR[item.status] || COLORS.textFaint;
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
                  <Ionicons name="moon" size={20} color={COLORS.accent} />
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
                  color={COLORS.textFaint}
                />
              </TouchableOpacity>
            );
          }}
        />
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: SPACING.md,
  },
  list: { padding: SPACING.lg, paddingBottom: 40 },
  header: {
    ...TYPOGRAPHY.display,
    letterSpacing: 1,
    marginBottom: SPACING.lg,
    marginTop: SPACING.xs,
  },
  emptyTitle: {
    fontSize: 18,
    color: COLORS.textPrimary,
    fontFamily: FONTS.semiBold,
    textAlign: "center",
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.lg,
    padding: 14,
    marginBottom: SPACING.md,
  },
  rowAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, gap: SPACING.xs },
  rowName: {
    fontSize: 17,
    color: COLORS.textPrimary,
    fontFamily: FONTS.semiBold,
    textTransform: "capitalize",
  },
  statusWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: {
    flexShrink: 1,
    fontSize: 12,
    letterSpacing: 0.8,
    fontFamily: FONTS.semiBold,
  },
});
