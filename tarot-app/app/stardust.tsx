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
        <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>STARDUST</Text>
      <View style={styles.backBtn} />
    </View>
  );

  // ── Signed-out guard ────────────────────────────────────────────────────
  if (!authLoading && !user) {
    return (
      <ScreenBackground scrimOpacity={0.65}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safe} edges={["top"]}>
          {Header}
          <View style={styles.centerBlock}>
            <Ionicons
              name="sparkles-outline"
              size={40}
              color={COLORS.accent}
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
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground scrimOpacity={0.65}>
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
              tintColor={COLORS.accent}
              colors={[COLORS.accent]}
            />
          }
        >
          {/* ── Balance card ── */}
          <View style={styles.balanceCard}>
            <View style={styles.balanceLabelRow}>
              <Ionicons name="sparkles" size={14} color={COLORS.accentGold} />
              <Text style={styles.balanceLabel}>YOUR STARDUST</Text>
            </View>
            {loading && balance === null ? (
              <ActivityIndicator
                color={COLORS.accentGold}
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
                  color={COLORS.ctaText}
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
                        £{preset}
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
                    <Text style={{ color: COLORS.accentGold }}>
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
                  <ActivityIndicator color={COLORS.ctaText} />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    BUY STARDUST · £{amount}
                  </Text>
                )}
              </TouchableOpacity>

              {!!notice && (
                <View style={styles.noticeCard}>
                  <Ionicons
                    name="time-outline"
                    size={16}
                    color={COLORS.accent}
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.noticeText}>{notice}</Text>
                </View>
              )}
              {!!buyError && <Text style={styles.errorText}>{buyError}</Text>}

              <Text style={styles.secureNote}>
                Secure Stripe checkout · GBP
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: FONTS.heading,
    fontSize: 18,
    letterSpacing: 2,
    color: COLORS.textPrimary,
  },

  centerBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  signedOutText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.lg,
    marginBottom: 28,
  },

  // Balance card
  balanceCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: alpha(COLORS.accentGold, 0.25),
    borderRadius: RADII.xl,
    padding: 22,
    marginTop: SPACING.sm,
    marginBottom: 28,
  },
  balanceLabelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  balanceLabel: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: COLORS.textSecondary,
    fontFamily: FONTS.semiBold,
  },
  balanceValue: {
    fontFamily: FONTS.heading,
    fontSize: 44,
    color: COLORS.accentGold,
    marginTop: 6,
  },

  section: { marginTop: SPACING.xs },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 1.5,
    color: COLORS.textSecondary,
    fontFamily: FONTS.semiBold,
    marginBottom: 14,
  },
  bodyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginBottom: 22,
  },

  // Presets
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  presetBtn: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    backgroundColor: COLORS.surface,
  },
  presetBtnActive: {
    borderColor: COLORS.accent,
    backgroundColor: alpha(COLORS.accent, 0.12),
  },
  presetText: {
    fontSize: 17,
    color: COLORS.textPrimary,
    fontFamily: FONTS.semiBold,
  },
  presetTextActive: { color: COLORS.accent },

  // Preview
  previewCard: {
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.xl,
    padding: 18,
    marginTop: 20,
  },
  previewLabel: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: COLORS.textSecondary,
    fontFamily: FONTS.semiBold,
  },
  previewValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  previewValue: {
    fontFamily: FONTS.heading,
    fontSize: 34,
    color: COLORS.accent,
  },
  previewUnit: {
    fontSize: 13,
    letterSpacing: 1,
    color: COLORS.textSecondary,
    fontFamily: FONTS.semiBold,
  },
  previewBonus: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    marginTop: 6,
  },
  previewNote: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textFaint,
    fontFamily: FONTS.regular,
    marginTop: 10,
  },

  // Primary button (purple CTA — matches app-wide style)
  primaryBtn: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    backgroundColor: COLORS.cta,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACING.xl,
    shadowColor: COLORS.cta,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 6,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: {
    color: COLORS.ctaText,
    fontSize: 15,
    letterSpacing: 1,
    fontFamily: FONTS.bold,
    textAlign: "center",
  },

  // Notices / errors
  noticeCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: alpha(COLORS.accent, 0.08),
    borderWidth: 1,
    borderColor: alpha(COLORS.accent, 0.2),
    borderRadius: RADII.md,
    padding: 14,
    marginTop: 18,
  },
  noticeText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.accent,
    fontFamily: FONTS.regular,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 14,
    fontFamily: FONTS.regular,
    marginTop: 14,
  },
  secureNote: {
    fontSize: 12,
    letterSpacing: 0.5,
    color: COLORS.textFaint,
    textAlign: "center",
    fontFamily: FONTS.regular,
    marginTop: 20,
  },
});
