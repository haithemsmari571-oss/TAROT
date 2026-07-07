import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { api } from "../../src/api/client";
import { COLORS, TYPOGRAPHY, SPACING } from "../../src/theme";
import ScreenBackground, {
  BACKGROUNDS,
} from "../../src/components/ScreenBackground";
import { PsychicCard } from "../../src/components/PsychicCard";
import { useCredit } from "../../src/context/CreditContext";
import type { Psychic } from "../../src/types";

export default function PsychicsScreen() {
  const router = useRouter();
  const { refresh: refreshCredit } = useCredit();
  const [psychics, setPsychics] = useState<Psychic[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    }, [refreshCredit])
  );

  // Pull-to-refresh handler — also the "retry" path from the error state.
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

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

  return (
    <ScreenBackground source={BACKGROUNDS.moonlitBalcony} scrimOpacity={0.7}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <StatusBar style="light" />
        <FlatList
          data={psychics}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={styles.list}
          refreshControl={refreshControl}
          renderItem={({ item }) => (
            <PsychicCard
              psychic={item}
              onPress={() => router.push(`/psychics/${item.id}`)}
            />
          )}
          ListHeaderComponent={<Text style={styles.header}>OUR PSYCHICS</Text>}
          ListEmptyComponent={
            <Text style={styles.error}>No psychics available right now.</Text>
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
    marginBottom: SPACING.lg,
    marginTop: SPACING.xs,
  },
  error: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
});
