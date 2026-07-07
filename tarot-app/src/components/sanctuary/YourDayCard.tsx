import { View, Text, ImageBackground, StyleSheet } from "react-native";
import {
  COLORS,
  FONTS,
  TYPOGRAPHY,
  SPACING,
  RADII,
  alpha,
} from "../../theme";
import {
  hasDedicatedPortrait,
  signGlyph,
  signPortrait,
} from "../../lib/zodiac";
import type { TodayCard } from "../../api/constellation";

// "Your Day" — the per-sign daily reading under her sign's artwork. The full
// text stays veiled until she pulls today's card (the pull is the ritual; this
// is the reward). No CTA here: the content's own open-loop ending is the
// bridge, and the pull section already carries the tappable one.

export default function YourDayCard({
  sign,
  card,
  revealed,
}: {
  sign: string;
  card: TodayCard;
  revealed: boolean;
}) {
  return (
    <View style={styles.card}>
      {/* Sign art header */}
      <ImageBackground
        source={signPortrait(sign)}
        style={styles.header}
        imageStyle={styles.headerImage}
        resizeMode="cover"
      >
        <View style={styles.headerScrim} />
        {!hasDedicatedPortrait(sign) && (
          <View style={styles.glyphWatermarkWrap} pointerEvents="none">
            <Text style={styles.glyphWatermark}>{signGlyph(sign)}</Text>
          </View>
        )}
        <Text style={styles.kicker}>YOUR DAY</Text>
        <Text style={styles.signLine}>
          {signGlyph(sign)} {sign.toUpperCase()}
        </Text>
      </ImageBackground>

      {revealed ? (
        <View style={styles.body}>
          <Text style={styles.interpretation}>{card.interpretation}</Text>

          <Text style={styles.sectionLabel}>TODAY&apos;S MANIFESTATION</Text>
          <Text style={styles.manifestation}>“{card.manifestation}”</Text>

          <Text style={styles.sectionLabel}>A SMALL RITUAL</Text>
          <Text style={styles.ritual}>{card.ritual}</Text>

          <Text style={styles.quote}>✦ {card.quote_line}</Text>
        </View>
      ) : (
        <View style={styles.lockedBody}>
          <Text style={styles.lockedSigil}>✦</Text>
          <Text style={styles.lockedText}>
            Pull today&apos;s card above to reveal your reading.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginTop: SPACING.xl,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.xl,
    overflow: "hidden",
  },
  header: {
    minHeight: 96,
    justifyContent: "flex-end",
    padding: SPACING.lg,
  },
  headerImage: { opacity: 0.8 },
  headerScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: alpha(COLORS.background, 0.5),
  },
  glyphWatermarkWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: SPACING.xl,
  },
  glyphWatermark: {
    fontSize: 56,
    color: alpha(COLORS.accentGold, 0.28),
    textShadowColor: alpha(COLORS.accentGold, 0.35),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  kicker: {
    fontSize: 12,
    letterSpacing: 2,
    color: COLORS.textSecondary,
    fontFamily: FONTS.semiBold,
  },
  signLine: {
    fontFamily: FONTS.heading,
    fontSize: 21,
    lineHeight: 27,
    color: COLORS.accentGold,
    marginTop: 2,
  },
  body: {
    padding: SPACING.lg,
  },
  interpretation: {
    ...TYPOGRAPHY.body,
  },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 1.5,
    color: COLORS.textFaint,
    fontFamily: FONTS.semiBold,
    marginTop: SPACING.xl,
    marginBottom: SPACING.sm,
  },
  manifestation: {
    ...TYPOGRAPHY.body,
    color: COLORS.accent,
    fontStyle: "italic",
  },
  ritual: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  quote: {
    fontSize: 16,
    lineHeight: 24,
    color: alpha(COLORS.accentGold, 0.9),
    fontFamily: FONTS.regular,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: SPACING.xl,
  },
  lockedBody: {
    alignItems: "center",
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
  },
  lockedSigil: {
    fontSize: 28,
    color: alpha(COLORS.accent, 0.6),
  },
  lockedText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
});
