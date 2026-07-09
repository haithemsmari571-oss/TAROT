import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
} from "../src/theme";
import ScreenBackground from "../src/components/ScreenBackground";
import { changePassword } from "../src/lib/auth";

// Change password (from PROFILE). Existing backend endpoint:
// POST /api/profile/me/change-password — wrong current password comes back
// as 400 {message: "Current password is incorrect"}.

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = async () => {
    if (!current) {
      setError("Enter your current password.");
      return;
    }
    if (!next) {
      setError("Enter a new password.");
      return;
    }
    if (next.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (next === current) {
      setError("New password must be different from the current one.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await changePassword(current, next);
      setDone(true);
    } catch (err: any) {
      const serverMsg =
        err?.response?.data?.message || err?.response?.data?.detail;
      setError(
        typeof serverMsg === "string" && serverMsg
          ? serverMsg
          : "Couldn't change your password. Check your connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenBackground scrimOpacity={0.6}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SafeAreaView style={styles.safe} edges={["top"]}>
          <StatusBar style="light" />

          {done ? (
            <View style={styles.content}>
              <View style={styles.iconRing}>
                <Ionicons
                  name="shield-checkmark"
                  size={36}
                  color={COLORS.accentGold}
                />
              </View>
              <Text style={[styles.title, styles.centered]}>
                PASSWORD CHANGED
              </Text>
              <Text style={[styles.subtitle, styles.centered]}>
                Your new password is active. You stay signed in on this device.
              </Text>
              <TouchableOpacity
                style={styles.submitBtn}
                activeOpacity={0.85}
                onPress={() => router.back()}
              >
                <Text style={styles.submitText}>BACK TO PROFILE</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.content}>
              <Text style={styles.title}>CHANGE PASSWORD</Text>
              <Text style={styles.subtitle}>
                Choose a new password for your account.
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Current password"
                placeholderTextColor={COLORS.textFaint}
                secureTextEntry
                autoCapitalize="none"
                value={current}
                onChangeText={setCurrent}
                editable={!submitting}
              />
              <TextInput
                style={styles.input}
                placeholder="New password"
                placeholderTextColor={COLORS.textFaint}
                secureTextEntry
                autoCapitalize="none"
                value={next}
                onChangeText={setNext}
                editable={!submitting}
              />
              <TextInput
                style={styles.input}
                placeholder="Confirm new password"
                placeholderTextColor={COLORS.textFaint}
                secureTextEntry
                autoCapitalize="none"
                value={confirm}
                onChangeText={setConfirm}
                editable={!submitting}
                onSubmitEditing={onSubmit}
                returnKeyType="go"
              />

              {!!error && <Text style={styles.error}>{error}</Text>}

              <TouchableOpacity
                style={[
                  styles.submitBtn,
                  submitting && styles.submitBtnDisabled,
                ]}
                activeOpacity={0.85}
                onPress={onSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={COLORS.ctaText} />
                ) : (
                  <Text style={styles.submitText}>UPDATE PASSWORD</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.plainLink}
                activeOpacity={0.7}
                onPress={() => router.back()}
                disabled={submitting}
              >
                <Text style={styles.plainLinkText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  centered: { textAlign: "center" },
  iconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: alpha(COLORS.accentGold, 0.08),
    borderWidth: 1,
    borderColor: alpha(COLORS.accentGold, 0.35),
    marginBottom: 24,
  },
  title: {
    ...TYPOGRAPHY.display,
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginBottom: 28,
  },
  input: {
    minHeight: TOUCH_TARGET,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 13,
    fontSize: 17,
    color: COLORS.textPrimary,
    fontFamily: FONTS.regular,
    marginBottom: 14,
  },
  error: {
    color: COLORS.error,
    fontSize: 14,
    fontFamily: FONTS.regular,
    marginBottom: SPACING.md,
  },
  submitBtn: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    backgroundColor: COLORS.cta,
    paddingVertical: SPACING.lg,
    borderRadius: RADII.md,
    alignItems: "center",
    marginTop: 6,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: {
    color: COLORS.ctaText,
    fontSize: 15,
    letterSpacing: 1.2,
    fontFamily: FONTS.bold,
  },
  plainLink: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    marginTop: SPACING.lg,
  },
  plainLinkText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontFamily: FONTS.regular,
  },
});
