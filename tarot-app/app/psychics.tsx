import { useEffect, useState } from "react";
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { api } from "../src/api/client";
import { COLORS } from "../src/theme/colors";
import { PsychicCard } from "../src/components/PsychicCard";
import type { Psychic } from "../src/types";

export default function PsychicsScreen() {
  const [psychics, setPsychics] = useState<Psychic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/api/psychic/", { params: { limit: 100 } })
      .then((res) => setPsychics(res.data?.items ?? res.data ?? []))
      .catch((err) => {
        console.error("Failed to load psychics:", err);
        setError("Couldn't load psychics. Pull to retry or check your connection.");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.lavender} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <StatusBar style="light" />
      <FlatList
        data={psychics}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <PsychicCard psychic={item} />}
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
