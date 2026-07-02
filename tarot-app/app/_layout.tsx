import { Tabs } from "expo-router";
import { Text } from "react-native";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { COLORS } from "../src/theme/colors";

export default function RootLayout() {
  // Load Poppins before rendering so fontFamily references resolve. If loading
  // fails, `error` is set and we still render (RN falls back to system font).
  const [loaded, error] = useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  if (!loaded && !error) {
    return null;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: "#0D1117",
          borderTopColor: "rgba(255,255,255,0.06)",
          borderTopWidth: 1,
          height: 85,
          paddingBottom: 20,
        },
        tabBarActiveTintColor: COLORS.lavender,
        tabBarInactiveTintColor: "rgba(255,255,255,0.35)",
        tabBarLabelStyle: {
          fontSize: 10,
          letterSpacing: 0.08,
          fontFamily: "Poppins_400Regular",
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "SANCTUARY",
          tabBarIcon: ({ color }) => <TabIcon symbol="✦" color={color} />,
        }}
      />
      <Tabs.Screen
        name="psychics"
        options={{
          title: "PSYCHICS",
          tabBarIcon: ({ color }) => <TabIcon symbol="◎" color={color} />,
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{
          title: "SESSIONS",
          tabBarIcon: ({ color }) => <TabIcon symbol="◈" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "PROFILE",
          tabBarIcon: ({ color }) => <TabIcon symbol="○" color={color} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ symbol, color }: { symbol: string; color: string }) {
  return <Text style={{ fontSize: 18, color, lineHeight: 22 }}>{symbol}</Text>;
}
