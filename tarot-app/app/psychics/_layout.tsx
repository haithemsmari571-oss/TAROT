import { Stack } from "expo-router";
import { COLORS } from "../../src/theme/colors";

// Nested stack inside the "Psychics" tab so tapping a card can push the
// detail screen (with a native back gesture) while the tab bar stays put.
export default function PsychicsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
