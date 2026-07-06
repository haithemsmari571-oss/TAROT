import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { COLORS } from "../src/theme/colors";
import { useAuth } from "../src/context/AuthContext";
import { useStardustBalance } from "../src/hooks/useStardustBalance";
import { createStardustCheckoutSession } from "../src/api/payment";
import { STARDUST_PRESETS, previewStardust } from "../src/lib/stardust";

// Purchases on iOS are handled on the website (App Store policy on digital
// goods), so the app sends iOS users to the web Billing page in Safari.
const BILLING_URL = "https://askvalentina.co.uk/billing";

export default function StardustScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { balance, loading, error, refetch } = useStardustBalance();

  const [amount, setAmount] = useState<number>(50);
  const [buying, setBuying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const preview = previewStardust(amount);
  const isIOS = Platform.OS === "ios";

  const onRefresh = async () => {
    setRefreshing(true);
    setNotice(null);
    await refetch();
    setRefreshing(false);
  };

  // Android: create a Stripe Checkout session, open it in an in-app browser
  // tab, then re-fetch the balance once the tab closes. Crediting happens via a
  // server-side Stripe webhook, so a just-completed payment may take a couple of
  // seconds to land — we surface that as a "processing" hint, not an error.
  const onBuy = async () => {
    setBuying(true);
    setNotice(null);
    setBuyError(null);
    const before = balance;
    try {
      const { url } = await createStardustCheckoutSession(amount);
      if (!url) throw new Error("No checkout URL returned");

      await WebBrowser.openBrowserAsync(url);

      // Browser dismissed (for any reason) — reconcile against the server.
      const after = await refetch();
      if (after != null && before != null && after > before) {
        setNotice(`Success — ${(after - before).toLocaleString()} Stardust added.`);
      } else {
        setNotice("Payment processing, pull to refresh in a few seconds.");
      }
    } catch {
      setBuyError(
        "Couldn't start checkout. Check your connection and try again."
      );
    } finally {
      setBuying(false);
    }
  };

  const onManageOnWebsite = async () => {
    setBuyError(null);
    try {
      await Linking.openURL(BILLING_URL);
    } catch {
      setBuyError("Couldn't open the website. Please try again.");
    }
  };

  // ── Header (shared) ─────────────────────────────────────────────────────
  const Header = (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.backBtn}
        activeOpacity={0.7}
        onPress={() => router.back()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="chevron-back" size={24} color={COLORS.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>STARDUST</Text>
      <View style={styles.backBtn} />
    </View>
  );

  // ── Signed-out guard ────────────────────────────────────────────────────
  if (!authLoading && !user) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safe} edges={["top"]}>
          {Header}
          <View style={styles.centerBlock}>
            <Ionicons
              name="sparkles-outline"
              size={40}
              color={COLORS.lavender}
            />
            <Text style={styles.signedOutText}>
              Sign in to view and buy Stardust.
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              activeOpacity={0.85}
              onPress={() => router.push("/profile")}
            >
              <Text style={styles.primaryBtnText}>GO TO SIGN IN</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        {Header}
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.lavender}
              colors={[COLORS.lavender]}
            />
          }
        >
          {/* ── Balance card ── */}
          <View style={styles.balanceCard}>
            <View style={styles.balanceLabelRow}>
              <Ionicons name="sparkles" size={14} color={COLORS.gold} />
              <Text style={styles.balanceLabel}>YOUR STARDUST</Text>
            </View>
            {loading && balance === null ? (
              <ActivityIndicator
                color={COLORS.gold}
                style={{ marginTop: 12, alignSelf: "flex-start" }}
              />
            ) : (
              <Text style={styles.balanceValue}>
                {balance != null ? balance.toLocaleString() : "—"}
              </Text>
            )}
            {!!error && <Text style={styles.errorText}>{error}</Text>}
          </View>

          {isIOS ? (
            // ── iOS: read-only, purchases managed on the website ──
            <View style={styles.section}>
              <Text style={styles.bodyText}>
                Stardust purchases are managed on our website. Tap below to open
                your billing page in Safari.
              </Text>
              <TouchableOpacity
                style={styles.primaryBtn}
                activeOpacity={0.85}
                onPress={onManageOnWebsite}
              >
                <Ionicons
                  name="open-outline"
                  size={16}
                  color="#fff"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.primaryBtnText}>
                  MANAGE STARDUST ON OUR WEBSITE
                </Text>
              </TouchableOpacity>
              {!!buyError && <Text style={styles.errorText}>{buyError}</Text>}
            </View>
          ) : (
            // ── Android: full in-app purchase flow ──
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>CHOOSE AN AMOUNT</Text>

              <View style={styles.presetRow}>
                {STARDUST_PRESETS.map((preset) => {
                  const active = preset === amount;
                  return (
                    <TouchableOpacity
                      key={preset}
                      style={[
                        styles.presetBtn,
                        active && styles.presetBtnActive,
                      ]}
                      activeOpacity={0.8}
                      onPress={() => {
                        setAmount(preset);
                        setNotice(null);
                        setBuyError(null);
                      }}
                    >
                      <Text
                        style={[
                          styles.presetText,
                          active && styles.presetTextActive,
                        ]}
                      >
                        ${preset}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Live preview (estimate only — server computes the real total) */}
              <View style={styles.previewCard}>
                <Text style={styles.previewLabel}>YOU&apos;LL RECEIVE</Text>
                <View style={styles.previewValueRow}>
                  <Text style={styles.previewValue}>
                    {preview.totalPoints.toLocaleString()}
                  </Text>
                  <Text style={styles.previewUnit}>Stardust</Text>
                </View>
                {preview.bonusPoints > 0 && (
                  <Text style={styles.previewBonus}>
                    {preview.basePoints.toLocaleString()} base ·{" "}
                    <Text style={{ color: COLORS.gold }}>
                      +{preview.bonusPoints.toLocaleString()} bonus
                    </Text>{" "}
                    ({preview.tierName} +{Math.round(preview.bonusPct * 100)}%)
                  </Text>
                )}
                <Text style={styles.previewNote}>
                  Estimate only — the exact amount is confirmed securely at
                  checkout.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, buying && styles.primaryBtnDisabled]}
                activeOpacity={0.85}
                onPress={onBuy}
                disabled={buying}
              >
                {buying ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    BUY STARDUST · ${amount}
                  </Text>
                )}
              </TouchableOpacity>

              {!!notice && (
                <View style={styles.noticeCard}>
                  <Ionicons
                    name="time-outline"
                    size={16}
                    color={COLORS.lavender}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.noticeText}>{notice}</Text>
                </View>
              )}
              {!!buyError && <Text style={styles.errorText}>{buyError}</Text>}

              <Text style={styles.secureNote}>
                Secure Stripe checkout · USD
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 48 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    fontSize: 15,
    letterSpacing: 2,
    color: COLORS.text,
    fontFamily: "Poppins_700Bold",
  },

  centerBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  signedOutText: {
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: "center",
    fontFamily: "Poppins_400Regular",
    marginTop: 16,
    marginBottom: 28,
  },

  // Balance card
  balanceCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: "rgba(242,174,64,0.25)",
    borderRadius: 18,
    padding: 22,
    marginTop: 8,
    marginBottom: 28,
  },
  balanceLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  balanceLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: COLORS.textMuted,
    fontFamily: "Poppins_600SemiBold",
  },
  balanceValue: {
    fontSize: 44,
    color: COLORS.gold,
    fontFamily: "Poppins_700Bold",
    marginTop: 6,
  },

  section: { marginTop: 4 },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: COLORS.textMuted,
    fontFamily: "Poppins_600SemiBold",
    marginBottom: 14,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.textMuted,
    fontFamily: "Poppins_400Regular",
    marginBottom: 22,
  },

  // Presets
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  presetBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: COLORS.surface,
  },
  presetBtnActive: {
    borderColor: COLORS.lavender,
    backgroundColor: "rgba(210,185,255,0.12)",
  },
  presetText: {
    fontSize: 15,
    color: COLORS.text,
    fontFamily: "Poppins_600SemiBold",
  },
  presetTextActive: { color: COLORS.lavender },

  // Preview
  previewCard: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    padding: 18,
    marginTop: 20,
  },
  previewLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: COLORS.textMuted,
    fontFamily: "Poppins_600SemiBold",
  },
  previewValueRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 4 },
  previewValue: {
    fontSize: 34,
    color: COLORS.lavender,
    fontFamily: "Poppins_700Bold",
  },
  previewUnit: {
    fontSize: 12,
    letterSpacing: 1,
    color: COLORS.textMuted,
    fontFamily: "Poppins_600SemiBold",
  },
  previewBonus: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontFamily: "Poppins_400Regular",
    marginTop: 6,
  },
  previewNote: {
    fontSize: 11,
    lineHeight: 16,
    color: "rgba(255,255,255,0.4)",
    fontFamily: "Poppins_400Regular",
    marginTop: 10,
  },

  // Primary button (purple CTA — matches app-wide style)
  primaryBtn: {
    flexDirection: "row",
    backgroundColor: COLORS.purple,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    shadowColor: COLORS.purple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 6,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: {
    color: "#fff",
    fontSize: 13,
    letterSpacing: 1,
    fontFamily: "Poppins_700Bold",
    textAlign: "center",
  },

  // Notices / errors
  noticeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(210,185,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(210,185,255,0.2)",
    borderRadius: 12,
    padding: 14,
    marginTop: 18,
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.lavender,
    fontFamily: "Poppins_400Regular",
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    marginTop: 14,
  },
  secureNote: {
    fontSize: 11,
    letterSpacing: 0.5,
    color: "rgba(255,255,255,0.3)",
    textAlign: "center",
    fontFamily: "Poppins_400Regular",
    marginTop: 20,
  },
});
