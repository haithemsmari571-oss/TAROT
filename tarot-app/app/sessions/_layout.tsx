import { Stack } from "expo-router";
import { COLORS } from "../../src/theme/colors";

// Nested stack inside the "Sessions" tab so the chat list can push a chat.
export default function SessionsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: COLORS.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="[chatId]" />
    </Stack>
  );
}
