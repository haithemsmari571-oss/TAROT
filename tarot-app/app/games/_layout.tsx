import { Stack } from "expo-router";
import { COLORS } from "../../src/theme";

// Nested stack for the SANCTUARY games (oracle / compatibility / moon) so each
// game pushes with a native back gesture while the tab bar stays put. The
// "games" tab itself is hidden from the tab bar (href: null in the root layout).
export default function GamesStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Stack.Screen name="oracle" />
      <Stack.Screen name="compatibility" />
      <Stack.Screen name="moon" />
    </Stack>
  );
}
