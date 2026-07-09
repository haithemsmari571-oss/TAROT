import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import {
  COLORS,
  FONTS,
  TYPOGRAPHY,
  SPACING,
  RADII,
  TOUCH_TARGET,
  alpha,
} from "../src/theme";
import ScreenBackground from "../src/components/ScreenBackground";
import Skeleton from "../src/components/Skeleton";
import { api } from "../src/api/client";
import { getMyChats } from "../src/api/chat";
import { getMyTransactions } from "../src/api/transactions";
import type { Psychic } from "../src/types";

// Reading history (from PROFILE): every past (ENDED/ARCHIVED) chat with the
// psychic's photo, date, duration and total cost, plus BOOK AGAIN into the
// existing psychic-profile booking flow.
//
// Duration/cost are assembled client-side from the ledger: session charges
// are DEBIT rows tagged with related_chat_id, and each "Chat billing"
// description embeds its interval length as "(123s)". No new backend needed.

interface HistoryEntry {
  chatId: number;
  psychicId: number;
  psychicName: string;
  psychicPhoto: string | null;
  date: string | null;
  durationSeconds: number;
  cost: number;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDuration(seconds: number): string | null {
  if (seconds <= 0) return null;
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins} min`;
}

function formatCost(cost: number): string {
  return `£${cost.toFixed(2)}`;
}

export default function ReadingHistoryScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [chats, psychicsRes, history] = await Promise.all([
        getMyChats(),
        api.get("/api/psychic/", { params: { limit: 100 } }),
        getMyTransactions(1, 100),
      ]);

      const psychics: Psychic[] =
        psychicsRes.data?.items ?? psychicsRes.data ?? [];
      const psychicById = new Map(psychics.map((p) => [p.id, p]));

      // Per-chat cost + duration from the ledger.
      const costByChat = new Map<number, number>();
      const secondsByChat = new Map<number, number>();
      for (const t of history.transactions) {
        if (t.transaction_type !== "DEBIT" || t.related_chat_id == null) {
          continue;
        }
        costByChat.set(
          t.related_chat_id,
          (costByChat.get(t.related_chat_id) ?? 0) + t.amount
        );
        const secs = /\((\d+)s\)/.exec(t.description ?? "");
        if (secs) {
          secondsByChat.set(
            t.related_chat_id,
            (secondsByChat.get(t.related_chat_id) ?? 0) + Number(secs[1])
          );
        }
      }

      setEntries(
        chats
          .filter((c) => c.status === "ENDED" || c.status === "ARCHIVED")
          .map((c) => ({
            chatId: c.id,
            psychicId: c.psychic_id,
            psychicName:
              c.psychic_username ??
              psychicById.get(c.psychic_id)?.username ??
              "Psychic",
            psychicPhoto:
              psychicById.get(c.psychic_id)?.profile_picture_url ?? null,
            date: c.updated_at ?? c.created_at,
            durationSeconds: secondsByChat.get(c.id) ?? 0,
            cost: costByChat.get(c.id) ?? 0,
          }))
      );
      setError(null);
    } catch {
      setError("Couldn't load your readings. Pull to retry.");
      setEntries((cur) => cur ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScreenBackground scrimOpacity={0.6}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            activeOpacity={0.7}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>YOUR READINGS</Text>
        </View>

        {entries === null ? (
          <View style={styles.list}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.skelCard}>
                <Skeleton style={styles.skelAvatar} />
                <View style={styles.skelBody}>
                  <Skeleton style={styles.skelName} />
                  <Skeleton style={styles.skelMeta} />
                </View>
                <Skeleton style={styles.skelBtn} />
              </View>
            ))}
          </View>
        ) : entries.length === 0 ? (
          <View style={styles.center}>
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Ionicons
              name="moon-outline"
              size={40}
              color={COLORS.textFaint}
              style={{ marginBottom: SPACING.md }}
            />
            <Text style={styles.emptyTitle}>No readings yet</Text>
            <Text style={styles.emptyText}>
              Your past readings will live here.
            </Text>
            <TouchableOpacity
              style={styles.emptyCta}
              activeOpacity={0.85}
              onPress={() => router.push("/psychics")}
            >
              <Text style={styles.emptyCtaText}>MEET YOUR PSYCHICS</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(e) => String(e.chatId)}
            contentContainerStyle={styles.list}
            onRefresh={load}
            refreshing={false}
            ListHeaderComponent={
              error ? <Text style={styles.error}>{error}</Text> : null
            }
            renderItem={({ item }) => {
              const duration = formatDuration(item.durationSeconds);
              const meta = [
                formatDate(item.date),
                duration,
                item.cost > 0 ? formatCost(item.cost) : null,
              ]
                .filter(Boolean)
                .join("  ·  ");
              return (
                <View style={styles.card}>
                  <View style={styles.cardAvatar}>
                    {item.psychicPhoto ? (
                      <Image
                        source={{ uri: item.psychicPhoto }}
                        style={styles.cardAvatarPhoto}
                      />
                    ) : (
                      <Ionicons
                        name="sparkles"
                        size={22}
                        color={COLORS.accent}
                      />
                    )}
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.cardName}>{item.psychicName}</Text>
                    <Text style={styles.cardMeta}>{meta}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.bookBtn}
                    activeOpacity={0.85}
                    onPress={() => router.push(`/psychics/${item.psychicId}`)}
                  >
                    <Text style={styles.bookBtnText}>BOOK AGAIN</Text>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  title: {
    ...TYPOGRAPHY.headline,
    letterSpacing: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  list: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  error: {
    color: COLORS.error,
    fontSize: 14,
    fontFamily: FONTS.regular,
    marginBottom: SPACING.md,
    textAlign: "center",
  },
  emptyTitle: {
    ...TYPOGRAPHY.headline,
    marginBottom: SPACING.xs,
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: SPACING.xl,
  },
  emptyCta: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.cta,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.xl,
  },
  emptyCtaText: {
    color: COLORS.ctaText,
    fontSize: 14,
    letterSpacing: 1.2,
    fontFamily: FONTS.bold,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  cardAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: alpha(COLORS.accent, 0.08),
    borderWidth: 1,
    borderColor: alpha(COLORS.accent, 0.3),
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginRight: SPACING.md,
  },
  cardAvatarPhoto: { width: "100%", height: "100%" },
  cardBody: { flex: 1, marginRight: SPACING.sm },
  cardName: {
    fontSize: 17,
    color: COLORS.textPrimary,
    fontFamily: FONTS.semiBold,
    marginBottom: 2,
  },
  cardMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
  },
  bookBtn: {
    minHeight: 40,
    justifyContent: "center",
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: alpha(COLORS.accentGold, 0.6),
    paddingHorizontal: SPACING.md,
  },
  bookBtnText: {
    color: COLORS.accentGold,
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: FONTS.bold,
  },
  // Loading skeletons (mirror the reading-card silhouette)
  skelCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  skelAvatar: { width: 52, height: 52, borderRadius: 26 },
  skelBody: { flex: 1, gap: 8, marginHorizontal: SPACING.md },
  skelName: { width: "50%", height: 15 },
  skelMeta: { width: "80%", height: 11 },
  skelBtn: { width: 88, height: 34, borderRadius: RADII.md },
});
