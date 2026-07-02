import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS } from "../theme/colors";
import type { Psychic } from "../types";
import { getHalo, getTier, hexToRgba, perMinute } from "../utils/psychic";

export function PsychicCard({
  psychic,
  onPress,
}: {
  psychic: Psychic;
  onPress?: () => void;
}) {
  const halo = getHalo(psychic.categories);
  const tier = getTier(psychic.price_per_second);
  const rate = perMinute(psychic.price_per_second);
  const categories = psychic.categories ?? [];
  const shownTags = categories.slice(0, 3);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.card,
        {
          borderColor: hexToRgba(halo, 0.35),
          shadowColor: halo,
        },
      ]}
    >
      {/* PHOTO */}
      <View style={styles.photoWrap}>
        {psychic.profile_picture_url ? (
          <Image
            source={{ uri: psychic.profile_picture_url }}
            style={styles.photo}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.photo, styles.photoFallback]}>
            <Text style={{ fontSize: 48, color: hexToRgba(halo, 0.5) }}>✦</Text>
          </View>
        )}

        {/* Bottom fade so the photo blends smoothly into the card. Same RGB,
            alpha 0 -> opaque, so it fades cleanly instead of a flat band. */}
        <LinearGradient
          colors={[hexToRgba(COLORS.surface, 0), COLORS.surface]}
          locations={[0, 1]}
          style={styles.photoFade}
          pointerEvents="none"
        />

        {/* Tier badge (top-left) */}
        <View style={[styles.tierBadge, { backgroundColor: tier.color }]}>
          <Text style={styles.tierText}>{tier.label}</Text>
        </View>

        {/* Online indicator (top-right) */}
        {psychic.is_online && (
          <View style={styles.onlineWrap}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>ONLINE</Text>
          </View>
        )}
      </View>

      {/* BODY */}
      <View style={styles.body}>
        <Text style={styles.name}>{psychic.username}</Text>

        {/* Category tags */}
        <View style={styles.tagRow}>
          {shownTags.map((cat, i) => {
            const isPrimary = i === 0;
            return (
              <View
                key={cat.id}
                style={[
                  styles.tag,
                  isPrimary
                    ? {
                        borderColor: halo,
                        backgroundColor: hexToRgba(halo, 0.08),
                      }
                    : { borderColor: "rgba(255,255,255,0.12)" },
                ]}
              >
                <Text
                  style={[
                    styles.tagText,
                    { color: isPrimary ? halo : "rgba(255,255,255,0.5)" },
                  ]}
                >
                  {cat.title}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Bio */}
        {!!psychic.bio && (
          <Text style={styles.bio} numberOfLines={2}>
            {psychic.bio}
          </Text>
        )}

        {/* Bottom row: rate + button */}
        <View style={styles.bottomRow}>
          <View style={styles.rateWrap}>
            <Text style={[styles.rate, { color: tier.color }]}>${rate}</Text>
            <Text style={styles.rateUnit}>/min</Text>
          </View>
          <TouchableOpacity
            style={styles.button}
            activeOpacity={0.85}
            onPress={onPress}
            disabled={!onPress}
          >
            <Text style={styles.buttonText}>START READING →</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 16,
    // Soft halo glow (iOS shadow + Android elevation)
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  photoWrap: {
    width: "100%",
    aspectRatio: 3 / 4,
    position: "relative",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: "hidden",
  },
  photo: { width: "100%", height: "100%" },
  photoFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surfaceLight,
  },
  photoFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "55%",
  },
  tierBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  tierText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    color: COLORS.background,
    fontFamily: "Poppins_700Bold",
  },
  onlineWrap: {
    position: "absolute",
    top: 10,
    right: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.online,
  },
  onlineText: {
    fontSize: 9,
    letterSpacing: 1,
    color: COLORS.online,
    fontWeight: "700",
    fontFamily: "Poppins_600SemiBold",
  },
  body: { padding: 16 },
  name: {
    fontSize: 18,
    color: COLORS.text,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
    fontFamily: "Poppins_700Bold",
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  tag: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
  },
  bio: {
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.textMuted,
    fontStyle: "italic",
    marginBottom: 14,
    fontFamily: "Poppins_400Regular",
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    paddingTop: 12,
  },
  rateWrap: { flexDirection: "row", alignItems: "baseline", gap: 3 },
  rate: { fontSize: 18, fontFamily: "Poppins_700Bold" },
  rateUnit: { fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "Poppins_400Regular" },
  button: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontFamily: "Poppins_700Bold",
  },
});
