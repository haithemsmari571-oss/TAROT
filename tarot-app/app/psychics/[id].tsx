import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
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
import type { Psychic } from "../../src/types";
import {
  creditMinutes,
  getHalo,
  getTier,
  hexToRgba,
  perMinute,
} from "../../src/utils/psychic";
import { useAuth } from "../../src/context/AuthContext";
import { useCredit, formatPounds } from "../../src/context/CreditContext";
import { useFavorites } from "../../src/context/FavoritesContext";
import { requestChat } from "../../src/api/chat";
import { getMyBalance } from "../../src/api/payment";
import { openBillingPage } from "../../src/lib/billing";
import {
  markPushPromptDeclined,
  requestPushPermissionAndRegister,
  shouldOfferPushPrompt,
} from "../../src/lib/notifications";
import BottomSheet, {
  SheetTitle,
  SheetBody,
  SheetNote,
  SheetPrimaryButton,
  SheetQuietButton,
} from "../../src/components/BottomSheet";

/** One full minute at the reader's rate — the backend's affordability gate. */
function requiredToStart(pricePerSecond: number | null): number {
  return Math.round((pricePerSecond || 0) * 60 * 100) / 100;
}

/** Spendable total in pounds (earned + credit + paid), same as the backend. */
async function fetchSpendable(): Promise<number> {
  const bal = await getMyBalance();
  return bal.stardust_total ?? (bal.balance ?? 0) + (bal.earned_balance ?? 0);
}

