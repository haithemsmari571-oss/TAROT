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
  ScrollView,
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
import { deleteAccount, resendVerification } from "../src/lib/auth";
import { getMyChats } from "../src/api/chat";
import BottomSheet, {
  SheetTitle,
  SheetBody,
  SheetNote,
  SheetPrimaryButton,
  SheetQuietButton,
} from "../src/components/BottomSheet";
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

  // Delete-account flow, staged through one bottom sheet:
  // blocked (reading in progress) → warn (Stardust forfeit, only if > 0)
  // → confirm ("can't be undone") → the actual call.
  const [deleteStage, setDeleteStage] = useState<
    null | "blocked" | "warn" | "confirm"
  >(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const closeDeleteSheet = useCallback(() => {
    if (deleteBusy) return; // never dismissable mid-delete
    setDeleteStage(null);
    setDeleteError(null);
  }, [deleteBusy]);

  const onDeletePress = useCallback(async () => {
    setDeleteError(null);
    setDeleteBusy(true);
    try {
      // Pre-check for a live reading so she gets the clear "end it first"
      // message up front (the server enforces the same rule regardless).
      const chats = await getMyChats();
      const live = chats.some(
        (c) => c.status === "ACTIVE" || c.status === "PAUSED"
      );
      if (live) {
        setDeleteStage("blocked");
      } else if ((balance ?? 0) > 0) {
        setDeleteStage("warn");
      } else {
        setDeleteStage("confirm");
      }
    } catch {
      setDeleteStage("confirm"); // server still enforces the block
    } finally {
      setDeleteBusy(false);
    }
  }, [balance]);

  const onConfirmDelete = useCallback(async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteAccount();
      // Server side is done and all tokens are dead — leave locally too.
      setDeleteStage(null);
      await signOut();
    } catch (err: any) {
      const serverMsg =
        err?.response?.data?.detail || err?.response?.data?.message;
      if (err?.response?.status === 409) {
        setDeleteStage("blocked");
      } else {
        setDeleteError(
          typeof serverMsg === "string" && serverMsg
            ? serverMsg
            : "Couldn't delete your account. Check your connection and try again."
        );
      }
    } finally {
      setDeleteBusy(false);
    }
  }, [signOut]);

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
        <ScrollView
          style={styles.safe}
          contentContainerStyle={styles.accountContent}
          showsVerticalScrollIndicator={false}
        >
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

          {/* Account hub menu — details, security, history, activity */}
          <View style={styles.menu}>
            {(
              [
                {
                  icon: "person-outline",
                  label: "Edit details",
                  route: "/edit-details",
                },
                {
                  icon: "lock-closed-outline",
                  label: "Change password",
                  route: "/change-password",
                },
                {
                  icon: "moon-outline",
                  label: "Your readings",
                  route: "/reading-history",
                },
                {
                  icon: "receipt-outline",
                  label: "Stardust activity",
                  route: "/transactions",
                },
              ] as const
            ).map((row, i, all) => (
              <TouchableOpacity
                key={row.route}
                style={[styles.menuRow, i < all.length - 1 && styles.menuRowDivider]}
                activeOpacity={0.7}
                onPress={() => router.push(row.route)}
              >
                <Ionicons
                  name={row.icon}
                  size={18}
                  color={COLORS.textSecondary}
                />
                <Text style={styles.menuLabel}>{row.label}</Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={COLORS.textFaint}
                />
              </TouchableOpacity>
            ))}
          </View>

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

          <TouchableOpacity
            style={styles.deleteLink}
            activeOpacity={0.7}
            onPress={onDeletePress}
            disabled={deleteBusy || deleteStage !== null}
          >
            {deleteBusy && deleteStage === null ? (
              <ActivityIndicator size="small" color={COLORS.textFaint} />
            ) : (
              <Text style={styles.deleteLinkText}>Delete account</Text>
            )}
          </TouchableOpacity>
        </ScrollView>

        <BottomSheet visible={deleteStage !== null} onClose={closeDeleteSheet}>
          {deleteStage === "blocked" && (
            <>
              <SheetTitle>A reading is in progress</SheetTitle>
              <SheetBody>
                Your account can't be deleted while a reading is live. End the
                session (or let it finish), then come back here.
              </SheetBody>
              <SheetPrimaryButton label="OK" onPress={closeDeleteSheet} />
            </>
          )}

          {deleteStage === "warn" && (
            <>
              <SheetTitle>Your Stardust will be lost</SheetTitle>
              <SheetBody>
                You still have{" "}
                {balance != null ? formatPounds(balance) : "a balance"} in
                Stardust. Deleting your account forfeits it permanently — it
                can't be refunded or restored later.
              </SheetBody>
              <SheetPrimaryButton
                label="KEEP MY STARDUST"
                onPress={closeDeleteSheet}
              />
              <SheetQuietButton
                label="I understand — continue"
                onPress={() => setDeleteStage("confirm")}
              />
            </>
          )}

          {deleteStage === "confirm" && (
            <>
              <SheetTitle>Delete your account?</SheetTitle>
              <SheetBody>
                This can't be undone. Your personal details are permanently
                removed and you'll be signed out everywhere. Your email becomes
                free to use for a new account.
              </SheetBody>
              {!!deleteError && <SheetNote>{deleteError}</SheetNote>}
              <TouchableOpacity
                style={[
                  styles.deleteConfirmBtn,
                  deleteBusy && styles.deleteConfirmBtnDisabled,
                ]}
                activeOpacity={0.85}
                onPress={onConfirmDelete}
                disabled={deleteBusy}
              >
                {deleteBusy ? (
                  <ActivityIndicator color={COLORS.error} />
                ) : (
                  <Text style={styles.deleteConfirmText}>
                    DELETE MY ACCOUNT
                  </Text>
                )}
              </TouchableOpacity>
              <SheetQuietButton label="Cancel" onPress={closeDeleteSheet} />
            </>
          )}
        </BottomSheet>
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
  // Unverified-account state: sign-in succeeded credential-wise but the email
  // was never verified. Shows the branded resend card instead of a raw error.
  const [unverified, setUnverified] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">(
    "idle"
  );

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setUnverified(false);
    setResendState("idle");
    try {
      await signIn(email.trim(), password);
    } catch (err: any) {
      // DomainErrors arrive as {message}, plain HTTP errors as {detail}.
      const serverMsg =
        err?.response?.data?.message || err?.response?.data?.detail || "";
      if (
        typeof serverMsg === "string" &&
        serverMsg.toLowerCase().includes("not verified")
      ) {
        setUnverified(true);
      } else {
        const fallback =
          err?.response?.status === 401 || err?.response?.status === 400
            ? "Incorrect email or password."
            : "Couldn't sign in. Check your connection and try again.";
        setError(
          typeof serverMsg === "string" && serverMsg ? serverMsg : fallback
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onResend = async () => {
    setResendState("sending");
    setError(null);
    try {
      await resendVerification(email.trim());
      setResendState("sent");
    } catch (err: any) {
      setResendState("idle");
      const serverMsg =
        err?.response?.data?.message || err?.response?.data?.detail;
      setError(
        typeof serverMsg === "string" && serverMsg
          ? serverMsg
          : "Couldn't send the email. Try again in a moment."
      );
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

            <TouchableOpacity
              style={styles.forgotLink}
              activeOpacity={0.7}
              onPress={() => router.push("/forgot-password")}
              disabled={submitting}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {!!error && <Text style={styles.error}>{error}</Text>}

            {unverified && (
              <View style={styles.verifyCard}>
                <Text style={styles.verifyLabel}>VERIFY YOUR EMAIL</Text>
                {resendState === "sent" ? (
                  <Text style={styles.verifyText}>
                    Sent ✦ Check your inbox at{" "}
                    <Text style={styles.verifyEmphasis}>{email.trim()}</Text>{" "}
                    (and the spam folder), then sign in again.
                  </Text>
                ) : (
                  <>
                    <Text style={styles.verifyText}>
                      Your account isn't verified yet. Tap the link we emailed
                      you when you signed up — or get a fresh one below.
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.verifyBtn,
                        resendState === "sending" && styles.submitBtnDisabled,
                      ]}
                      activeOpacity={0.85}
                      onPress={onResend}
                      disabled={resendState === "sending"}
                    >
                      {resendState === "sending" ? (
                        <ActivityIndicator
                          size="small"
                          color={COLORS.accentGold}
                        />
                      ) : (
                        <Text style={styles.verifyBtnText}>
                          RESEND VERIFICATION EMAIL
                        </Text>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

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
  forgotLink: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignSelf: "flex-end",
    paddingHorizontal: SPACING.xs,
    marginTop: -6,
    marginBottom: SPACING.xs,
  },
  forgotText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontFamily: FONTS.semiBold,
  },
  // Unverified-account resend card
  verifyCard: {
    backgroundColor: alpha(COLORS.accentGold, 0.07),
    borderWidth: 1,
    borderColor: alpha(COLORS.accentGold, 0.35),
    borderRadius: RADII.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  verifyLabel: {
    fontSize: 12,
    letterSpacing: 2,
    color: COLORS.accentGold,
    fontFamily: FONTS.bold,
    marginBottom: SPACING.xs,
  },
  verifyText: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textPrimary,
    fontFamily: FONTS.regular,
  },
  verifyEmphasis: {
    fontFamily: FONTS.semiBold,
    color: COLORS.accentGold,
  },
  verifyBtn: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    marginTop: SPACING.md,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: alpha(COLORS.accentGold, 0.6),
  },
  verifyBtnText: {
    color: COLORS.accentGold,
    fontSize: 14,
    letterSpacing: 1.2,
    fontFamily: FONTS.bold,
  },
  // Account hub menu
  menu: {
    width: "100%",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.lg,
    marginBottom: SPACING.md,
  },
  menuRow: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  menuRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderStrong,
  },
  menuLabel: {
    flex: 1,
    fontSize: 16,
    color: COLORS.textPrimary,
    fontFamily: FONTS.regular,
  },
  // Delete-account entry + destructive confirm button
  deleteLink: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    marginTop: SPACING.sm,
  },
  deleteLinkText: {
    color: COLORS.textFaint,
    fontSize: 15,
    fontFamily: FONTS.regular,
  },
  deleteConfirmBtn: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: RADII.md,
    paddingVertical: SPACING.lg,
    marginTop: SPACING.sm,
    borderWidth: 1,
    borderColor: alpha(COLORS.error, 0.7),
    backgroundColor: alpha(COLORS.error, 0.08),
  },
  deleteConfirmBtnDisabled: { opacity: 0.6 },
  deleteConfirmText: {
    color: COLORS.error,
    fontSize: 15,
    letterSpacing: 1.2,
    fontFamily: FONTS.bold,
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
  // Account view (ScrollView content: the hub can outgrow small screens)
  accountContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: SPACING.xl,
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
