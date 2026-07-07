import { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
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
import { formatPounds } from "../src/context/CreditContext";
import { useStardustBalance } from "../src/hooks/useStardustBalance";
import {
  getPushPermission,
  requestPushPermissionAndRegister,
  type PushPermission,
} from "../src/lib/notifications";

export default function ProfileScreen() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <ScreenBackground scrimOpacity={0.6}>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      </ScreenBackground>
    );
  }

  return user ? <Account /> : <SignInForm />;
}

function Account() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const {
    balance,
    creditBalance,
    loading: balanceLoading,
  } = useStardustBalance();

  // Quiet notifications re-entry point (the only place we offer it again
  // after a "Not now"). Hidden entirely in Expo Go ("unsupported").
  const [pushStatus, setPushStatus] = useState<PushPermission | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getPushPermission().then((s) => {
        if (active) setPushStatus(s);
      });
      return () => {
        active = false;
      };
    }, [])
  );

  const onNotificationsPress = useCallback(async () => {
    setPushBusy(true);
    const enabled = await requestPushPermissionAndRegister();
    if (!enabled) {
      // iOS won't re-show the dialog once denied — the OS settings screen is
      // the only way back in.
      const s = await getPushPermission();
      if (s === "denied") {
        try {
          await Linking.openSettings();
        } catch {
          // nothing else to do
        }
      }
    }
    setPushStatus(await getPushPermission());
    setPushBusy(false);
  }, []);

  return (
    <ScreenBackground scrimOpacity={0.6}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <StatusBar style="light" />
        <View style={styles.accountContent}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={40} color={COLORS.accent} />
          </View>
          <Text style={styles.username}>{user?.username}</Text>
          <Text style={styles.email}>{user?.email}</Text>

          {/* Stardust balance + entry to the purchase screen */}
          <TouchableOpacity
            style={styles.stardustCard}
            activeOpacity={0.85}
            onPress={() => router.push("/stardust")}
          >
            <View style={styles.stardustLeft}>
              <Ionicons name="sparkles" size={18} color={COLORS.accentGold} />
              <View>
                <Text style={styles.stardustLabel}>STARDUST</Text>
                {balanceLoading && balance === null ? (
                  <ActivityIndicator
                    color={COLORS.accentGold}
                    style={{ alignSelf: "flex-start", marginTop: 2 }}
                  />
                ) : (
                  <>
                    <Text style={styles.stardustValue}>
                      {balance != null ? balance.toLocaleString() : "—"}
                    </Text>
                    {creditBalance != null && creditBalance > 0 && (
                      <Text style={styles.stardustCredit}>
                        includes {formatPounds(creditBalance)} free credit
                      </Text>
                    )}
                  </>
                )}
              </View>
            </View>
            <Ionicons
              name="chevron-forward"
              size={20}
              color={COLORS.textSecondary}
            />
          </TouchableOpacity>

          {/* Notifications — quiet status/re-entry row (hidden in Expo Go) */}
          {pushStatus != null && pushStatus !== "unsupported" && (
            <TouchableOpacity
              style={styles.notifCard}
              activeOpacity={pushStatus === "granted" ? 1 : 0.85}
              onPress={
                pushStatus === "granted" ? undefined : onNotificationsPress
              }
              disabled={pushBusy}
            >
              <View style={styles.notifLeft}>
                <Ionicons
                  name={
                    pushStatus === "granted"
                      ? "notifications"
                      : "notifications-outline"
                  }
                  size={18}
                  color={
                    pushStatus === "granted"
                      ? COLORS.accent
                      : COLORS.textSecondary
                  }
                />
                <View style={styles.notifBody}>
                  <Text style={styles.notifLabel}>NOTIFICATIONS</Text>
                  <Text style={styles.notifText}>
                    {pushStatus === "granted"
                      ? "On — you'll know the moment your reading begins"
                      : "Off — tap to know the moment your reading begins"}
                  </Text>
                </View>
              </View>
              {pushBusy ? (
                <ActivityIndicator size="small" color={COLORS.accent} />
              ) : pushStatus !== "granted" ? (
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={COLORS.textSecondary}
                />
              ) : null}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.signOutBtn}
            activeOpacity={0.85}
            onPress={signOut}
          >
            <Text style={styles.signOutText}>SIGN OUT</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

function SignInForm() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        (err?.response?.status === 401 || err?.response?.status === 400
          ? "Incorrect email or password."
          : "Couldn't sign in. Check your connection and try again.");
      setError(typeof detail === "string" ? detail : "Sign in failed.");
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
          <View style={styles.formContent}>
            <Text style={styles.title}>SIGN IN</Text>
            <Text style={styles.subtitle}>
              Sign in to start a reading with your psychic.
            </Text>

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
                <Text style={styles.submitText}>SIGN IN</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.createLink}
              activeOpacity={0.7}
              onPress={() => router.push("/signup")}
              disabled={submitting}
            >
              <Text style={styles.createText}>
                New here?{" "}
                <Text style={styles.createTextAccent}>Create account</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  // Sign-in form
  formContent: { flex: 1, justifyContent: "center", paddingHorizontal: 28 },
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
  createLink: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    marginTop: SPACING.lg,
  },
  createText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontFamily: FONTS.regular,
  },
  createTextAccent: {
    color: COLORS.accent,
    fontFamily: FONTS.semiBold,
  },
  // Account view
  accountContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: alpha(COLORS.accent, 0.3),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  username: {
    ...TYPOGRAPHY.headline,
    marginBottom: SPACING.xs,
  },
  email: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    marginBottom: 28,
  },
  stardustCard: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: alpha(COLORS.accentGold, 0.25),
    borderRadius: RADII.lg,
    paddingHorizontal: 18,
    paddingVertical: SPACING.lg,
    marginBottom: 28,
  },
  stardustLeft: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  stardustLabel: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: COLORS.textSecondary,
    fontFamily: FONTS.semiBold,
  },
  stardustValue: {
    fontSize: 22,
    color: COLORS.accentGold,
    fontFamily: FONTS.bold,
  },
  stardustCredit: {
    fontSize: 13,
    lineHeight: 18,
    color: alpha(COLORS.accentGold, 0.85),
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
  notifCard: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.lg,
    paddingHorizontal: 18,
    paddingVertical: SPACING.lg,
    marginBottom: 28,
    gap: SPACING.md,
  },
  notifLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  notifBody: { flex: 1 },
  notifLabel: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: COLORS.textSecondary,
    fontFamily: FONTS.semiBold,
  },
  notifText: {
    fontSize: 14,
    lineHeight: 19,
    color: COLORS.textPrimary,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
  signOutBtn: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: RADII.md,
  },
  signOutText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    letterSpacing: 1,
    fontFamily: FONTS.bold,
  },
});
