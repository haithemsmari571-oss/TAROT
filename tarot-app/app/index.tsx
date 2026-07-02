import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { COLORS } from "../src/theme/colors";

export default function SanctuaryScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          {/* Logo */}
          <Text style={styles.logo}>V</Text>

          {/* Headline */}
          <Text style={styles.headline}>
            What does your psychic already see?
          </Text>

          {/* Subtext */}
          <Text style={styles.subtext}>
            Connect with a gifted reader. Get the clarity you&apos;ve been
            waiting for.
          </Text>

          {/* CTA */}
          <TouchableOpacity
            style={styles.cta}
            activeOpacity={0.85}
            onPress={() => router.push("/psychics")}
          >
            <Text style={styles.ctaText}>FIND YOUR PSYCHIC</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  safe: { flex: 1 },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  logo: {
    fontSize: 64,
    color: COLORS.lavender,
    fontFamily: "Poppins_700Bold",
    marginBottom: 40,
    textShadowColor: "rgba(210,185,255,0.4)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  headline: {
    fontSize: 30,
    lineHeight: 38,
    color: COLORS.text,
    textAlign: "center",
    fontFamily: "Poppins_700Bold",
    marginBottom: 18,
  },
  subtext: {
    fontSize: 15,
    lineHeight: 23,
    color: COLORS.textMuted,
    textAlign: "center",
    fontFamily: "Poppins_400Regular",
    marginBottom: 48,
  },
  cta: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: COLORS.purple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 6,
  },
  ctaText: {
    color: "#fff",
    fontSize: 13,
    letterSpacing: 1.2,
    fontFamily: "Poppins_700Bold",
  },
});
