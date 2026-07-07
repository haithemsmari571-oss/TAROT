import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from "react-native";
import { useFocusEffect } from "expo-router";
import {
  COLORS,
  FONTS,
  TYPOGRAPHY,
  SPACING,
  RADII,
  TOUCH_TARGET,
  alpha,
} from "../../theme";
import {
  ackCelebrations,
  getCelebrations,
  type Celebration,
} from "../../api/constellation";

// Celebrates unseen rewards — gifts from Valentina and approved ritual claims.
// Fetches on SANCTUARY focus, shows one calm gold moment at a time, and acks
// each on dismiss so it never repeats. Silent on any fetch failure.

export default function CelebrationHost({ active }: { active: boolean }) {
  const [queue, setQueue] = useState<Celebration[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!active) return;
      let mounted = true;
      getCelebrations()
        .then((list) => {
          if (mounted && list.length) setQueue(list);
        })
        .catch(() => {
          // quiet — celebrations are a bonus, never an error state
        });
      return () => {
        mounted = false;
      };
    }, [active])
  );

  const current = queue[0] ?? null;

  const dismiss = () => {
    if (!current) return;
    void ackCelebrations([current.id]).catch(() => {});
    setQueue((q) => q.slice(1));
  };

  return (
    <Modal
      visible={!!current}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.seal}>
            <Text style={styles.sealGlyph}>
              {current?.kind === "gift" ? "☾" : "✦"}
            </Text>
          </View>
          <Text style={styles.title}>{current?.title}</Text>
          {current != null && current.amount > 0 && (
            <Text style={styles.amount}>+{current.amount} Stardust</Text>
          )}
          {!!current?.message && (
            <Text style={styles.message}>{current.message}</Text>
          )}
          <TouchableOpacity
            style={styles.btn}
            activeOpacity={0.85}
            onPress={dismiss}
          >
            <Text style={styles.btnText}>
              {queue.length > 1 ? "NEXT ✦" : "THANK THE STARS ✦"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xxl,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.xl,
    borderRadius: RADII.xxl,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: alpha(COLORS.accentGold, 0.4),
  },
  seal: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    borderColor: alpha(COLORS.accentGold, 0.45),
    backgroundColor: alpha(COLORS.accentGold, 0.08),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.lg,
  },
  sealGlyph: {
    fontSize: 36,
    color: COLORS.accentGold,
    textShadowColor: alpha(COLORS.accentGold, 0.6),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  title: {
    ...TYPOGRAPHY.headline,
    textAlign: "center",
  },
  amount: {
    fontFamily: FONTS.heading,
    fontSize: 26,
    color: COLORS.accentGold,
    marginTop: SPACING.sm,
  },
  message: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.md,
  },
  btn: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: COLORS.accentGold,
    borderRadius: RADII.md,
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.xl,
  },
  btnText: {
    color: COLORS.background,
    fontSize: 15,
    letterSpacing: 1.2,
    fontFamily: FONTS.bold,
  },
});
