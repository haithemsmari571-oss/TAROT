import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { COLORS } from "../theme/colors";
import {
  computeDraw,
  generateReading,
  loadDrawState,
  markRevealed,
  type DrawnCard,
} from "../utils/dailyDraw";

export default function DailyDraw() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [dateKey, setDateKey] = useState<string>("");

  // The draw is deterministic from the date key.
  const draw = useMemo<DrawnCard[]>(
    () => (dateKey ? computeDraw(dateKey) : []),
    [dateKey]
  );
  const reading = useMemo(
    () => (draw.length ? generateReading(draw) : ""),
    [draw]
  );

  // One flip progress value per card (0 = face down, 1 = face up).
  const progress = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const state = await loadDrawState();
      if (cancelled) return;
      setDateKey(state.dateKey);
      if (state.revealed) {
        // Already drawn today — show the faces immediately, no animation.
        progress.forEach((p) => p.setValue(1));
        setRevealed(true);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [progress]);

  const onReveal = () => {
    setRevealed(true);
    void markRevealed(dateKey);
    // Staggered flip: card 1, then 2, then 3.
    Animated.stagger(
      120,
      progress.map((p) =>
        Animated.timing(p, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      )
    ).start();
  };

  return (
    <View style={styles.section}>
      <Text style={styles.kicker}>✦ Your Daily Draw</Text>
      <Text style={styles.sectionSub}>
        Three cards for today. They rest until midnight.
      </Text>

      <View style={styles.row}>
        {draw.map((d, i) => (
          <FlipCard key={d.position} drawn={d} progress={progress[i]} />
        ))}
        {/* Placeholder backs before the async load resolves, so layout is stable. */}
        {!draw.length &&
          [0, 1, 2].map((i) => (
            <View key={i} style={styles.cardColumn}>
              <View style={styles.cardAspect}>
                <CardBack />
              </View>
            </View>
          ))}
      </View>

      {ready && !revealed && (
        <TouchableOpacity
          style={styles.revealBtn}
          activeOpacity={0.85}
          onPress={onReveal}
        >
          <Text style={styles.revealText}>REVEAL TODAY&apos;S CARDS</Text>
        </TouchableOpacity>
      )}

      {ready && revealed && (
        <>
          <Text style={styles.reading}>{reading}</Text>
          <TouchableOpacity
            style={styles.bookBtn}
            activeOpacity={0.75}
            onPress={() => router.push("/psychics")}
          >
            <Text style={styles.bookText}>Book a Reading →</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

function FlipCard({
  drawn,
  progress,
}: {
  drawn: DrawnCard;
  progress: Animated.Value;
}) {
  const backRotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });
  const frontRotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["180deg", "360deg"],
  });

  return (
    <View style={styles.cardColumn}>
      <View style={styles.cardAspect}>
        {/* Back face (face-down) */}
        <Animated.View
          style={[
            styles.face,
            { transform: [{ perspective: 900 }, { rotateY: backRotate }] },
          ]}
        >
          <CardBack />
        </Animated.View>

        {/* Front face (card art) */}
        <Animated.View
          style={[
            styles.face,
            styles.frontFace,
            { transform: [{ perspective: 900 }, { rotateY: frontRotate }] },
          ]}
        >
          <Image
            source={drawn.card.image}
            style={[
              styles.cardImage,
              drawn.reversed && styles.cardImageReversed,
            ]}
            resizeMode="cover"
          />
        </Animated.View>
      </View>

      {/* Labels fade in with the flip. */}
      <Animated.View style={{ opacity: progress, width: "100%" }}>
        <Text style={styles.position}>{drawn.position.toUpperCase()}</Text>
        <Text style={styles.cardName} numberOfLines={2}>
          {drawn.card.name}
        </Text>
        <Text
          style={[
            styles.orientation,
            drawn.reversed ? styles.reversed : styles.upright,
          ]}
        >
          {drawn.reversed ? "↓ Reversed" : "↑ Upright"}
        </Text>
      </Animated.View>
    </View>
  );
}

function CardBack() {
  return (
    <LinearGradient
      colors={["#2A1B47", "#160E29", "#0D1117"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.cardBack}
    >
      <View style={styles.backFrame}>
        <Text style={styles.backSigil}>✦</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  section: {
    width: "100%",
    marginTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  kicker: {
    fontSize: 13,
    color: COLORS.lavender,
    letterSpacing: 2,
    textTransform: "uppercase",
    textAlign: "center",
    fontFamily: "Poppins_700Bold",
    marginBottom: 6,
  },
  sectionSub: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: "center",
    fontFamily: "Poppins_400Regular",
    marginBottom: 20,
  },
  row: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-start",
  },
  cardColumn: {
    flex: 1,
    maxWidth: 130,
    alignItems: "center",
    marginHorizontal: 5,
  },
  cardAspect: {
    width: "100%",
    aspectRatio: 0.62,
  },
  face: {
    ...StyleSheet.absoluteFillObject,
    backfaceVisibility: "hidden",
    borderRadius: 12,
    overflow: "hidden",
  },
  frontFace: {
    borderWidth: 1.5,
    borderColor: "rgba(242,174,64,0.55)", // subtle golden border
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  cardImageReversed: {
    transform: [{ rotate: "180deg" }],
  },
  cardBack: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(210,185,255,0.25)",
    borderRadius: 12,
  },
  backFrame: {
    width: "72%",
    height: "82%",
    borderWidth: 1,
    borderColor: "rgba(210,185,255,0.3)",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  backSigil: {
    fontSize: 34,
    color: "rgba(210,185,255,0.85)",
    textShadowColor: "rgba(210,185,255,0.5)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  position: {
    fontSize: 9,
    color: COLORS.gold,
    letterSpacing: 1.5,
    textAlign: "center",
    fontFamily: "Poppins_700Bold",
    marginTop: 10,
  },
  cardName: {
    fontSize: 12,
    color: COLORS.lavender,
    textAlign: "center",
    fontFamily: "Poppins_600SemiBold",
    marginTop: 2,
    minHeight: 34,
  },
  orientation: {
    fontSize: 10,
    textAlign: "center",
    fontFamily: "Poppins_400Regular",
  },
  upright: { color: COLORS.textMuted },
  reversed: { color: "rgba(242,174,64,0.8)" },
  reading: {
    fontSize: 14,
    lineHeight: 23,
    color: COLORS.text,
    textAlign: "center",
    fontStyle: "italic",
    fontFamily: "Poppins_400Regular",
    marginTop: 28,
    paddingHorizontal: 4,
  },
  revealBtn: {
    backgroundColor: COLORS.purple,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 26,
    shadowColor: COLORS.purple,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 6,
  },
  revealText: {
    color: "#fff",
    fontSize: 13,
    letterSpacing: 1.2,
    fontFamily: "Poppins_700Bold",
  },
  bookBtn: {
    alignSelf: "center",
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(210,185,255,0.35)",
  },
  bookText: {
    color: COLORS.lavender,
    fontSize: 13,
    letterSpacing: 0.5,
    fontFamily: "Poppins_600SemiBold",
  },
});
