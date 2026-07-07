import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
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
import DailyDraw from "../src/components/DailyDraw";

export default function SanctuaryScreen() {
  const router = useRouter();

  return (
    <ScreenBackground scrimOpacity={0.55}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={styles.hero}>
            <Text style={styles.logo}>V</Text>
            <Text style={styles.headline}>
              What does your psychic already see?
            </Text>
            <Text style={styles.subtext}>
              Connect with a gifted reader. Get the clarity you&apos;ve been
              waiting for.
            </Text>
            <TouchableOpacity
              style={styles.cta}
              activeOpacity={0.85}
              onPress={() => router.push("/psychics")}
            >
              <Text style={styles.ctaText}>FIND YOUR PSYCHIC</Text>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Daily Tarot Draw */}
          <DailyDraw />
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  hero: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xxl,
    paddingTop: 40,
    paddingBottom: 44,
  },
  logo: {
    fontSize: 64,
    color: COLORS.accent,
    fontFamily: FONTS.headingExtra,
    marginBottom: SPACING.xxl,
    textShadowColor: alpha(COLORS.accent, 0.4),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  headline: {
    ...TYPOGRAPHY.displayLarge,
    textAlign: "center",
    marginBottom: 18,
  },
  subtext: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: 40,
  },
  cta: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    backgroundColor: COLORS.cta,
    paddingHorizontal: 40,
    paddingVertical: SPACING.lg,
    borderRadius: RADII.md,
    shadowColor: COLORS.cta,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 6,
  },
  ctaText: {
    color: COLORS.ctaText,
    fontSize: 15,
    letterSpacing: 1.2,
    fontFamily: FONTS.bold,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 40,
    marginBottom: SPACING.xxl,
  },
});
