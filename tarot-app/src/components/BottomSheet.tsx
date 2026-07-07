import type { ReactNode } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  COLORS,
  FONTS,
  TYPOGRAPHY,
  SPACING,
  RADII,
  TOUCH_TARGET,
  alpha,
} from "../theme";

// Branded bottom sheet for the money moments (insufficient balance, session
// ended, etc.) — replaces raw Alert.alert. Calm celestial: surface panel,
// Bricolage headline, gold primary CTA, quiet secondary link. Compose content
// from the Sheet* pieces below so every sheet in the app looks the same.

export default function BottomSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <SafeAreaView edges={["bottom"]} style={styles.panel}>
          <View style={styles.handle} />
          {children}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export function SheetTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function SheetBody({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}

/** Smaller supporting line (e.g. the welcome-credit explanation). */
export function SheetNote({ children }: { children: ReactNode }) {
  return <Text style={styles.note}>{children}</Text>;
}

export function SheetPrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.primary, (disabled || loading) && styles.primaryDisabled]}
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.background} />
      ) : (
        <Text style={styles.primaryText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

export function SheetQuietButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.quiet} activeOpacity={0.7} onPress={onPress}>
      <Text style={styles.quietText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,5,8,0.7)",
  },
  panel: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADII.xxl,
    borderTopRightRadius: RADII.xxl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: alpha(COLORS.accent, 0.22),
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.borderStrong,
    marginBottom: SPACING.lg,
  },
  title: {
    ...TYPOGRAPHY.headline,
    marginBottom: SPACING.md,
  },
  body: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
  },
  note: {
    fontSize: 14,
    lineHeight: 20,
    color: alpha(COLORS.accentGold, 0.9),
    fontFamily: FONTS.regular,
    marginBottom: SPACING.md,
  },
  primary: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.accentGold,
    borderRadius: RADII.md,
    paddingVertical: SPACING.lg,
    marginTop: SPACING.sm,
    shadowColor: COLORS.accentGold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 5,
  },
  primaryDisabled: { opacity: 0.6 },
  primaryText: {
    color: COLORS.background,
    fontSize: 15,
    letterSpacing: 1.2,
    fontFamily: FONTS.bold,
  },
  quiet: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    marginTop: SPACING.xs,
  },
  quietText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontFamily: FONTS.semiBold,
  },
});
