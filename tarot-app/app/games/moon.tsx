import { useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
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
import { signGlyph } from "../../src/lib/zodiac";
import { moonTonight } from "../../src/lib/moon";

// Moon Phases & Rituals — tonight's phase and the sign the moon sits in,
// computed on-device (src/lib/moon.ts, no network). The moonlit balcony scene
// carries the art; the phase glyph glows over it.

export default function MoonScreen() {
  const router = useRouter();
  // Computed once per mount; reopening the screen refreshes it, which is as
  // often as the sky meaningfully changes.
  const moon = useMemo(() => moonTonight(), []);

  const tonightLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <ScreenBackground source={BACKGROUNDS.moonlitBalcony} scrimOpacity={0.55}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={styles.backLink}
            activeOpacity={0.7}
            onPress={() => router.back()}
          >
            <Ionicons
              name="chevron-back"
              size={18}
              color={COLORS.textSecondary}
            />
            <Text style={styles.backText}>Sanctuary</Text>
          </TouchableOpacity>

          <Text style={styles.kicker}>☾ TONIGHT&apos;S MOON</Text>
          <Text style={styles.dateLine}>{tonightLabel}</Text>

          {/* Phase art — the glowing disc */}
          <View style={styles.moonWrap}>
            <Text style={styles.moonGlyph}>{moon.glyph}</Text>
          </View>

          <Text style={styles.phaseName}>{moon.phaseName}</Text>
          <Text style={styles.moonMeta}>
            {moon.illumination}% illuminated · Moon in{" "}
            {signGlyph(moon.moonSign)} {moon.moonSign}
          </Text>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>WHAT THIS MOON MEANS</Text>
            <Text style={styles.meaning}>{moon.meaning}</Text>

            <Text style={styles.sectionLabel}>TONIGHT&apos;S RITUAL</Text>
            <Text style={styles.ritual}>{moon.ritual}</Text>
          </View>

          {/* The one bridge on this screen */}
          <TouchableOpacity
            style={styles.bridgeBtn}
            activeOpacity={0.75}
            onPress={() => router.push("/psychics")}
          >
            <Text style={styles.bridgeText}>
              A reader can tell you what this moon stirs in your chart →
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingBottom: 48,
  },
  backLink: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  backText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontFamily: FONTS.regular,
    marginLeft: 2,
  },
  kicker: {
    fontSize: 13,
    color: COLORS.accent,
    letterSpacing: 2,
    fontFamily: FONTS.bold,
    marginTop: SPACING.sm,
    marginBottom: 4,
    textAlign: "center",
  },
  dateLine: {
    ...TYPOGRAPHY.caption,
    fontFamily: FONTS.regular,
    textAlign: "center",
  },
  moonWrap: {
    alignSelf: "center",
    marginTop: SPACING.xl,
    width: 148,
    height: 148,
    borderRadius: 74,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: alpha(COLORS.accent, 0.06),
    borderWidth: 1,
    borderColor: alpha(COLORS.accent, 0.2),
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 32,
    elevation: 8,
  },
  moonGlyph: {
    fontSize: 88,
    textShadowColor: alpha(COLORS.accent, 0.6),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  phaseName: {
    ...TYPOGRAPHY.display,
    color: COLORS.accentGold,
    textAlign: "center",
    marginTop: SPACING.xl,
  },
  moonMeta: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.xs,
  },
  card: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.xl,
    padding: SPACING.xl,
  },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 1.5,
    color: COLORS.textFaint,
    fontFamily: FONTS.semiBold,
    marginBottom: SPACING.sm,
  },
  meaning: {
    ...TYPOGRAPHY.body,
    marginBottom: SPACING.xl,
  },
  ritual: {
    ...TYPOGRAPHY.body,
    color: COLORS.accent,
    fontStyle: "italic",
  },
  bridgeBtn: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  bridgeText: {
    color: COLORS.accent,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: FONTS.semiBold,
    textAlign: "center",
  },
});
