import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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
import BottomSheet, {
  SheetTitle,
  SheetBody,
  SheetPrimaryButton,
  SheetQuietButton,
} from "../../src/components/BottomSheet";
import { useAuth } from "../../src/context/AuthContext";
import {
  drawOracleAnswer,
  loadPullsUsed,
  recordPull,
  ORACLE_DAILY_LIMIT,
  type OracleAnswer,
} from "../../src/lib/oracle";

// Yes/No Oracle — she holds (or types) a question, pulls one card, gets one
// answer. The question is a private ritual: it never leaves this screen, is
// never stored, and is never sent anywhere. Three pulls a night; the fourth
// meets a gentle sheet pointing at a human reader.

export default function OracleScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [question, setQuestion] = useState("");
  const [pullsUsed, setPullsUsed] = useState<number | null>(null); // null = loading
  const [answer, setAnswer] = useState<OracleAnswer | null>(null);
  const [flipping, setFlipping] = useState(false);
  const [limitSheet, setLimitSheet] = useState(false);

  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    loadPullsUsed(user?.id).then((used) => {
      if (!cancelled) setPullsUsed(used);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const pullsLeft =
    pullsUsed === null ? null : Math.max(0, ORACLE_DAILY_LIMIT - pullsUsed);

  const onPull = () => {
    if (pullsUsed === null || flipping) return;
    if (pullsUsed >= ORACLE_DAILY_LIMIT) {
      setLimitSheet(true);
      return;
    }

    const drawn = drawOracleAnswer();
    setAnswer(drawn);
    setFlipping(true);
    setPullsUsed(pullsUsed + 1);
    void recordPull(user?.id).then(setPullsUsed);

    Animated.timing(progress, {
      toValue: 1,
      duration: 620,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setFlipping(false));
  };

  const onAskAnother = () => {
    if (flipping) return;
    setFlipping(true);
    Animated.timing(progress, {
      toValue: 0,
      duration: 320,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setAnswer(null);
      setFlipping(false);
    });
  };

  const goToReaders = () => {
    setLimitSheet(false);
    router.push("/psychics");
  };

  const backRotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });
  const frontRotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["180deg", "360deg"],
  });

  const revealed = !!answer && !flipping;

  return (
    <ScreenBackground scrimOpacity={0.6}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SafeAreaView style={styles.safe} edges={["top"]}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
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

            <Text style={styles.kicker}>✧ YES / NO ORACLE</Text>
            <Text style={styles.title}>Ask the cards</Text>
            <Text style={styles.subtitle}>
              Hold a question in your mind — or whisper it below. It stays
              between you and the cards. No one else will ever see it.
            </Text>

            <TextInput
              style={styles.questionInput}
              placeholder="Your question (optional)"
              placeholderTextColor={COLORS.textFaint}
              value={question}
              onChangeText={setQuestion}
              multiline
              maxLength={140}
              editable={!flipping}
            />

            {/* The single card — tap it (or the button) to pull */}
            <TouchableOpacity
              style={styles.cardWrap}
              activeOpacity={0.9}
              onPress={onPull}
              disabled={!!answer || pullsUsed === null}
            >
              <View style={styles.cardAspect}>
                <Animated.View
                  style={[
                    styles.face,
                    { transform: [{ perspective: 900 }, { rotateY: backRotate }] },
                  ]}
                >
                  <CardBack />
                </Animated.View>
                <Animated.View
                  style={[
                    styles.face,
                    styles.frontFace,
                    {
                      transform: [{ perspective: 900 }, { rotateY: frontRotate }],
                    },
                  ]}
                >
                  {answer && (
                    <Animated.Image
                      source={answer.card.image}
                      style={[
                        styles.cardImage,
                        answer.reversed && styles.cardImageReversed,
                      ]}
                      resizeMode="cover"
                    />
                  )}
                </Animated.View>
              </View>
            </TouchableOpacity>

            {pullsUsed === null ? (
              <ActivityIndicator
                color={COLORS.accent}
                style={{ marginTop: SPACING.xl }}
              />
            ) : revealed && answer ? (
              <View style={styles.answerBlock}>
                <Text style={styles.cardName}>
                  {answer.card.name}
                  {answer.reversed ? "  ·  Reversed" : ""}
                </Text>
                <Text style={styles.answerText}>{answer.text}</Text>

                {/* Only an unclear answer offers the bridge — one per game, max */}
                {answer.bucket === "unclear" && (
                  <TouchableOpacity
                    style={styles.bridgeBtn}
                    activeOpacity={0.75}
                    onPress={() => router.push("/psychics")}
                  >
                    <Text style={styles.bridgeText}>
                      This one needs a human reader →
                    </Text>
                  </TouchableOpacity>
                )}

                {pullsLeft !== null && pullsLeft > 0 ? (
                  <TouchableOpacity
                    style={styles.askAnotherBtn}
                    activeOpacity={0.85}
                    onPress={onAskAnother}
                  >
                    <Text style={styles.askAnotherText}>ASK ANOTHER</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.restLine}>
                    The cards rest until midnight.
                  </Text>
                )}
              </View>
            ) : (
              !answer && (
                <>
                  <TouchableOpacity
                    style={styles.pullBtn}
                    activeOpacity={0.85}
                    onPress={onPull}
                  >
                    <Text style={styles.pullText}>PULL A CARD</Text>
                  </TouchableOpacity>
                  <Text style={styles.pullsLeft}>
                    {pullsLeft === ORACLE_DAILY_LIMIT
                      ? `${ORACLE_DAILY_LIMIT} pulls each night`
                      : pullsLeft === 1
                        ? "1 pull left tonight"
                        : `${pullsLeft} pulls left tonight`}
                  </Text>
                </>
              )
            )}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>

      {/* Fourth attempt — the cards are done, a reader isn't */}
      <BottomSheet visible={limitSheet} onClose={() => setLimitSheet(false)}>
        <SheetTitle>The cards rest now.</SheetTitle>
        <SheetBody>
          A reader never does. Your three pulls return at midnight — but a
          question this persistent might deserve a real conversation.
        </SheetBody>
        <SheetPrimaryButton label="SPEAK TO A READER" onPress={goToReaders} />
        <SheetQuietButton
          label="Tomorrow, then"
          onPress={() => setLimitSheet(false)}
        />
      </BottomSheet>
    </ScreenBackground>
  );
}

