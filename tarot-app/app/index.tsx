import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
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
import WelcomeCreditBanner from "../src/components/WelcomeCreditBanner";
import DailyDraw from "../src/components/DailyDraw";
import SignHeader from "../src/components/sanctuary/SignHeader";
import CosmicWeather from "../src/components/sanctuary/CosmicWeather";
import ConstellationPull from "../src/components/sanctuary/ConstellationPull";
import YourDayCard from "../src/components/sanctuary/YourDayCard";
import CelebrationHost from "../src/components/sanctuary/CelebrationHost";
import { useAuth } from "../src/context/AuthContext";
import {
  getConstellation,
  type ConstellationPayload,
} from "../src/api/constellation";

export default function SanctuaryScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [data, setData] = useState<ConstellationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set the moment she pulls, so Your Day unveils without waiting for a refetch.
  const [revealedNow, setRevealedNow] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!user) return;
    try {
      setData(await getConstellation());
      setError(null);
    } catch {
      setError(
        "The stars are quiet — we couldn't load your Sanctuary. Pull down to retry."
      );
    }
  }, [user]);

  // Refresh whenever the tab gains focus (new day, streak from another device).
  useFocusEffect(
    useCallback(() => {
      if (!user) {
        setLoading(false);
        setData(null);
        return;
      }
      let active = true;
      load().finally(() => {
        if (active) setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [user, load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const onPulled = useCallback(() => {
    setRevealedNow(true);
    void load(); // quiet resync of streak/reward/balance
  }, [load]);

  const signedIn = !!user;
  const ready = signedIn && data?.dob_set && data.zodiac_sign && data.today.card;
  const revealed = (data?.today.pulled ?? false) || revealedNow;

  return (
    <ScreenBackground scrimOpacity={0.55}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            signedIn ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={COLORS.accent}
                colors={[COLORS.accent]}
                progressBackgroundColor={COLORS.surface}
              />
            ) : undefined
          }
        >
          {/* Unspent welcome credit — hidden for signed-out/zero-credit users */}
          <WelcomeCreditBanner />

          {authLoading || (signedIn && loading) ? (
            <View style={styles.center}>
              <ActivityIndicator color={COLORS.accent} />
            </View>
          ) : ready && data ? (
            <>
              {/* 1. Her sign greets her */}
              <SignHeader
                sign={data.zodiac_sign!}
                username={user?.username}
                streakLength={data.streak.length}
              />

              {/* 2. Three-second glance */}
              <CosmicWeather sign={data.zodiac_sign!} dateIso={data.today.date} />

              {/* 3. The daily ritual (carries this scroll's one bridge) */}
              <ConstellationPull
                pulled={data.today.pulled}
                rewardToday={data.today.reward}
                card={data.today.card}
                streak={data.streak}
                upsell={data.upsell}
                onPulled={onPulled}
              />

              {/* 4. The reading — veiled until she pulls */}
              <YourDayCard
                sign={data.zodiac_sign!}
                card={data.today.card!}
                revealed={revealed}
              />

              {/* 5. Close of the page */}
              <TouchableOpacity
                style={styles.psychicsCta}
                activeOpacity={0.85}
                onPress={() => router.push("/psychics")}
              >
                <Text style={styles.psychicsCtaText}>FIND YOUR PSYCHIC</Text>
              </TouchableOpacity>
            </>
          ) : signedIn && error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorSigil}>☾</Text>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                activeOpacity={0.85}
                onPress={() => {
                  setLoading(true);
                  load().finally(() => setLoading(false));
                }}
              >
                <Text style={styles.retryText}>RETRY</Text>
              </TouchableOpacity>
            </View>
          ) : (
            // Signed out (or the rare account the backend says has no DOB):
            // the original hero + device-local daily draw.
            <>
              <View style={styles.hero}>
                <Text style={styles.logo}>V</Text>
                <Text style={styles.headline}>
                  What does your psychic already see?
                </Text>
                <Text style={styles.subtext}>
                  Connect with a gifted reader. Get the clarity you&apos;ve been
                  waiting for.
                </Text>
                <TouchableOpacity
                  style={styles.cta}
                  activeOpacity={0.85}
                  onPress={() => router.push("/psychics")}
                >
                  <Text style={styles.ctaText}>FIND YOUR PSYCHIC</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.divider} />
              <DailyDraw />
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Gifts from Valentina + approved ritual claims, one calm moment at a time */}
      <CelebrationHost active={signedIn} />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  center: {
    flexGrow: 1,
    minHeight: 320,
    alignItems: "center",
    justifyContent: "center",
  },

  // Signed-in closing CTA
  psychicsCta: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginTop: SPACING.xl,
    paddingHorizontal: 40,
    paddingVertical: SPACING.lg,
    borderRadius: RADII.md,
    backgroundColor: COLORS.cta,
    shadowColor: COLORS.cta,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 6,
  },
  psychicsCtaText: {
    color: COLORS.ctaText,
    fontSize: 15,
    letterSpacing: 1.2,
    fontFamily: FONTS.bold,
  },

  // Error state
  errorCard: {
    marginHorizontal: 20,
    marginTop: SPACING.xxl,
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.xl,
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
  },
  errorSigil: {
    fontSize: 30,
    color: alpha(COLORS.accent, 0.6),
  },
  errorText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  retryBtn: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.cta,
    paddingHorizontal: 28,
    borderRadius: RADII.sm,
    marginTop: SPACING.sm,
  },
  retryText: {
    color: COLORS.accent,
    fontSize: 14,
    letterSpacing: 1,
    fontFamily: FONTS.bold,
  },

  // Signed-out hero (unchanged visual from before)
  hero: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xxl,
    paddingTop: 40,
    paddingBottom: 44,
  },
  logo: {
    fontSize: 64,
    color: COLORS.accent,
    fontFamily: FONTS.headingExtra,
    marginBottom: SPACING.xxl,
    textShadowColor: alpha(COLORS.accent, 0.4),
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
  },
  headline: {
    ...TYPOGRAPHY.displayLarge,
    textAlign: "center",
    marginBottom: 18,
  },
  subtext: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: 40,
  },
  cta: {
    minHeight: TOUCH_TARGET,
    justifyContent: "center",
    backgroundColor: COLORS.cta,
    paddingHorizontal: 40,
    paddingVertical: SPACING.lg,
    borderRadius: RADII.md,
    shadowColor: COLORS.cta,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 6,
  },
  ctaText: {
    color: COLORS.ctaText,
    fontSize: 15,
    letterSpacing: 1.2,
    fontFamily: FONTS.bold,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginHorizontal: 40,
    marginBottom: SPACING.xxl,
  },
});
