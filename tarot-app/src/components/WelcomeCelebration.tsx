import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import {
  COLORS,
  FONTS,
  TYPOGRAPHY,
  SPACING,
  RADII,
  TOUCH_TARGET,
  alpha,
} from "../theme";
import ScreenBackground from "./ScreenBackground";
import { useAuth } from "../context/AuthContext";
import { useCredit, formatPounds } from "../context/CreditContext";

// One-time full-screen welcome moment: the first time a signed-in account with
// unspent welcome credit opens the app, tell her the £15 exists. Fires after a
// fresh signup, after a verified sign-in, and once for existing accounts that
// were never told. The "shown" flag persists per user id so it never repeats.

const FLAG_PREFIX = "welcome_celebration_shown_v1:";

export default function WelcomeCelebration() {
  const { user } = useAuth();
  const { creditBalance } = useCredit();
  const router = useRouter();

  const [visible, setVisible] = useState(false);
  // Freeze the amount at show time so the headline doesn't change mid-moment.
  const [amount, setAmount] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!user || creditBalance == null || creditBalance <= 0) return;
    let cancelled = false;
    (async () => {
      const seen = await AsyncStorage.getItem(FLAG_PREFIX + String(user.id));
      if (cancelled || seen) return;
      setAmount(creditBalance);
      setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, creditBalance]);

  // One gentle fade-in — no particle storms.
  useEffect(() => {
    if (visible) {
      fade.setValue(0);
      Animated.timing(fade, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, fade]);

  const dismiss = (browsePsychics: boolean) => {
    if (user) {
      void AsyncStorage.setItem(FLAG_PREFIX + String(user.id), "1");
    }
    setVisible(false);
    if (browsePsychics) router.push("/psychics");
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={() => dismiss(false)}
    >
      <ScreenBackground scrimOpacity={0.5}>
        <Animated.View style={[styles.content, { opacity: fade }]}>
          <View style={styles.seal}>
            <Text style={styles.sparkle}>✦</Text>
          </View>

          <Text style={styles.headline}>
            <Text style={styles.headlineGold}>{formatPounds(amount)}</Text> is
            waiting for you ✦
          </Text>
          <Text style={styles.subline}>
            Enough for a real conversation with a gifted reader. Your first
            reading is on us.
          </Text>

          <TouchableOpacity
            style={styles.cta}
            activeOpacity={0.85}
            onPress={() => dismiss(true)}
          >
            <Text style={styles.ctaText}>MEET YOUR PSYCHICS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.later}
            activeOpacity={0.7}
            onPress={() => dismiss(false)}
          >
            <Text style={styles.laterText}>Later</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScreenBackground>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xxl,
  },
  seal: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: alpha(COLORS.accentGold, 0.45),
    backgroundColor: alpha(COLORS.accentGold, 0.08),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.xl,
  },
  sparkle: {
    fontSize: 40,
    color: COLORS.accentGold,
    textShadowColor: alpha(COLORS.accentGold, 0.6),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  headline: {
    ...TYPOGRAPHY.displayLarge,
    textAlign: "center",
    marginBottom: SPACING.lg,
  },
  headlineGold: {
    color: COLORS.accentGold,
  },
  subline: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: 40,
  },
  cta: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignSelf: "stretch",
    alignItems: "center",
    backgroundColor: COLORS.cta,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
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
  later: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  laterText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontFamily: FONTS.semiBold,
  },
});
