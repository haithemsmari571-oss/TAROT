import { useEffect, useRef } from "react";
import {
  Animated,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";

// Pulsing placeholder block for loading states — compose into card/row shapes
// per screen. One shared animation style so every skeleton in the app breathes
// the same way. Pure JS (Animated with native driver), no dependencies.

export default function Skeleton({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return <Animated.View style={[styles.base, style, { opacity: pulse }]} />;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 8,
  },
});
