import type { ReactNode } from "react";
import {
  View,
  Image,
  StyleSheet,
  type ImageSourcePropType,
} from "react-native";
import { COLORS } from "../theme";

// React Native equivalent of the website's PageBackground
// (tarot-landing-web/src/components/PageBackground.tsx): one static, dimmed
// celestial scene behind the whole screen. Calm on purpose — no animation, no
// particles; the image is heavily veiled so content always wins.
//
// The image + scrim are absolutely positioned and extend under the status bar
// (full bleed); screens keep their own SafeAreaView for content, exactly as
// they did over the old solid background.
//
// Everything here is static (no state, no effects), so it never causes
// re-renders — the image decodes once and stays put.

const DEFAULT_BG = require("../../assets/backgrounds/celestial-portal.webp");

// Convenience map so screens can pick their scene without require() paths.
export const BACKGROUNDS = {
  celestialPortal: DEFAULT_BG as ImageSourcePropType,
  moonlitBalcony:
    require("../../assets/backgrounds/moonlit-balcony.webp") as ImageSourcePropType,
  chat: require("../../assets/backgrounds/chat-background.webp") as ImageSourcePropType,
  zodiacHall1:
    require("../../assets/backgrounds/zodiac-hall-1.webp") as ImageSourcePropType,
  zodiacHall2:
    require("../../assets/backgrounds/zodiac-hall-2.webp") as ImageSourcePropType,
  zodiacHall3:
    require("../../assets/backgrounds/zodiac-hall-3.webp") as ImageSourcePropType,
  zodiacHall4:
    require("../../assets/backgrounds/zodiac-hall-4.webp") as ImageSourcePropType,
};

interface ScreenBackgroundProps {
  /** Scene image; defaults to the celestial portal (home/billing scene on web). */
  source?: ImageSourcePropType;
  /** 0–1 darkness of the #0B0B0B veil over the image. Higher = calmer/dimmer. */
  scrimOpacity?: number;
  children?: ReactNode;
}

export default function ScreenBackground({
  source = DEFAULT_BG,
  scrimOpacity = 0.65,
  children,
}: ScreenBackgroundProps) {
  return (
    <View style={styles.root}>
      <Image
        source={source}
        style={styles.image}
        resizeMode="cover"
        fadeDuration={0}
      />
      <View style={[styles.scrim, { opacity: scrimOpacity }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // Solid base under everything so text contrast holds even before the image
  // decodes (and behind letterboxing on extreme aspect ratios).
  root: { flex: 1, backgroundColor: COLORS.background },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    opacity: 0.38,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.background,
  },
});
