import { useCallback, useEffect, useState } from "react";
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
import { COLORS } from "../../src/theme/colors";
import { PsychicCard } from "../../src/components/PsychicCard";
import type { Psychic } from "../../src/types";

export default function PsychicsScreen() {
  const router = useRouter();
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

  // Pull-to-refresh handler — also the "retry" path from the error state.
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

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

  // Keep the error inside a scrollable list so pull-to-refresh works as the
  // "Pull to retry" affordance the message promises.
  if (error) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
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
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
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
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  list: { padding: 16, paddingBottom: 40 },
  errorList: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 80,
  },
  header: {
    fontSize: 22,
    color: COLORS.text,
    letterSpacing: 1,
    marginBottom: 16,
    marginTop: 4,
    fontFamily: "Poppins_700Bold",
  },
  error: {
    color: COLORS.textMuted,
    textAlign: "center",
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 21,
  },
});
