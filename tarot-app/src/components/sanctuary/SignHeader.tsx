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

// Personalized hero: her sign's artwork behind a time-of-day greeting, the
// date, and the streak chip. The emotional anchor of the SANCTUARY.

function greetingForNow(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function todayLine(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function SignHeader({
  sign,
  username,
  streakLength,
}: {
  sign: string;
  username?: string | null;
  streakLength: number;
}) {
  return (
    <View style={styles.wrap}>
      <ImageBackground
        source={signPortrait(sign)}
        style={styles.bg}
        imageStyle={styles.bgImage}
        resizeMode="cover"
      >
        <View style={styles.scrim} />

        {/* Signs without dedicated art yet (Cancer/Pisces) get a branded glyph
            watermark over their element scene. */}
        {!hasDedicatedPortrait(sign) && (
          <View style={styles.glyphWatermarkWrap} pointerEvents="none">
            <Text style={styles.glyphWatermark}>{signGlyph(sign)}</Text>
          </View>
        )}

        {streakLength > 0 && (
          <View style={styles.streakChip}>
            <Text style={styles.streakText}>✦ DAY {streakLength}</Text>
          </View>
        )}

        <View style={styles.content}>
          <Text style={styles.signLine}>
            {signGlyph(sign)} {sign.toUpperCase()}
          </Text>
          <Text style={styles.greeting}>
            {greetingForNow()}
            {username ? `, ${username}` : ""} ✦
          </Text>
          <Text style={styles.date}>{todayLine()}</Text>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 20,
    marginTop: SPACING.md,
    borderRadius: RADII.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: alpha(COLORS.accent, 0.25),
  },
  bg: {
    minHeight: 190,
    justifyContent: "flex-end",
  },
  bgImage: {
    opacity: 0.85,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: alpha(COLORS.background, 0.45),
  },
  glyphWatermarkWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: SPACING.xl,
  },
  glyphWatermark: {
    fontSize: 96,
    color: alpha(COLORS.accentGold, 0.28),
    textShadowColor: alpha(COLORS.accentGold, 0.35),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 22,
  },
  streakChip: {
    position: "absolute",
    top: SPACING.md,
    right: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: alpha(COLORS.accentGold, 0.5),
    backgroundColor: alpha(COLORS.background, 0.55),
  },
  streakText: {
    fontSize: 13,
    letterSpacing: 1.2,
    color: COLORS.accentGold,
    fontFamily: FONTS.bold,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  signLine: {
    fontSize: 13,
    letterSpacing: 2,
    color: COLORS.accentGold,
    fontFamily: FONTS.bold,
    marginBottom: 6,
  },
  greeting: {
    ...TYPOGRAPHY.display,
    textTransform: "capitalize",
  },
  date: {
    ...TYPOGRAPHY.caption,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
});
