import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  FlatList,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/api/client";
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
import { PsychicCard } from "../../src/components/PsychicCard";
import Skeleton from "../../src/components/Skeleton";
import { useCredit } from "../../src/context/CreditContext";
import { useFavorites } from "../../src/context/FavoritesContext";
import { useAuth } from "../../src/context/AuthContext";
import type { Psychic } from "../../src/types";

export default function PsychicsScreen() {
  const router = useRouter();
  const { refresh: refreshCredit } = useCredit();
  const { user } = useAuth();
  const { ids: favoriteIds, refresh: refreshFavorites } = useFavorites();
  const [psychics, setPsychics] = useState<Psychic[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "all" | "favorites" — favourites is a filter over the same list, so the
  // online badge, tiers and free-credit CTAs all come along for free.
  const [filter, setFilter] = useState<"all" | "favorites">("all");

  const load = useCallback(async () => {
    try {
      const res = await api.get("/api/psychic/", { params: { limit: 100 } });
      setPsychics(res.data?.items ?? res.data ?? []);
      setError(null);
    } catch (err) {
      console.error("Failed to load psychics:", err);
      setError(
        "Couldn't load psychics. Pull to retry or check your connection."
      );
    }
  }, []);

  // Initial load
  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // Keep the free-reading CTAs honest: re-check the welcome credit whenever
  // this tab regains focus (e.g. right after the credit was spent on a chat).
  useFocusEffect(
    useCallback(() => {
      refreshCredit();
      refreshFavorites();
    }, [refreshCredit, refreshFavorites])
  );

  // Pull-to-refresh handler — also the "retry" path from the error state.
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  if (loading) {
    // Skeleton cards instead of a bare spinner — the browse list is the
    // app's front door.
    return (
      <ScreenBackground source={BACKGROUNDS.moonlitBalcony} scrimOpacity={0.7}>
        <SafeAreaView style={styles.safe} edges={["top"]}>
          <StatusBar style="light" />
          <View style={styles.list}>
            <Text style={styles.header}>OUR PSYCHICS</Text>
            {[0, 1].map((i) => (
              <View key={i} style={styles.skelCard}>
                <Skeleton style={styles.skelPhoto} />
                <View style={styles.skelBody}>
                  <Skeleton style={styles.skelName} />
                  <Skeleton style={styles.skelLine} />
                  <Skeleton style={styles.skelLineShort} />
                </View>
              </View>
            ))}
          </View>
        </SafeAreaView>
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

  // Keep the error inside a scrollable list so pull-to-refresh works as the
  // "Pull to retry" affordance the message promises.
  if (error) {
    return (
      <ScreenBackground source={BACKGROUNDS.moonlitBalcony} scrimOpacity={0.7}>
        <SafeAreaView style={styles.safe} edges={["top"]}>
          <StatusBar style="light" />
          <FlatList
            data={[]}
            keyExtractor={() => "none"}
            renderItem={null}
            contentContainerStyle={styles.errorList}
            refreshControl={refreshControl}
            ListEmptyComponent={<Text style={styles.error}>{error}</Text>}
          />
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  const showFavoritesOnly = filter === "favorites";
  const shownPsychics = showFavoritesOnly
    ? psychics.filter((p) => favoriteIds.has(p.id))
    : psychics;

  return (
    <ScreenBackground source={BACKGROUNDS.moonlitBalcony} scrimOpacity={0.7}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <StatusBar style="light" />
        <FlatList
          data={shownPsychics}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={styles.list}
          refreshControl={refreshControl}
          renderItem={({ item }) => (
            <PsychicCard
              psychic={item}
              onPress={() => router.push(`/psychics/${item.id}`)}
            />
          )}
          ListHeaderComponent={
            <>
              <Text style={styles.header}>OUR PSYCHICS</Text>
              {/* Favourites filter — signed-in only (hearts live on the account) */}
              {!!user && (
                <View style={styles.filterRow}>
                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      !showFavoritesOnly && styles.filterChipActive,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => setFilter("all")}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        !showFavoritesOnly && styles.filterTextActive,
                      ]}
                    >
                      ALL
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.filterChip,
                      showFavoritesOnly && styles.filterChipActive,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => setFilter("favorites")}
                  >
                    <Ionicons
                      name="heart"
                      size={13}
                      color={
                        showFavoritesOnly
                          ? COLORS.accentGold
                          : COLORS.textSecondary
                      }
                    />
                    <Text
                      style={[
                        styles.filterText,
                        showFavoritesOnly && styles.filterTextActive,
                      ]}
                    >
                      FAVOURITES
                      {favoriteIds.size > 0 ? ` (${favoriteIds.size})` : ""}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          }
          ListEmptyComponent={
            showFavoritesOnly ? (
              <View style={styles.emptyFavs}>
                <Ionicons
                  name="heart-outline"
                  size={36}
                  color={COLORS.textFaint}
                  style={{ marginBottom: SPACING.md }}
                />
                <Text style={styles.error}>
                  No favourites yet. Tap the heart on any reader to keep her
                  close.
                </Text>
              </View>
            ) : (
              <Text style={styles.error}>No psychics available right now.</Text>
            )
          }
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
    paddingHorizontal: SPACING.xxl,
  },
  list: { padding: SPACING.lg, paddingBottom: 40 },
  errorList: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xxl,
    paddingVertical: 80,
  },
  header: {
    ...TYPOGRAPHY.display,
    letterSpacing: 1,
    marginBottom: SPACING.md,
    marginTop: SPACING.xs,
  },
  filterRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  filterChip: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.lg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surface,
  },
  filterChipActive: {
    borderColor: alpha(COLORS.accentGold, 0.6),
    backgroundColor: alpha(COLORS.accentGold, 0.08),
  },
  filterText: {
    fontSize: 12,
    letterSpacing: 1,
    color: COLORS.textSecondary,
    fontFamily: FONTS.bold,
  },
  filterTextActive: {
    color: COLORS.accentGold,
  },
  emptyFavs: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: SPACING.xl,
  },
  // Loading skeletons (mirror the PsychicCard silhouette)
  skelCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    overflow: "hidden",
    marginBottom: SPACING.lg,
  },
  skelPhoto: {
    width: "100%",
    height: 230,
    borderRadius: 0,
  },
  skelBody: { padding: SPACING.lg, gap: 10 },
  skelName: { width: "45%", height: 20 },
  skelLine: { width: "90%", height: 12 },
  skelLineShort: { width: "60%", height: 12 },
  error: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
});
