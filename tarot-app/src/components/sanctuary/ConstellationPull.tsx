import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  COLORS,
  FONTS,
  TYPOGRAPHY,
  SPACING,
  RADII,
  TOUCH_TARGET,
  alpha,
} from "../../theme";
import { TAROT_CARDS } from "../../data/tarotCards";
import {
  pullDailyCard,
  type PullResult,
  type StreakStatus,
  type TodayCard,
  type UpsellCopy,
} from "../../api/constellation";

// The Constellation Pull: one card a day, revealed with a flip; the server
// rolls and credits the Stardust reward. Streak shown as a 7-star arc that
// fills through the cycle. Carries the ONE bridge for this part of the scroll
// (the backend's own upsell copy).

function cardImage(cardKey: number | undefined) {
  if (cardKey == null) return null;
  return TAROT_CARDS[cardKey]?.image ?? null;
}

export default function ConstellationPull({
  pulled,
  rewardToday,
  card,
  streak,
  upsell,
  onPulled,
}: {
  pulled: boolean; // already pulled today (from GET)
  rewardToday: number | null; // today's reward if already pulled
  card: TodayCard | null;
  streak: StreakStatus;
  upsell: UpsellCopy;
  onPulled: () => void; // parent refreshes + reveals Your Day
}) {
  const router = useRouter();
  const [pulling, setPulling] = useState(false);
  const [result, setResult] = useState<PullResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const revealed = pulled || result != null;
  const shownStreak = result?.streak ?? streak;
  const reward = result?.reward ?? rewardToday;
  const bonus = result?.bonus ?? 0;

  // Flip progress: 0 = face down, 1 = face up. Starts revealed if she already
  // pulled today (no animation on reload — calm).
  const progress = useRef(new Animated.Value(pulled ? 1 : 0)).current;

  useEffect(() => {
    if (result) {
      Animated.timing(progress, {
        toValue: 1,
        duration: 620,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [result, progress]);

  const onPull = async () => {
    setPulling(true);
    setError(null);
    try {
      const r = await pullDailyCard();
      setResult(r);
      onPulled();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.response?.data?.detail;
      // "Already pulled" (e.g. second device) — resync quietly.
      if (typeof msg === "string" && /already/i.test(msg)) {
        onPulled();
      } else {
        setError("The cards didn't answer — check your connection and try again.");
      }
    } finally {
      setPulling(false);
    }
  };

  const backRotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });
  const frontRotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["180deg", "360deg"],
  });

  const img = cardImage(card?.card_key);
  const stars = Array.from({ length: shownStreak.cycle }, (_, i) => i);

  return (
    <View style={styles.section}>
      <Text style={styles.kicker}>✦ The Constellation Pull</Text>
      <Text style={styles.sub}>One card each day. Your streak lights the sky.</Text>

      {/* Card */}
      <View style={styles.cardArea}>
        <View style={styles.cardAspect}>
          <Animated.View
            style={[
              styles.face,
              { transform: [{ perspective: 900 }, { rotateY: backRotate }] },
            ]}
          >
            <LinearGradient
              colors={["#2A1B47", "#160E29", COLORS.surface]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardBack}
            >
              <View style={styles.backFrame}>
                <Text style={styles.backSigil}>✦</Text>
              </View>
            </LinearGradient>
          </Animated.View>

          <Animated.View
            style={[
              styles.face,
              styles.frontFace,
              { transform: [{ perspective: 900 }, { rotateY: frontRotate }] },
            ]}
          >
            {img ? (
              <Image source={img} style={styles.cardImage} resizeMode="cover" />
            ) : (
              <View style={[styles.cardImage, styles.cardFallback]}>
                <Text style={styles.backSigil}>✦</Text>
              </View>
            )}
          </Animated.View>
        </View>
      </View>

      {revealed && !!card && (
        <Text style={styles.cardName}>{card.card_name}</Text>
      )}

      {/* Reward + streak */}
      {revealed ? (
        <>
          {reward != null && (
            <Text style={styles.rewardLine}>
              ✦ +{reward} Stardust earned
              {bonus > 0 ? `  ·  +${bonus} streak bonus ✦` : ""}
            </Text>
          )}
          <View style={styles.starRow}>
            {stars.map((i) => (
              <Text
                key={i}
                style={
                  i < shownStreak.week_position
                    ? styles.starLit
                    : styles.starDim
                }
              >
                ✦
              </Text>
            ))}
          </View>
          <Text style={styles.streakCaption}>
            {shownStreak.days_to_bonus === 0
              ? "Cycle complete — a new one begins tomorrow ✦"
              : `${shownStreak.days_to_bonus} more ${
                  shownStreak.days_to_bonus === 1 ? "day" : "days"
                } to your streak bonus`}
          </Text>

          {/* The one bridge for this scroll section */}
          <TouchableOpacity
            style={styles.bridge}
            activeOpacity={0.8}
            onPress={() => router.push("/psychics")}
          >
            <Text style={styles.bridgeHeadline}>{upsell.headline}</Text>
            <Text style={styles.bridgeCta}>{upsell.cta_label} →</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <TouchableOpacity
            style={styles.pullBtn}
            activeOpacity={0.85}
            onPress={onPull}
            disabled={pulling}
          >
            {pulling ? (
              <ActivityIndicator color={COLORS.ctaText} />
            ) : (
              <Text style={styles.pullText}>PULL TODAY&apos;S CARD</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 20,
    marginTop: SPACING.xl,
    alignItems: "center",
  },
  kicker: {
    fontSize: 14,
    color: COLORS.accent,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontFamily: FONTS.bold,
    marginBottom: 6,
  },
  sub: {
    ...TYPOGRAPHY.caption,
    fontFamily: FONTS.regular,
    marginBottom: SPACING.lg,
  },
  cardArea: { width: "44%", maxWidth: 170 },
  cardAspect: { width: "100%", aspectRatio: 0.62 },
  face: {
    ...StyleSheet.absoluteFillObject,
    backfaceVisibility: "hidden",
    borderRadius: RADII.md,
    overflow: "hidden",
  },
  frontFace: {
    borderWidth: 1.5,
    borderColor: alpha(COLORS.accentGold, 0.55),
  },
  cardBack: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: alpha(COLORS.accent, 0.25),
    borderRadius: RADII.md,
  },
  backFrame: {
    width: "72%",
    height: "82%",
    borderWidth: 1,
    borderColor: alpha(COLORS.accent, 0.3),
    borderRadius: RADII.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  backSigil: {
    fontSize: 34,
    color: alpha(COLORS.accent, 0.85),
    textShadowColor: alpha(COLORS.accent, 0.5),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  cardImage: { width: "100%", height: "100%" },
  cardFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surfaceElevated,
  },
  cardName: {
    ...TYPOGRAPHY.headline,
    color: COLORS.accent,
    marginTop: SPACING.md,
  },
  rewardLine: {
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.accentGold,
    fontFamily: FONTS.semiBold,
    marginTop: SPACING.sm,
    textAlign: "center",
  },
  starRow: {
    flexDirection: "row",
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  starLit: {
    fontSize: 20,
    color: COLORS.accentGold,
    textShadowColor: alpha(COLORS.accentGold, 0.6),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  starDim: {
    fontSize: 20,
    color: alpha(COLORS.accent, 0.2),
  },
  streakCaption: {
    ...TYPOGRAPHY.caption,
    fontFamily: FONTS.regular,
    marginTop: 6,
  },
  bridge: {
    minHeight: TOUCH_TARGET,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACING.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: alpha(COLORS.accentGold, 0.35),
    backgroundColor: alpha(COLORS.accentGold, 0.06),
  },
  bridgeHeadline: {
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.textPrimary,
    fontFamily: FONTS.regular,
    textAlign: "center",
  },
  bridgeCta: {
    fontSize: 15,
    color: COLORS.accentGold,
    fontFamily: FONTS.semiBold,
    marginTop: 4,
  },
  error: {
    ...TYPOGRAPHY.caption,
    color: COLORS.error,
    fontFamily: FONTS.regular,
    marginTop: SPACING.sm,
    textAlign: "center",
  },
  pullBtn: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: COLORS.cta,
    paddingVertical: SPACING.lg,
    borderRadius: RADII.md,
    marginTop: SPACING.lg,
    shadowColor: COLORS.cta,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 6,
  },
  pullText: {
    color: COLORS.ctaText,
    fontSize: 15,
    letterSpacing: 1.2,
    fontFamily: FONTS.bold,
  },
});
