import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../../src/api/client";
import { COLORS } from "../../src/theme/colors";
import type { Psychic } from "../../src/types";
import { getHalo, getTier, hexToRgba, perMinute } from "../../src/utils/psychic";

export default function PsychicDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [psychic, setPsychic] = useState<Psychic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/api/psychic/${id}`);
      setPsychic(res.data);
      setError(null);
    } catch (err) {
      console.error("Failed to load psychic:", err);
      setError("Couldn't load this psychic. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const BackButton = (
    <TouchableOpacity
      style={styles.backBtn}
      activeOpacity={0.7}
      onPress={() => router.back()}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <Ionicons name="chevron-back" size={22} color={COLORS.text} />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.stateRoot} edges={["top"]}>
        <StatusBar style="light" />
        <View style={styles.topBar}>{BackButton}</View>
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.lavender} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !psychic) {
    return (
      <SafeAreaView style={styles.stateRoot} edges={["top"]}>
        <StatusBar style="light" />
        <View style={styles.topBar}>{BackButton}</View>
        <View style={styles.center}>
          <Text style={styles.error}>{error ?? "Psychic not found."}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            activeOpacity={0.85}
            onPress={() => {
              setLoading(true);
              load();
            }}
          >
            <Text style={styles.retryText}>RETRY</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const halo = getHalo(psychic.categories);
  const tier = getTier(psychic.price_per_second);
  const rate = perMinute(psychic.price_per_second);
  const categories = psychic.categories ?? [];
  const availability = psychic.availability ?? [];

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll} bounces>
        {/* HERO PHOTO */}
        <View style={styles.hero}>
          {psychic.profile_picture_url ? (
            <Image
              source={{ uri: psychic.profile_picture_url }}
              style={styles.heroPhoto}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.heroPhoto, styles.heroFallback]}>
              <Text style={{ fontSize: 72, color: hexToRgba(halo, 0.5) }}>✦</Text>
            </View>
          )}
          {/* Bottom fade so the hero photo blends smoothly into the page.
              Same RGB, alpha 0 -> opaque, for a clean fade (not a flat band). */}
          <LinearGradient
            colors={[hexToRgba(COLORS.background, 0), COLORS.background]}
            locations={[0, 1]}
            style={styles.heroFade}
            pointerEvents="none"
          />

          {/* Floating back button over the hero */}
          <SafeAreaView style={styles.heroTopBar} edges={["top"]}>
            {BackButton}
          </SafeAreaView>

          {/* Tier badge */}
          <View style={[styles.tierBadge, { backgroundColor: tier.color }]}>
            <Text style={styles.tierText}>{tier.label}</Text>
          </View>

          {/* Online indicator */}
          {psychic.is_online && (
            <View style={styles.onlineWrap}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>ONLINE</Text>
            </View>
          )}
        </View>

        {/* BODY */}
        <View style={styles.body}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{psychic.username}</Text>
            {psychic.is_verified && (
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={COLORS.lavender}
                style={{ marginLeft: 8 }}
              />
            )}
          </View>

          {/* Rate */}
          <View style={styles.rateWrap}>
            <Text style={[styles.rate, { color: tier.color }]}>${rate}</Text>
            <Text style={styles.rateUnit}>/min</Text>
          </View>

          {/* Categories */}
          {categories.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>SPECIALTIES</Text>
              <View style={styles.tagRow}>
                {categories.map((cat, i) => {
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
            </>
          )}

          {/* Bio */}
          {!!psychic.bio && (
            <>
              <Text style={styles.sectionLabel}>ABOUT</Text>
              <Text style={styles.bio}>{psychic.bio}</Text>
            </>
          )}

          {/* Availability */}
          {availability.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>AVAILABILITY</Text>
              <View style={styles.availList}>
                {availability.map((slot) => (
                  <View key={slot.id} style={styles.availRow}>
                    <Text style={styles.availDay}>{slot.day_of_the_week}</Text>
                    <Text style={styles.availTime}>
                      {slot.start_at} – {slot.end_at}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* STICKY CTA */}
      <SafeAreaView edges={["bottom"]} style={styles.ctaBar}>
        <TouchableOpacity
          style={styles.cta}
          activeOpacity={0.85}
          onPress={() =>
            Alert.alert(
              "Reading sessions",
              "Live readings arrive in the next update. You'll be able to start a session with " +
                psychic.username +
                " right here.",
              [{ text: "Got it" }]
            )
          }
        >
          <Text style={styles.ctaText}>START READING →</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  stateRoot: { flex: 1, backgroundColor: COLORS.background },
  topBar: { paddingHorizontal: 12, paddingTop: 4 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  scroll: { paddingBottom: 24 },

  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },

  hero: {
    width: "100%",
    aspectRatio: 3 / 4,
    position: "relative",
    backgroundColor: COLORS.surface,
  },
  heroPhoto: { width: "100%", height: "100%" },
  heroFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surfaceLight,
  },
  heroFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "50%",
  },
  heroTopBar: {
    position: "absolute",
    top: 0,
    left: 0,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  tierBadge: {
    position: "absolute",
    bottom: 16,
    left: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  tierText: {
    fontSize: 11,
    letterSpacing: 0.8,
    color: COLORS.background,
    fontFamily: "Poppins_700Bold",
  },
  onlineWrap: {
    position: "absolute",
    top: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.4)",
    paddingHorizontal: 10,
    paddingVertical: 5,
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
    fontFamily: "Poppins_600SemiBold",
  },

  body: { padding: 20 },
  nameRow: { flexDirection: "row", alignItems: "center" },
  name: {
    fontSize: 26,
    color: COLORS.text,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontFamily: "Poppins_700Bold",
  },
  rateWrap: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginTop: 6,
  },
  rate: { fontSize: 24, fontFamily: "Poppins_700Bold" },
  rateUnit: {
    fontSize: 13,
    color: "rgba(255,255,255,0.4)",
    fontFamily: "Poppins_400Regular",
  },

  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    color: "rgba(255,255,255,0.4)",
    fontFamily: "Poppins_600SemiBold",
    marginTop: 24,
    marginBottom: 12,
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontFamily: "Poppins_600SemiBold",
  },
  bio: {
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.textMuted,
    fontFamily: "Poppins_400Regular",
  },
  availList: { gap: 10 },
  availRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    paddingBottom: 10,
  },
  availDay: {
    fontSize: 13,
    color: COLORS.text,
    textTransform: "capitalize",
    fontFamily: "Poppins_600SemiBold",
  },
  availTime: {
    fontSize: 13,
    color: COLORS.textMuted,
    fontFamily: "Poppins_400Regular",
  },

  ctaBar: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: COLORS.surface,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  cta: {
    backgroundColor: COLORS.purple,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: COLORS.purple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 6,
  },
  ctaText: {
    color: "#fff",
    fontSize: 13,
    letterSpacing: 1.2,
    fontFamily: "Poppins_700Bold",
  },
  error: {
    color: COLORS.textMuted,
    textAlign: "center",
    fontFamily: "Poppins_400Regular",
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
  },
  retryBtn: {
    borderWidth: 1,
    borderColor: COLORS.purple,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryText: {
    color: COLORS.lavender,
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: "Poppins_700Bold",
  },
});