function CardBack() {
  return (
    <LinearGradient
      colors={["#2A1B47", "#160E29", COLORS.surface]}
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
  questionInput: {
    minHeight: TOUCH_TARGET,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 13,
    fontSize: 17,
    lineHeight: 24,
    color: COLORS.textPrimary,
    fontFamily: FONTS.regular,
    marginBottom: SPACING.xl,
    textAlignVertical: "top",
  },
  cardWrap: {
    alignSelf: "center",
    width: "58%",
    maxWidth: 210,
  },
  cardAspect: {
    width: "100%",
    aspectRatio: 0.62,
  },
  face: {
    ...StyleSheet.absoluteFillObject,
    backfaceVisibility: "hidden",
    borderRadius: RADII.md,
    overflow: "hidden",
  },
  frontFace: {
    borderWidth: 1.5,
    borderColor: alpha(COLORS.accentGold, 0.55),
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
    borderColor: alpha(COLORS.accent, 0.25),
    borderRadius: RADII.md,
  },
  backFrame: {
    width: "72%",
    height: "82%",
    borderWidth: 1,
    borderColor: alpha(COLORS.accent, 0.3),
    borderRadius: RADII.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  backSigil: {
    fontSize: 34,
    color: alpha(COLORS.accent, 0.85),
    textShadowColor: alpha(COLORS.accent, 0.5),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  pullBtn: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: COLORS.cta,
    paddingHorizontal: 40,
    paddingVertical: SPACING.lg,
    borderRadius: RADII.md,
    marginTop: SPACING.xl,
    shadowColor: COLORS.cta,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 6,
  },
  pullText: {
    color: COLORS.ctaText,
    fontSize: 15,
    letterSpacing: 1.2,
    fontFamily: FONTS.bold,
  },
  pullsLeft: {
    ...TYPOGRAPHY.caption,
    fontFamily: FONTS.regular,
    textAlign: "center",
    marginTop: SPACING.md,
  },
  answerBlock: {
    alignItems: "center",
    marginTop: SPACING.xl,
  },
  cardName: {
    ...TYPOGRAPHY.caption,
    color: COLORS.accent,
    letterSpacing: 1,
    textAlign: "center",
  },
  answerText: {
    fontFamily: FONTS.heading,
    fontSize: 24,
    lineHeight: 32,
    color: COLORS.accentGold,
    textAlign: "center",
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.sm,
    textShadowColor: alpha(COLORS.accentGold, 0.35),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  bridgeBtn: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  bridgeText: {
    color: COLORS.accent,
    fontSize: 16,
    fontFamily: FONTS.semiBold,
    textAlign: "center",
  },
  askAnotherBtn: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    marginTop: SPACING.xl,
    paddingHorizontal: 32,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: alpha(COLORS.accent, 0.35),
  },
  askAnotherText: {
    color: COLORS.accent,
    fontSize: 15,
    letterSpacing: 1,
    fontFamily: FONTS.bold,
  },
  restLine: {
    ...TYPOGRAPHY.caption,
    fontFamily: FONTS.regular,
    marginTop: SPACING.xl,
  },
});
