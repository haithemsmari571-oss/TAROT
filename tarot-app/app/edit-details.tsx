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
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
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
import { updateProfile } from "../src/lib/auth";

// Edit name + date of birth (from PROFILE). Saves via PATCH /api/profile/me
// and refreshes the auth context so the new name shows app-wide immediately.
// DOB picker mirrors the signup one (native dialog on Android, branded
// spinner modal on iOS) with the same backend bounds.

const TODAY = new Date();
const MIN_DOB = new Date(
  TODAY.getFullYear() - 120,
  TODAY.getMonth(),
  TODAY.getDate()
);
const DEFAULT_DOB = new Date(1985, 0, 1);

/** Local-date ISO "YYYY-MM-DD" (avoids toISOString's UTC day-shift). */
function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDobDisplay(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Parse ISO "YYYY-MM-DD" as a LOCAL date (new Date(iso) would be UTC). */
function fromIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export default function EditDetailsScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();

  const [name, setName] = useState(user?.username ?? "");
  const [dob, setDob] = useState<Date | null>(
    user?.date_of_birth ? fromIsoDate(user.date_of_birth) : null
  );
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const openDobPicker = () => {
    if (Platform.OS === "ios" && !dob) setDob(DEFAULT_DOB);
    setShowDobPicker(true);
  };

  const onSubmit = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 3) {
      setError("Name must be at least 3 characters.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      await updateProfile({
        // Only send what's actually set — DOB stays untouched if she never
        // picked one (older accounts may legitimately have none).
        username: trimmed,
        ...(dob ? { date_of_birth: toIsoDate(dob) } : {}),
      });
      await refreshUser();
      setSaved(true);
    } catch (err: any) {
      const data = err?.response?.data;
      let msg: string | null = null;
      if (typeof data?.message === "string") msg = data.message;
      else if (typeof data?.detail === "string") msg = data.detail;
      else if (Array.isArray(data?.detail) && data.detail[0]?.msg) {
        msg = String(data.detail[0].msg);
      }
      setError(
        msg || "Couldn't save your details. Check your connection and try again."
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
          <View style={styles.content}>
            <Text style={styles.title}>YOUR DETAILS</Text>
            <Text style={styles.subtitle}>
              Your name is what psychics see. Your date of birth powers your
              horoscope and zodiac readings.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor={COLORS.textFaint}
              autoCapitalize="words"
              autoCorrect={false}
              value={name}
              onChangeText={(v) => {
                setName(v);
                setSaved(false);
              }}
              editable={!submitting}
            />

            <TouchableOpacity
              style={styles.dobField}
              activeOpacity={0.7}
              onPress={openDobPicker}
              disabled={submitting}
            >
              <View style={styles.dobRow}>
                <Text style={dob ? styles.dobValue : styles.dobPlaceholder}>
                  {dob ? formatDobDisplay(dob) : "Date of birth"}
                </Text>
                <Ionicons
                  name="calendar-outline"
                  size={20}
                  color={COLORS.textFaint}
                />
              </View>
            </TouchableOpacity>

            {showDobPicker && Platform.OS === "android" && (
              <DateTimePicker
                value={dob ?? DEFAULT_DOB}
                mode="date"
                display="default"
                maximumDate={TODAY}
                minimumDate={MIN_DOB}
                onChange={(event, selected) => {
                  setShowDobPicker(false);
                  if (event.type !== "dismissed" && selected) {
                    setDob(selected);
                    setSaved(false);
                  }
                }}
              />
            )}
            {Platform.OS === "ios" && (
              <Modal
                visible={showDobPicker}
                transparent
                animationType="fade"
                onRequestClose={() => setShowDobPicker(false)}
              >
                <View style={styles.pickerOverlay}>
                  <View style={styles.pickerCard}>
                    <Text style={styles.pickerTitle}>DATE OF BIRTH</Text>
                    <DateTimePicker
                      value={dob ?? DEFAULT_DOB}
                      mode="date"
                      display="spinner"
                      themeVariant="dark"
                      maximumDate={TODAY}
                      minimumDate={MIN_DOB}
                      onChange={(_event, selected) => {
                        if (selected) {
                          setDob(selected);
                          setSaved(false);
                        }
                      }}
                    />
                    <TouchableOpacity
                      style={styles.pickerDone}
                      activeOpacity={0.85}
                      onPress={() => setShowDobPicker(false)}
                    >
                      <Text style={styles.pickerDoneText}>DONE</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>
            )}

            {!!error && <Text style={styles.error}>{error}</Text>}
            {saved && (
              <Text style={styles.savedText}>✦ Saved — looking good.</Text>
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
                <Text style={styles.submitText}>SAVE CHANGES</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.plainLink}
              activeOpacity={0.7}
              onPress={() => router.back()}
              disabled={submitting}
            >
              <Text style={styles.plainLinkText}>
                {saved ? "Back to profile" : "Cancel"}
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
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
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
  dobField: {
    minHeight: TOUCH_TARGET,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 13,
    justifyContent: "center",
    marginBottom: 14,
  },
  dobRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dobValue: {
    fontSize: 17,
    color: COLORS.textPrimary,
    fontFamily: FONTS.regular,
  },
  dobPlaceholder: {
    fontSize: 17,
    color: COLORS.textFaint,
    fontFamily: FONTS.regular,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(5,5,8,0.75)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xxl,
  },
  pickerCard: {
    width: "100%",
    backgroundColor: COLORS.surface,
    borderRadius: RADII.xl,
    borderWidth: 1,
    borderColor: alpha(COLORS.accent, 0.25),
    padding: SPACING.xl,
  },
  pickerTitle: {
    fontSize: 13,
    letterSpacing: 2,
    color: COLORS.accentGold,
    fontFamily: FONTS.bold,
    textAlign: "center",
    marginBottom: SPACING.sm,
  },
  pickerDone: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.cta,
    borderRadius: RADII.md,
    marginTop: SPACING.md,
  },
  pickerDoneText: {
    color: COLORS.ctaText,
    fontSize: 15,
    letterSpacing: 1.2,
    fontFamily: FONTS.bold,
  },
  error: {
    color: COLORS.error,
    fontSize: 14,
    fontFamily: FONTS.regular,
    marginBottom: SPACING.md,
  },
  savedText: {
    color: COLORS.accentGold,
    fontSize: 15,
    fontFamily: FONTS.semiBold,
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
