import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import {
  COLORS,
  FONTS,
  SPACING,
  RADII,
  TOUCH_TARGET,
  alpha,
} from "../../theme";

// SANCTUARY games — three doors below Your Day. These cards are navigation,
// not bridges: each game carries its own single soft bridge inside, so this
// section adds nothing to the scroll's one-bridge budget.

const GAMES: {
  glyph: string;
  title: string;
  sub: string;
  route: "/games/oracle" | "/games/compatibility" | "/games/moon";
}[] = [
  {
    glyph: "✧",
    title: "Oracle",
    sub: "Ask the cards",
    route: "/games/oracle",
  },
  {
    glyph: "♡",
    title: "Bonds",
    sub: "Love match",
    route: "/games/compatibility",
  },
  {
    glyph: "☾",
    title: "Moon",
    sub: "Tonight's phase",
    route: "/games/moon",
  },
];

export default function GamesSection() {
  const router = useRouter();

  return (
    <View style={styles.section}>
      <Text style={styles.kicker}>✦ SANCTUARY GAMES</Text>
      <View style={styles.row}>
        {GAMES.map((g) => (
          <TouchableOpacity
            key={g.route}
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => router.push(g.route)}
          >
            <Text style={styles.glyph}>{g.glyph}</Text>
            <Text style={styles.title}>{g.title}</Text>
            <Text style={styles.sub}>{g.sub}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 20,
    marginTop: SPACING.xl,
  },
  kicker: {
    fontSize: 12,
    letterSpacing: 2,
    color: COLORS.textFaint,
    fontFamily: FONTS.semiBold,
    marginBottom: SPACING.sm,
    paddingLeft: 2,
  },
  row: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  card: {
    flex: 1,
    minHeight: Math.max(TOUCH_TARGET, 110),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.lg,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.sm,
    gap: 4,
  },
  glyph: {
    fontSize: 26,
    color: alpha(COLORS.accentGold, 0.9),
    textShadowColor: alpha(COLORS.accentGold, 0.4),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
    marginBottom: 2,
  },
  title: {
    fontFamily: FONTS.heading,
    fontSize: 17,
    color: COLORS.textPrimary,
  },
  sub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
    textAlign: "center",
  },
});