export default function PsychicDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { hasCredit, creditBalance, refresh: refreshCredit } = useCredit();
  const { isFavorite, toggle: toggleFavorite } = useFavorites();
  const [psychic, setPsychic] = useState<Psychic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  // Insufficient-balance sheet: set with her spendable £ when a reading can't start.
  const [shortfall, setShortfall] = useState<{ spendable: number } | null>(null);
  // Branded replacements for the old raw alerts.
  const [signInSheet, setSignInSheet] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetNote, setSheetNote] = useState<string | null>(null);
  // Branded pre-permission sheet, shown once right after her first request —
  // the OS dialog only fires if she taps ENABLE. Never re-shown after "Not now".
  const [pushSheet, setPushSheet] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/api/psychic/${id}`);
      setPsychic(res.data);
      setError(null);
    } catch (err) {
      console.error("Failed to load psychic:", err);
      setError("Couldn't load this psychic. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStartReading = useCallback(async () => {
    if (!psychic) return;

    // Requesting a chat needs a signed-in client.
    if (!user) {
      setSignInSheet(true);
      return;
    }

    setRequesting(true);

    // Soft client-side affordability check (server stays authoritative): show
    // the top-up sheet without a doomed round trip. A failed balance fetch
    // falls through to the request — the 402 handler below catches it anyway.
    try {
      const spendable = await fetchSpendable();
      if (spendable < requiredToStart(psychic.price_per_second)) {
        setSheetNote(null);
        setShortfall({ spendable });
        setRequesting(false);
        return;
      }
    } catch {
      // ignore — proceed to the request
    }

    try {
      await requestChat(psychic.id, "Hello, I'd like to start a reading.");
      // First meaningful moment for the push ask: she just requested a reading
      // and will want to know the instant it's accepted. Our branded sheet
      // first — the OS dialog only on ENABLE. (No-op in Expo Go.)
      if (await shouldOfferPushPrompt()) {
        setPushSheet(true);
        return;
      }
      // Land on the Sessions tab so the new pending request is visible.
      router.push("/sessions");
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      const existingChatId = err?.response?.data?.existing_chat_id;

      // Backend affordability gate — never surface this as a raw error.
      if (status === 402) {
        const serverBalance = err?.response?.data?.balance;
        setSheetNote(null);
        setShortfall({
          spendable: typeof serverBalance === "number" ? serverBalance : 0,
        });
        return;
      }

      // A chat is already live/paused — never a dead end: take her straight
      // into it (the chat screen resolves its own state: join, grace, etc.).
      if (status === 400 && existingChatId) {
        router.push({
          pathname: "/sessions/[chatId]",
          params: { chatId: String(existingChatId) },
        });
      } else {
        setRequestError(
          typeof detail === "string" && detail
            ? detail
            : "Please check your connection and try again."
        );
      }
    } finally {
      setRequesting(false);
    }
  }, [psychic, user, router]);

  // Sheet CTA: open the website billing page, then re-check on return. If the
  // payment landed, close the sheet so her next tap starts the reading; if not
  // yet, keep it open with the fresh number and a gentle note.
  const onSheetTopUp = useCallback(async () => {
    if (!psychic) return;
    setSheetBusy(true);
    setSheetNote(null);
    await openBillingPage();
    try {
      const spendable = await fetchSpendable();
      await refreshCredit();
      if (spendable >= requiredToStart(psychic.price_per_second)) {
        setShortfall(null);
      } else {
        setShortfall({ spendable });
        setSheetNote("Payments can take a few seconds to arrive.");
      }
    } catch {
      setSheetNote("Couldn't check your balance — give it a few seconds.");
    } finally {
      setSheetBusy(false);
    }
  }, [psychic, refreshCredit]);

  // Push pre-permission sheet actions. Both paths end on the Sessions tab so
  // she sees her pending request either way.
  const finishPushSheet = useCallback(() => {
    setPushSheet(false);
    router.push("/sessions");
  }, [router]);

  const onEnablePush = useCallback(async () => {
    setPushBusy(true);
    await requestPushPermissionAndRegister();
    setPushBusy(false);
    finishPushSheet();
  }, [finishPushSheet]);

  const onDeclinePush = useCallback(() => {
    void markPushPromptDeclined();
    finishPushSheet();
  }, [finishPushSheet]);

  const BackButton = (
    <TouchableOpacity
      style={styles.backBtn}
      activeOpacity={0.7}
      onPress={() => router.back()}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <ScreenBackground source={BACKGROUNDS.zodiacHall2} scrimOpacity={0.7}>
        <SafeAreaView style={styles.stateRoot} edges={["top"]}>
          <StatusBar style="light" />
          <View style={styles.topBar}>{BackButton}</View>
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.accent} />
          </View>
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  if (error || !psychic) {
    return (
      <ScreenBackground source={BACKGROUNDS.zodiacHall2} scrimOpacity={0.7}>
        <SafeAreaView style={styles.stateRoot} edges={["top"]}>
          <StatusBar style="light" />
          <View style={styles.topBar}>{BackButton}</View>
          <View style={styles.center}>
            <Text style={styles.error}>{error ?? "Psychic not found."}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              activeOpacity={0.85}
              onPress={() => {
                setLoading(true);
                load();
              }}
            >
              <Text style={styles.retryText}>RETRY</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  const halo = getHalo(psychic.categories);
  const tier = getTier(psychic.price_per_second);
  const rate = perMinute(psychic.price_per_second);
  const categories = psychic.categories ?? [];
  const availability = psychic.availability ?? [];

  // Welcome-credit framing: while the credit is unspent and covers at least a
  // minute at this reader's rate, the sticky CTA sells the free reading.
  const freeMinutes =
    hasCredit && creditBalance != null
      ? creditMinutes(creditBalance, psychic.price_per_second)
      : 0;
  const showFree = freeMinutes >= 1 && creditBalance != null;

  return (
    <ScreenBackground source={BACKGROUNDS.zodiacHall2} scrimOpacity={0.7}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll} bounces>
        {/* HERO PHOTO */}
        <View style={styles.hero}>
          {psychic.profile_picture_url ? (
            <Image
              source={{ uri: psychic.profile_picture_url }}
              style={styles.heroPhoto}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.heroPhoto, styles.heroFallback]}>
              <Text style={{ fontSize: 72, color: hexToRgba(halo, 0.5) }}>✦</Text>
            </View>
          )}
          {/* Bottom fade so the hero photo blends smoothly into the page.
              Same RGB, alpha 0 -> opaque, for a clean fade (not a flat band). */}
          <LinearGradient
            colors={[hexToRgba(COLORS.background, 0), COLORS.background]}
            locations={[0, 1]}
            style={styles.heroFade}
            pointerEvents="none"
          />

          {/* Floating back button + favourite heart over the hero */}
          <SafeAreaView style={styles.heroTopBar} edges={["top"]}>
            {BackButton}
            {!!user && (
              <TouchableOpacity
                style={styles.heartBtn}
                activeOpacity={0.7}
                onPress={() => void toggleFavorite(psychic.id)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons
                  name={isFavorite(psychic.id) ? "heart" : "heart-outline"}
                  size={22}
                  color={
                    isFavorite(psychic.id)
                      ? COLORS.accentGold
                      : COLORS.textPrimary
                  }
                />
              </TouchableOpacity>
            )}
          </SafeAreaView>

          {/* Tier badge */}
          <View style={[styles.tierBadge, { backgroundColor: tier.color }]}>
            <Text style={styles.tierText}>{tier.label}</Text>
          </View>

          {/* Online indicator */}
          {psychic.is_online && (
            <View style={styles.onlineWrap}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>ONLINE</Text>
            </View>
          )}
        </View>

        {/* BODY */}
        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{psychic.username}</Text>
            {psychic.is_verified && (
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={COLORS.accent}
                style={{ marginLeft: 8 }}
              />
            )}
          </View>

          {/* Rate */}
          <View style={styles.rateWrap}>
            <Text style={[styles.rate, { color: tier.color }]}>£{rate}</Text>
            <Text style={styles.rateUnit}>/min</Text>
          </View>

          {/* Categories */}
          {categories.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>SPECIALTIES</Text>
              <View style={styles.tagRow}>
                {categories.map((cat, i) => {
                  const isPrimary = i === 0;
                  return (
                    <View
                      key={cat.id}
                      style={[
                        styles.tag,
                        isPrimary
                          ? {
                              borderColor: halo,
                              backgroundColor: hexToRgba(halo, 0.08),
                            }
                          : { borderColor: COLORS.borderStrong },
                      ]}
                    >
                      <Text
                        style={[
                          styles.tagText,
                          { color: isPrimary ? halo : COLORS.textSecondary },
                        ]}
                      >
                        {cat.title}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Bio */}
          {!!psychic.bio && (
            <>
              <Text style={styles.sectionLabel}>ABOUT</Text>
              <Text style={styles.bio}>{psychic.bio}</Text>
            </>
          )}

          {/* Availability */}
          {availability.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>AVAILABILITY</Text>
              <View style={styles.availList}>
                {availability.map((slot) => (
                  <View key={slot.id} style={styles.availRow}>
                    <Text style={styles.availDay}>{slot.day_of_the_week}</Text>
                    <Text style={styles.availTime}>
                      {slot.start_at} – {slot.end_at}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* STICKY CTA */}
      <SafeAreaView edges={["bottom"]} style={styles.ctaBar}>
        {showFree && (
          <Text style={styles.freeLine}>
            Your {formatPounds(creditBalance)} credit covers ~{freeMinutes} min
            with {psychic.username}
          </Text>
        )}
        <TouchableOpacity
          style={[styles.cta, requesting && styles.ctaDisabled]}
          activeOpacity={0.85}
          onPress={handleStartReading}
          disabled={requesting}
        >
          {requesting ? (
            <ActivityIndicator color={COLORS.ctaText} />
          ) : (
            <Text style={styles.ctaText}>
              {showFree ? "START FREE READING" : "START READING →"}
            </Text>
          )}
        </TouchableOpacity>
      </SafeAreaView>

      {/* Insufficient balance — branded top-up sheet, never a dead end. */}
      <BottomSheet visible={!!shortfall} onClose={() => setShortfall(null)}>
        <SheetTitle>Top up to begin your reading</SheetTitle>
        <SheetBody>
          {psychic.username} is £{rate}/min — you have £
          {(shortfall?.spendable ?? 0).toFixed(2)}.
        </SheetBody>
        {hasCredit && creditBalance != null && (
          <SheetNote>
            Your {formatPounds(creditBalance)} welcome credit doesn&apos;t cover
            a full minute at this rate.
          </SheetNote>
        )}
        {!!sheetNote && <SheetNote>{sheetNote}</SheetNote>}
        <SheetPrimaryButton
          label="TOP UP STARDUST"
          loading={sheetBusy}
          onPress={onSheetTopUp}
        />
        <SheetQuietButton label="Not now" onPress={() => setShortfall(null)} />
      </BottomSheet>

      {/* Push pre-permission — our sheet first, the OS dialog only on ENABLE. */}
      <BottomSheet visible={pushSheet} onClose={onDeclinePush}>
        <SheetTitle>Know the moment it begins</SheetTitle>
        <SheetBody>
          Get notified the moment your psychic accepts — even if your phone is
          locked.
        </SheetBody>
        <SheetPrimaryButton
          label="ENABLE NOTIFICATIONS"
          loading={pushBusy}
          onPress={onEnablePush}
        />
        <SheetQuietButton label="Not now" onPress={onDeclinePush} />
      </BottomSheet>

      {/* Signed-out tap on START READING — warm nudge to the Profile tab. */}
      <BottomSheet visible={signInSheet} onClose={() => setSignInSheet(false)}>
        <SheetTitle>Sign in to start a reading</SheetTitle>
        <SheetBody>
          Sign in from the Profile tab, then tap START READING again —{" "}
          {psychic.username} will be waiting.
        </SheetBody>
        <SheetPrimaryButton
          label="GO TO PROFILE"
          onPress={() => {
            setSignInSheet(false);
            router.push("/profile");
          }}
        />
        <SheetQuietButton label="Not now" onPress={() => setSignInSheet(false)} />
      </BottomSheet>

      {/* Request failed for a non-recoverable reason — branded, not raw. */}
      <BottomSheet
        visible={!!requestError}
        onClose={() => setRequestError(null)}
      >
        <SheetTitle>Couldn&apos;t start your reading</SheetTitle>
        <SheetBody>{requestError}</SheetBody>
        <SheetPrimaryButton label="OK" onPress={() => setRequestError(null)} />
      </BottomSheet>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  stateRoot: { flex: 1 },
  topBar: { paddingHorizontal: SPACING.md, paddingTop: SPACING.xs },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xxl,
  },
  scroll: { paddingBottom: SPACING.xl },

  backBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.photoScrim,
  },

  hero: {
    width: "100%",
    aspectRatio: 3 / 4,
    position: "relative",
    backgroundColor: COLORS.surface,
  },
  heroPhoto: { width: "100%", height: "100%" },
  heroFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surfaceElevated,
  },
  heroFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "50%",
  },
  heroTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
  },
  heartBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.photoScrim,
  },
  tierBadge: {
    position: "absolute",
    bottom: 16,
    left: 16,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 20,
  },
  tierText: {
    fontSize: 12,
    letterSpacing: 0.8,
    color: COLORS.background,
    fontFamily: FONTS.bold,
  },
  onlineWrap: {
    position: "absolute",
    top: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.photoScrim,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.online,
  },
  onlineText: {
    fontSize: 11,
    letterSpacing: 1,
    color: COLORS.online,
    fontFamily: FONTS.semiBold,
  },

  body: { padding: 20 },
  nameRow: { flexDirection: "row", alignItems: "center" },
  name: {
    ...TYPOGRAPHY.display,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  rateWrap: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginTop: 6,
  },
  rate: { fontSize: 26, fontFamily: FONTS.bold },
  rateUnit: {
    fontSize: 14,
    color: COLORS.textFaint,
    fontFamily: FONTS.regular,
  },

  sectionLabel: {
    fontSize: 12,
    letterSpacing: 1.2,
    color: COLORS.textFaint,
    fontFamily: FONTS.semiBold,
    marginTop: SPACING.xl,
    marginBottom: SPACING.md,
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  tag: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontFamily: FONTS.semiBold,
  },
  bio: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  availList: { gap: 10 },
  availRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 10,
  },
  availDay: {
    fontSize: 16,
    color: COLORS.textPrimary,
    textTransform: "capitalize",
    fontFamily: FONTS.semiBold,
  },
  availTime: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
  },

  ctaBar: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 20,
    paddingTop: SPACING.md,
  },
  freeLine: {
    fontSize: 14,
    lineHeight: 20,
    color: alpha(COLORS.accentGold, 0.9),
    fontFamily: FONTS.regular,
    textAlign: "center",
    marginBottom: SPACING.sm,
  },
  cta: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    backgroundColor: COLORS.cta,
    paddingVertical: SPACING.lg,
    borderRadius: RADII.md,
    alignItems: "center",
    shadowColor: COLORS.cta,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 6,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: {
    color: COLORS.ctaText,
    fontSize: 15,
    letterSpacing: 1.2,
    fontFamily: FONTS.bold,
  },
  error: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: 20,
  },
  retryBtn: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.cta,
    paddingHorizontal: 28,
    paddingVertical: SPACING.md,
    borderRadius: RADII.sm,
  },
  retryText: {
    color: COLORS.accent,
    fontSize: 14,
    letterSpacing: 1,
    fontFamily: FONTS.bold,
  },
});
