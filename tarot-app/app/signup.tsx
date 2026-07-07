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
} from "../src/theme";
import ScreenBackground from "../src/components/ScreenBackground";
import { useAuth } from "../src/context/AuthContext";

/** Pull a human-friendly message out of a backend/axios error. */
function messageFromError(err: any): string {
  const data = err?.response?.data;
  // Domain errors come back as { message: "..." }
  if (typeof data?.message === "string") return data.message;
  // FastAPI validation errors come back as { detail: [{ msg, ... }] }
  const detail = data?.detail;
  if (Array.isArray(detail) && typeof detail[0]?.msg === "string") {
    return detail[0].msg;
  }
  if (typeof detail === "string") return detail;
  if (err?.response) return "Couldn't create your account. Please try again.";
  return "Couldn't reach the server. Check your connection and try again.";
}

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once the account is created but sign-in is blocked by email verification.
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);

  const onSubmit = async () => {
    const name = username.trim();
    const mail = email.trim();

    if (!name || !mail || !password) {
      setError("Please fill in your name, email, and password.");
      return;
    }
    if (!mail.includes("@") || !mail.includes(".")) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await signUp(name, mail, password);
      if (result.status === "signed-in") {
        // Fresh session captured — drop into the main app.
        router.replace("/");
      } else {
        // Account created, but must verify email before signing in.
        setVerifyEmail(result.email);
      }
    } catch (err: any) {
      setError(messageFromError(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Confirmation state: account created, awaiting email verification.
  if (verifyEmail) {
    return (
      <ScreenBackground scrimOpacity={0.6}>
        <SafeAreaView style={styles.safe} edges={["top"]}>
          <StatusBar style="light" />
          <View style={styles.verifyContent}>
            <View style={styles.verifyIcon}>
              <Ionicons name="mail-outline" size={40} color={COLORS.accent} />
            </View>
            <Text style={styles.title}>CHECK YOUR EMAIL</Text>
            <Text style={styles.verifyText}>
              Your account is ready. We&apos;ve sent a verification link to{" "}
              <Text style={styles.verifyEmail}>{verifyEmail}</Text>. Verify it,
              then sign in to start your first reading.
            </Text>
            <TouchableOpacity
              style={styles.submitBtn}
              activeOpacity={0.85}
              onPress={() => router.replace("/profile")}
            >
              <Text style={styles.submitText}>BACK TO SIGN IN</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground scrimOpacity={0.6}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SafeAreaView style={styles.safe} edges={["top"]}>
          <StatusBar style="light" />
          <ScrollView
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
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
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>

            <Text style={styles.title}>CREATE ACCOUNT</Text>
            <Text style={styles.subtitle}>
              Join Ask Valentina to connect with your psychic.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor={COLORS.textFaint}
              autoCapitalize="words"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
              editable={!submitting}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={COLORS.textFaint}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              editable={!submitting}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={COLORS.textFaint}
              secureTextEntry
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
              editable={!submitting}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirm password"
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
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              activeOpacity={0.85}
              onPress={onSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={COLORS.ctaText} />
              ) : (
                <Text style={styles.submitText}>CREATE ACCOUNT</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchLink}
              activeOpacity={0.7}
              onPress={() => router.replace("/profile")}
            >
              <Text style={styles.switchText}>
                Already have an account?{" "}
                <Text style={styles.switchTextAccent}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  formContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: SPACING.xl,
  },
  backLink: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginBottom: SPACING.sm,
  },
  backText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontFamily: FONTS.regular,
    marginLeft: 2,
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
  switchLink: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    marginTop: SPACING.lg,
  },
  switchText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontFamily: FONTS.regular,
  },
  switchTextAccent: {
    color: COLORS.accent,
    fontFamily: FONTS.semiBold,
  },
  // Verification confirmation state
  verifyContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  verifyIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: alpha(COLORS.accent, 0.3),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.xl,
  },
  verifyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.sm,
    marginBottom: SPACING.xxl,
  },
  verifyEmail: {
    color: COLORS.accent,
    fontFamily: FONTS.semiBold,
  },
});
