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
import { forgotPassword } from "../src/lib/auth";

// Forgot-password flow (reached from the sign-in form). One screen, two
// states: ask for the email, then a "check your email" confirmation. The
// confirmation shows for ANY submitted address — the backend deliberately
// answers the same way whether or not the account exists, and we keep that
// promise here so the app never leaks which emails are registered.

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter the email you signed up with.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await forgotPassword(trimmed);
      setSentTo(trimmed);
    } catch {
      // Only transport-level failures land here (the endpoint itself always
      // answers 200) — so this really is a connection problem.
      setError("Couldn't reach the server. Check your connection and try again.");
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

          {sentTo ? (
            <View style={styles.content}>
              <View style={styles.iconRing}>
                <Ionicons name="mail-open" size={36} color={COLORS.accentGold} />
              </View>
              <Text style={styles.title}>CHECK YOUR EMAIL</Text>
              <Text style={styles.subtitle}>
                If an account exists for{" "}
                <Text style={styles.emphasis}>{sentTo}</Text>, a reset link is
                on its way. The link expires after 5 minutes, so open it soon —
                and check your spam folder if it's shy.
              </Text>

              <TouchableOpacity
                style={styles.submitBtn}
                activeOpacity={0.85}
                onPress={() => router.back()}
              >
                <Text style={styles.submitText}>BACK TO SIGN IN</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.plainLink}
                activeOpacity={0.7}
                onPress={() => {
                  setSentTo(null);
                  setError(null);
                }}
              >
                <Text style={styles.plainLinkText}>
                  Use a different email
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.content}>
              <Text style={styles.title}>RESET PASSWORD</Text>
              <Text style={styles.subtitle}>
                Enter the email you signed up with and we'll send you a link to
                choose a new password.
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={COLORS.textFaint}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                value={email}
                onChangeText={setEmail}
                editable={!submitting}
                onSubmitEditing={onSubmit}
                returnKeyType="send"
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
                  <Text style={styles.submitText}>SEND RESET LINK</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.plainLink}
                activeOpacity={0.7}
                onPress={() => router.back()}
                disabled={submitting}
              >
                <Text style={styles.plainLinkText}>Back to sign in</Text>
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
    textAlign: "center",
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginBottom: 28,
    textAlign: "center",
  },
  emphasis: {
    color: COLORS.textPrimary,
    fontFamily: FONTS.semiBold,
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
    textAlign: "center",
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
