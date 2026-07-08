import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
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
} from "../../src/theme";
import ScreenBackground from "../../src/components/ScreenBackground";
import { useAuth } from "../../src/context/AuthContext";
import {
  getBirthdayCompatibility,
  type CosmicBond,
} from "../../src/api/zodiac";
import {
  hasDedicatedPortrait,
  signGlyph,
  signPortrait,
} from "../../src/lib/zodiac";
import { loadBonds, saveBond, type StoredBond } from "../../src/lib/bonds";

// Love Compatibility — her sign comes from her account's date of birth; she
// picks the other person's birthday and the backend works out the cosmic bond.
// The result card is self-contained (both signs, score, V watermark) so a
// screenshot of it carries the brand on its own.

// Picker bounds mirror the signup DOB picker.
const TODAY = new Date();
const MIN_DOB = new Date(
  TODAY.getFullYear() - 120,
  TODAY.getMonth(),
  TODAY.getDate()
);
const DEFAULT_DOB = new Date(1985, 0, 1);

/** Date → "DD/MM/YYYY", the shape the backend endpoint expects. */
function toDdmmyyyy(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** ISO "YYYY-MM-DD" (profile DOB) → "DD/MM/YYYY". Null when malformed. */
function isoToDdmmyyyy(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
}

function formatDobDisplay(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const SUB_METERS: {
  key: keyof Pick<
    CosmicBond,
    "love_percentage" | "communication_percentage" | "emotional_bond_percentage"
  >;
  label: string;
}[] = [
  { key: "love_percentage", label: "LOVE" },
  { key: "communication_percentage", label: "TALK" },
  { key: "emotional_bond_percentage", label: "BOND" },
];

export default function CompatibilityScreen() {
  const router = useRouter();
  const { user } = useAuth();

  // Her birthday: from the profile when set; otherwise she picks it here.
  const profileBirthday = isoToDdmmyyyy(user?.date_of_birth);
  const [ownDob, setOwnDob] = useState<Date | null>(null);
  const [showOwnPicker, setShowOwnPicker] = useState(false);

  const [partnerDob, setPartnerDob] = useState<Date | null>(null);
  const [showPartnerPicker, setShowPartnerPicker] = useState(false);

  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bond, setBond] = useState<CosmicBond | null>(null);
  const [recent, setRecent] = useState<StoredBond[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadBonds(user?.id).then((bonds) => {
      if (!cancelled) setRecent(bonds);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const herBirthday = profileBirthday ?? (ownDob ? toDdmmyyyy(ownDob) : null);

  const runCheck = useCallback(
    async (partnerBirthday: string) => {
      if (!herBirthday) {
        setError("Add your birthday first — the bond needs both of you.");
        return;
      }
      setChecking(true);
      setError(null);
      try {
        const result = await getBirthdayCompatibility(
          herBirthday,
          partnerBirthday
        );
        setBond(result);
        setRecent(
          await saveBond(user?.id, {
            partnerBirthday,
            partnerSign: result.partner_sign,
            overallHarmony: result.overall_harmony_percentage,
            checkedAt: new Date().toISOString(),
          })
        );
      } catch {
        setError(
          "The stars are quiet — we couldn't read this bond. Check your connection and try again."
        );
      } finally {
        setChecking(false);
      }
    },
    [herBirthday, user?.id]
  );

  const onCheck = () => {
    if (!partnerDob) {
      setError("Pick their birthday to reveal your bond.");
      return;
    }
    void runCheck(toDdmmyyyy(partnerDob));
  };

  const onRecheck = (stored: StoredBond) => {
    if (checking) return;
    void runCheck(stored.partnerBirthday);
  };

  const openPicker = (which: "own" | "partner") => {
    // iOS spinners must match state, so commit the default when nothing is
    // picked yet; she adjusts from there. (Same pattern as signup.)
    if (which === "own") {
      if (Platform.OS === "ios" && !ownDob) setOwnDob(DEFAULT_DOB);
      setShowOwnPicker(true);
    } else {
      if (Platform.OS === "ios" && !partnerDob) setPartnerDob(DEFAULT_DOB);
      setShowPartnerPicker(true);
    }
  };

  return (
    <ScreenBackground scrimOpacity={0.6}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
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
            <Text style={styles.backText}>Sanctuary</Text>
          </TouchableOpacity>

          <Text style={styles.kicker}>♡ COSMIC BOND</Text>
          <Text style={styles.title}>Love compatibility</Text>
          <Text style={styles.subtitle}>
            {profileBirthday
              ? "Your stars are already here. Add their birthday and see what the sky says about the two of you."
              : "Add both birthdays and see what the sky says about the two of you."}
          </Text>

          {/* Her birthday — only when the account has no DOB on file */}
          {!profileBirthday && (
            <TouchableOpacity
              style={styles.dobField}
              activeOpacity={0.7}
              onPress={() => openPicker("own")}
              disabled={checking}
            >
              <View style={styles.dobRow}>
                <Text style={ownDob ? styles.dobValue : styles.dobPlaceholder}>
                  {ownDob ? formatDobDisplay(ownDob) : "Your birthday"}
                </Text>
                <Ionicons
                  name="calendar-outline"
                  size={20}
                  color={COLORS.textFaint}
                />
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.dobField}
            activeOpacity={0.7}
            onPress={() => openPicker("partner")}
            disabled={checking}
          >
            <View style={styles.dobRow}>
              <Text
                style={partnerDob ? styles.dobValue : styles.dobPlaceholder}
              >
                {partnerDob ? formatDobDisplay(partnerDob) : "Their birthday"}
              </Text>
              <Ionicons
                name="calendar-outline"
                size={20}
                color={COLORS.textFaint}
              />
            </View>
          </TouchableOpacity>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.checkBtn, checking && styles.checkBtnDisabled]}
            activeOpacity={0.85}
            onPress={onCheck}
            disabled={checking}
          >
            {checking ? (
              <ActivityIndicator color={COLORS.ctaText} />
            ) : (
              <Text style={styles.checkText}>REVEAL YOUR BOND</Text>
            )}
          </TouchableOpacity>

          {/* The result — self-contained so a screenshot carries the brand */}
          {bond && !checking && (
            <>
              <View style={styles.bondCard}>
                <Text style={styles.bondKicker}>COSMIC BOND</Text>

                <View style={styles.portraitsRow}>
                  <SignPortrait sign={bond.user_sign} />
                  <Text style={styles.portraitsAmp}>＆</Text>
                  <SignPortrait sign={bond.partner_sign} mirrored />
                </View>
                <Text style={styles.signsLine}>
                  {signGlyph(bond.user_sign)} {bond.user_sign}
                  {"   ·   "}
                  {signGlyph(bond.partner_sign)} {bond.partner_sign}
                </Text>

                <Text style={styles.score}>
                  {bond.overall_harmony_percentage}%
                </Text>
                <Text style={styles.scoreLabel}>OVERALL HARMONY</Text>

                <View style={styles.metersRow}>
                  {SUB_METERS.map((m, i) => (
                    <View
                      key={m.key}
                      style={[styles.meter, i > 0 && styles.meterDivider]}
                    >
                      <Text style={styles.meterValue}>{bond[m.key]}</Text>
                      <View style={styles.meterTrack}>
                        <View
                          style={[
                            styles.meterFill,
                            { width: `${bond[m.key]}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.meterLabel}>{m.label}</Text>
                    </View>
                  ))}
                </View>

                <Text style={styles.insight}>{bond.elemental_insight}</Text>
                {!!bond.compatibility_description && (
                  <Text style={styles.description}>
                    {bond.compatibility_description}
                  </Text>
                )}

                <Text style={styles.watermark}>V · ASK VALENTINA</Text>
              </View>

              {/* The one bridge on this screen */}
              <TouchableOpacity
                style={styles.bridgeBtn}
                activeOpacity={0.75}
                onPress={() => router.push("/psychics")}
              >
                <Text style={styles.bridgeText}>
                  A love reading can tell you if the stormy parts are worth it →
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Recent checks — one tap to re-run */}
          {recent.length > 0 && (
            <View style={styles.bondsSection}>
              <Text style={styles.bondsHeader}>YOUR BONDS</Text>
              {recent.map((b) => (
                <TouchableOpacity
                  key={b.partnerBirthday}
                  style={styles.bondRow}
                  activeOpacity={0.7}
                  onPress={() => onRecheck(b)}
                  disabled={checking}
                >
                  <Text style={styles.bondRowGlyph}>
                    {signGlyph(b.partnerSign)}
                  </Text>
                  <View style={styles.bondRowBody}>
                    <Text style={styles.bondRowSign}>{b.partnerSign}</Text>
                    <Text style={styles.bondRowDate}>{b.partnerBirthday}</Text>
                  </View>
                  <Text style={styles.bondRowScore}>{b.overallHarmony}%</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={COLORS.textFaint}
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <BirthdayPicker
        visible={showOwnPicker}
        title="YOUR BIRTHDAY"
        value={ownDob ?? DEFAULT_DOB}
        onChange={setOwnDob}
        onClose={() => setShowOwnPicker(false)}
      />
      <BirthdayPicker
        visible={showPartnerPicker}
        title="THEIR BIRTHDAY"
        value={partnerDob ?? DEFAULT_DOB}
        onChange={setPartnerDob}
        onClose={() => setShowPartnerPicker(false)}
      />
    </ScreenBackground>
  );
}

/** Circular sign portrait; glyph fallback for signs without dedicated art. */
function SignPortrait({
  sign,
  mirrored = false,
}: {
  sign: string;
  mirrored?: boolean;
}) {
  return (
    <View style={styles.portraitCircle}>
      <Image
        source={signPortrait(sign)}
        style={[styles.portraitImage, mirrored && styles.portraitMirrored]}
        resizeMode="cover"
      />
      {!hasDedicatedPortrait(sign) && (
        <View style={styles.portraitGlyphWrap} pointerEvents="none">
          <Text style={styles.portraitGlyph}>{signGlyph(sign)}</Text>
        </View>
      )}
    </View>
  );
}

/**
 * Native date picker in the signup style: Android's system dialog, iOS a dark
 * spinner in a branded modal with a Done button.
 */
function BirthdayPicker({
  visible,
  title,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  title: string;
  value: Date;
  onChange: (d: Date) => void;
  onClose: () => void;
}) {
  if (!visible) return null;

  if (Platform.OS === "android") {
    return (
      <DateTimePicker
        value={value}
        mode="date"
        display="default"
        maximumDate={TODAY}
        minimumDate={MIN_DOB}
        onChange={(event, selected) => {
          onClose();
          if (event.type !== "dismissed" && selected) onChange(selected);
        }}
      />
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.pickerOverlay}>
        <View style={styles.pickerCard}>
          <Text style={styles.pickerTitle}>{title}</Text>
          <DateTimePicker
            value={value}
            mode="date"
            display="spinner"
            themeVariant="dark"
            maximumDate={TODAY}
            minimumDate={MIN_DOB}
            onChange={(_event, selected) => {
              if (selected) onChange(selected);
            }}
          />
          <TouchableOpacity
            style={styles.pickerDone}
            activeOpacity={0.85}
            onPress={onClose}
          >
            <Text style={styles.pickerDoneText}>DONE</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingBottom: 48,
  },
  backLink: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  backText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontFamily: FONTS.regular,
    marginLeft: 2,
  },
  kicker: {
    fontSize: 13,
    color: COLORS.accent,
    letterSpacing: 2,
    fontFamily: FONTS.bold,
    marginTop: SPACING.sm,
    marginBottom: 6,
  },
  title: {
    ...TYPOGRAPHY.display,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
  },
  dobField: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 13,
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
  error: {
    color: COLORS.error,
    fontSize: 14,
    fontFamily: FONTS.regular,
    marginBottom: SPACING.md,
  },
  checkBtn: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.cta,
    paddingVertical: SPACING.lg,
    borderRadius: RADII.md,
    marginTop: 6,
    shadowColor: COLORS.cta,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 6,
  },
  checkBtnDisabled: { opacity: 0.6 },
  checkText: {
    color: COLORS.ctaText,
    fontSize: 15,
    letterSpacing: 1.2,
    fontFamily: FONTS.bold,
  },

  // Result card
  bondCard: {
    marginTop: SPACING.xl,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: alpha(COLORS.accentGold, 0.3),
    borderRadius: RADII.xl,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    alignItems: "center",
  },
  bondKicker: {
    fontSize: 12,
    letterSpacing: 2,
    color: COLORS.textSecondary,
    fontFamily: FONTS.semiBold,
  },
  portraitsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: SPACING.lg,
    gap: SPACING.md,
  },
  portraitsAmp: {
    fontSize: 22,
    color: alpha(COLORS.accentGold, 0.9),
    fontFamily: FONTS.heading,
  },
  portraitCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: alpha(COLORS.accentGold, 0.5),
    backgroundColor: COLORS.surfaceElevated,
  },
  portraitImage: {
    width: "100%",
    height: "100%",
  },
  portraitMirrored: {
    transform: [{ scaleX: -1 }],
  },
  portraitGlyphWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: alpha(COLORS.background, 0.35),
  },
  portraitGlyph: {
    fontSize: 34,
    color: alpha(COLORS.accentGold, 0.85),
    textShadowColor: alpha(COLORS.accentGold, 0.4),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  signsLine: {
    ...TYPOGRAPHY.caption,
    color: COLORS.accent,
    marginTop: SPACING.md,
    letterSpacing: 1,
  },
  score: {
    fontFamily: FONTS.headingExtra,
    fontSize: 56,
    lineHeight: 62,
    color: COLORS.accentGold,
    marginTop: SPACING.lg,
    textShadowColor: alpha(COLORS.accentGold, 0.35),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  scoreLabel: {
    fontSize: 12,
    letterSpacing: 2,
    color: COLORS.textSecondary,
    fontFamily: FONTS.semiBold,
    marginTop: 2,
  },
  metersRow: {
    flexDirection: "row",
    alignSelf: "stretch",
    marginTop: SPACING.xl,
  },
  meter: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.sm,
  },
  meterDivider: {
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
  },
  meterValue: {
    fontFamily: FONTS.heading,
    fontSize: 20,
    color: COLORS.accent,
  },
  meterTrack: {
    alignSelf: "stretch",
    height: 5,
    borderRadius: 3,
    backgroundColor: alpha(COLORS.accent, 0.12),
    overflow: "hidden",
  },
  meterFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  meterLabel: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: COLORS.textSecondary,
    fontFamily: FONTS.semiBold,
  },
  insight: {
    ...TYPOGRAPHY.body,
    color: COLORS.accent,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: SPACING.xl,
  },
  description: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.md,
  },
  watermark: {
    fontSize: 12,
    letterSpacing: 2,
    color: alpha(COLORS.accentGold, 0.55),
    fontFamily: FONTS.bold,
    marginTop: SPACING.xl,
  },
  bridgeBtn: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  bridgeText: {
    color: COLORS.accent,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: FONTS.semiBold,
    textAlign: "center",
  },

  // Recent bonds
  bondsSection: {
    marginTop: SPACING.xxl,
  },
  bondsHeader: {
    fontSize: 12,
    letterSpacing: 2,
    color: COLORS.textFaint,
    fontFamily: FONTS.semiBold,
    marginBottom: SPACING.sm,
  },
  bondRow: {
    minHeight: TOUCH_TARGET,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  bondRowGlyph: {
    fontSize: 22,
    color: alpha(COLORS.accentGold, 0.85),
  },
  bondRowBody: { flex: 1 },
  bondRowSign: {
    fontSize: 16,
    color: COLORS.textPrimary,
    fontFamily: FONTS.semiBold,
  },
  bondRowDate: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
  },
  bondRowScore: {
    fontFamily: FONTS.heading,
    fontSize: 18,
    color: COLORS.accentGold,
  },

  // iOS picker modal (signup style)
  pickerOverlay: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xl,
  },
  pickerCard: {
    alignSelf: "stretch",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: alpha(COLORS.accent, 0.25),
    borderRadius: RADII.xl,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    alignItems: "center",
  },
  pickerTitle: {
    fontSize: 12,
    letterSpacing: 1.5,
    color: COLORS.textSecondary,
    fontFamily: FONTS.semiBold,
    marginBottom: SPACING.sm,
  },
  pickerDone: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignSelf: "stretch",
    alignItems: "center",
    backgroundColor: COLORS.cta,
    borderRadius: RADII.md,
    marginTop: SPACING.sm,
  },
  pickerDoneText: {
    color: COLORS.ctaText,
    fontSize: 15,
    letterSpacing: 1.2,
    fontFamily: FONTS.bold,
  },
});
