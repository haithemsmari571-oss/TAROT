import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
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
import {
  getMyTransactions,
  type Transaction,
  type TransactionType,
} from "../src/api/transactions";

// Stardust activity (from PROFILE): the user-facing view of the ledger —
// purchases, session charges, message fees, welcome credit, gifts, earned
// Stardust — each row signed (+/−) with a running balance-after, so it's
// always obvious where the balance went. Paged via LOAD MORE.

const PAGE_SIZE = 50;

// How each ledger type is presented. "in" rows are gold with a plus sign.
const TYPE_PRESENTATION: Record<
  TransactionType,
  { label: string; icon: string; isIn: boolean }
> = {
  CREDIT: { label: "Purchase", icon: "card-outline", isIn: true },
  DEBIT: { label: "Spent", icon: "moon-outline", isIn: false },
  REFUND: { label: "Refund", icon: "arrow-undo-outline", isIn: true },
  REVERSAL: { label: "Adjustment", icon: "swap-horizontal", isIn: true },
  BONUS: { label: "Welcome credit", icon: "gift-outline", isIn: true },
  GIFT: { label: "Gift", icon: "gift-outline", isIn: true },
  EARN: { label: "Earned", icon: "star-outline", isIn: true },
  EXPIRE: { label: "Expired", icon: "hourglass-outline", isIn: false },
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAmount(t: Transaction): string {
  const p = TYPE_PRESENTATION[t.transaction_type] ?? {
    isIn: t.transaction_type !== "DEBIT",
  };
  const sign = p.isIn ? "+" : "−";
  return `${sign}£${Math.abs(t.amount).toFixed(2)}`;
}

export default function TransactionsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<Transaction[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getMyTransactions(1, PAGE_SIZE);
      setRows(data.transactions);
      setPage(1);
      setTotalPages(data.total_pages);
      setError(null);
    } catch {
      setError("Couldn't load your activity. Pull to retry.");
      setRows((cur) => cur ?? []);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await getMyTransactions(next, PAGE_SIZE);
      setRows((cur) => [...(cur ?? []), ...data.transactions]);
      setPage(next);
      setTotalPages(data.total_pages);
    } catch {
      // quiet — LOAD MORE stays available to retry
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, page, totalPages]);

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
          <Text style={styles.title}>STARDUST ACTIVITY</Text>
        </View>

        {rows === null ? (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.accent} />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.center}>
            {!!error && <Text style={styles.error}>{error}</Text>}
            <Ionicons
              name="sparkles-outline"
              size={40}
              color={COLORS.textFaint}
              style={{ marginBottom: SPACING.md }}
            />
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            <Text style={styles.emptyText}>
              Purchases, reading charges and credits will all show here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(t) => String(t.id)}
            contentContainerStyle={styles.list}
            onRefresh={load}
            refreshing={false}
            ListHeaderComponent={
              error ? <Text style={styles.error}>{error}</Text> : null
            }
            ListFooterComponent={
              page < totalPages ? (
                <TouchableOpacity
                  style={styles.moreBtn}
                  activeOpacity={0.85}
                  onPress={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <ActivityIndicator size="small" color={COLORS.accent} />
                  ) : (
                    <Text style={styles.moreBtnText}>LOAD MORE</Text>
                  )}
                </TouchableOpacity>
              ) : null
            }
            renderItem={({ item }) => {
              const p = TYPE_PRESENTATION[item.transaction_type] ?? {
                label: item.transaction_type,
                icon: "ellipse-outline",
                isIn: false,
              };
              return (
                <View style={styles.row}>
                  <View
                    style={[
                      styles.rowIcon,
                      p.isIn ? styles.rowIconIn : styles.rowIconOut,
                    ]}
                  >
                    <Ionicons
                      name={p.icon as any}
                      size={17}
                      color={p.isIn ? COLORS.accentGold : COLORS.textSecondary}
                    />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {item.description || p.label}
                    </Text>
                    <Text style={styles.rowMeta}>
                      {formatWhen(item.created_at)} · {p.label}
                    </Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text
                      style={[
                        styles.rowAmount,
                        p.isIn ? styles.rowAmountIn : styles.rowAmountOut,
                      ]}
                    >
                      {formatAmount(item)}
                    </Text>
                    <Text style={styles.rowBalance}>
                      £{item.balance_after.toFixed(2)}
                    </Text>
                  </View>
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
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: SPACING.md,
    borderWidth: 1,
  },
  rowIconIn: {
    backgroundColor: alpha(COLORS.accentGold, 0.08),
    borderColor: alpha(COLORS.accentGold, 0.35),
  },
  rowIconOut: {
    backgroundColor: alpha(COLORS.textSecondary, 0.06),
    borderColor: COLORS.borderStrong,
  },
  rowBody: { flex: 1, marginRight: SPACING.sm },
  rowTitle: {
    fontSize: 15,
    color: COLORS.textPrimary,
    fontFamily: FONTS.regular,
    marginBottom: 2,
  },
  rowMeta: {
    fontSize: 12,
    color: COLORS.textFaint,
    fontFamily: FONTS.regular,
  },
  rowRight: { alignItems: "flex-end" },
  rowAmount: {
    fontSize: 15,
    fontFamily: FONTS.semiBold,
    marginBottom: 2,
  },
  rowAmountIn: { color: COLORS.accentGold },
  rowAmountOut: { color: COLORS.textPrimary },
  rowBalance: {
    fontSize: 12,
    color: COLORS.textFaint,
    fontFamily: FONTS.regular,
  },
  moreBtn: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    marginTop: SPACING.sm,
  },
  moreBtnText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    letterSpacing: 1.2,
    fontFamily: FONTS.bold,
  },
});
