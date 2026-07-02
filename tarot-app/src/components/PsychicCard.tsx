import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { COLORS } from "../theme/colors";
import type { Psychic } from "../types";

// Category -> halo color (mirrors the web app)
const CATEGORY_HALO: Record<string, string> = {
  love: "#FF4D8D",
  "love reading": "#FF4D8D",
  romantic: "#FF4D8D",
  "relationship advice": "#FF5C72",
  career: "#F2AE40",
  finance: "#F2AE40",
  business: "#F2AE40",
  "spiritual guidance": "#D2B9FF",
  "spiritual counseling": "#D2B9FF",
  spiritual: "#D2B9FF",
  "crystal healing": "#00C9A7",
  "energy healing": "#00C9A7",
  "reiki healing": "#00C9A7",
  reiki: "#00C9A7",
  "past life": "#9B59B6",
  "past life regression": "#9B59B6",
  "soul reading": "#BA68C8",
  "aura reading": "#64B5F6",
  aura: "#64B5F6",
  "tarot reading": "#7B1FA2",
  tarot: "#7B1FA2",
  clairvoyance: "#E040FB",
  "psychic medium": "#CE93D8",
  "dream interpretation": "#5C6BC0",
  dreams: "#5C6BC0",
  health: "#66BB6A",
  wellness: "#66BB6A",
  divination: "#D2B9FF",
  "horoscope insights": "#FFB300",
  astrology: "#FFB300",
  "life path guidance": "#FFB300",
  "life path": "#FFB300",
  "shamanic journeying": "#8D6E63",
  shamanic: "#8D6E63",
  default: "#8A63D2",
};

// Turn a 6-digit hex into an rgba() string (RN needs this for opacity blends).
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getHalo(categories?: { title?: string }[]): string {
  if (!categories?.length) return CATEGORY_HALO.default;
  const primary = (categories[0]?.title || "").toLowerCase().trim();
  return CATEGORY_HALO[primary] || CATEGORY_HALO.default;
}

function getTier(pricePerSecond: number | null): { label: string; color: string } {
  const perMin = (pricePerSecond || 0) * 60;
  if (perMin < 3.5) return { label: "Rising", color: COLORS.rising };
  if (perMin <= 5.5) return { label: "Elite", color: COLORS.elite };
  return { label: "Master", color: COLORS.master };
}

export function PsychicCard({ psychic }: { psychic: Psychic }) {
  const halo = getHalo(psychic.categories);
  const tier = getTier(psychic.price_per_second);
  const perMinute = ((psychic.price_per_second || 0) * 60).toFixed(2);
  const categories = psychic.categories ?? [];
  const shownTags = categories.slice(0, 3);

  return (
    <View
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

        {/* Bottom fade so the photo blends into the card */}
        <View style={styles.photoFade} pointerEvents="none" />

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
            <Text style={[styles.rate, { color: tier.color }]}>${perMinute}</Text>
            <Text style={styles.rateUnit}>/min</Text>
          </View>
          <TouchableOpacity style={styles.button} activeOpacity={0.85}>
            <Text style={styles.buttonText}>START READING →</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
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
    height: "45%",
    backgroundColor: COLORS.surface,
    opacity: 0.55,
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
