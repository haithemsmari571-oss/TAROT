import { View, Text, StyleSheet } from "react-native";
import { COLORS, FONTS, SPACING, RADII, alpha } from "../../theme";
import { cosmicWeather } from "../../lib/zodiac";

// Three glanceable meters for her sign today — the 3-second check. Values are
// deterministic per (sign, date), same as the daily content.

const METERS: { key: "love" | "clarity" | "energy"; label: string }[] = [
  { key: "love", label: "LOVE" },
  { key: "clarity", label: "CLARITY" },
  { key: "energy", label: "ENERGY" },
];

export default function CosmicWeather({
  sign,
  dateIso,
}: {
  sign: string;
  dateIso: string;
}) {
  const values = cosmicWeather(sign, dateIso);

  return (
    <View style={styles.card}>
      {METERS.map((m, i) => (
        <View key={m.key} style={[styles.meter, i > 0 && styles.meterDivider]}>
          <Text style={styles.value}>{values[m.key]}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${values[m.key]}%` }]} />
          </View>
          <Text style={styles.label}>{m.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: SPACING.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.lg,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.sm,
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
  value: {
    fontFamily: FONTS.heading,
    fontSize: 22,
    color: COLORS.accentGold,
  },
  track: {
    alignSelf: "stretch",
    height: 5,
    borderRadius: 3,
    backgroundColor: alpha(COLORS.accent, 0.12),
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  label: {
    fontSize: 11,
    letterSpacing: 1.5,
    color: COLORS.textSecondary,
    fontFamily: FONTS.semiBold,
  },
});
