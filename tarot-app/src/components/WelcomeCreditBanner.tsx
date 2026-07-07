import { useCallback } from "react";
import { Text, TouchableOpacity, StyleSheet } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { COLORS, FONTS, RADII, TOUCH_TARGET, SPACING, alpha } from "../theme";
import { useCredit, formatPounds } from "../context/CreditContext";

// Thin gold band on SANCTUARY (mirrors the website's home-page credit band):
// visible only while the signed-in user still has unspent welcome credit.
// Re-checks the balance every time the screen regains focus, so it disappears
// on the first visit after the credit is spent. Renders nothing for signed-out
// or zero-credit users.

export default function WelcomeCreditBanner() {
  const { hasCredit, creditBalance, refresh } = useCredit();
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  if (!hasCredit || creditBalance == null) return null;

  return (
    <TouchableOpacity
      style={styles.band}
      activeOpacity={0.85}
      onPress={() => router.push("/psychics")}
    >
      <Text style={styles.text}>
        ✦ You have{" "}
        <Text style={styles.amount}>{formatPounds(creditBalance)}</Text> free
        credit — start your first reading
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  band: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 20,
    marginTop: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: alpha(COLORS.accentGold, 0.4),
    backgroundColor: alpha(COLORS.accentGold, 0.08),
  },
  text: {
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.accentGold,
    fontFamily: FONTS.semiBold,
    textAlign: "center",
  },
  amount: {
    fontFamily: FONTS.bold,
  },
});
