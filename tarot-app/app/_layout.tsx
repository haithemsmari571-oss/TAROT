import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import { COLORS } from "../src/theme/colors";
import { AuthProvider } from "../src/context/AuthContext";
import { CallProvider } from "../src/context/CallProvider";

// Each tab maps to an Ionicons glyph, swapping to the filled variant when active.
type IoniconName = React.ComponentProps<typeof Ionicons>["name"];
const TAB_ICON: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  index: { active: "sparkles", inactive: "sparkles-outline" },
  psychics: { active: "moon", inactive: "moon-outline" },
  sessions: { active: "chatbubbles", inactive: "chatbubbles-outline" },
  profile: { active: "person", inactive: "person-outline" },
};

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

  const icon =
    (name: keyof typeof TAB_ICON) =>
    ({ color, focused }: { color: ColorValue; focused: boolean }) => (
      <Ionicons
        name={focused ? TAB_ICON[name].active : TAB_ICON[name].inactive}
        size={22}
        color={color}
      />
    );

  return (
    <AuthProvider>
      <CallProvider>
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
        options={{ title: "SANCTUARY", tabBarIcon: icon("index") }}
      />
      <Tabs.Screen
        name="psychics"
        options={{ title: "PSYCHICS", tabBarIcon: icon("psychics") }}
      />
      <Tabs.Screen
        name="sessions"
        options={{ title: "SESSIONS", tabBarIcon: icon("sessions") }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "PROFILE", tabBarIcon: icon("profile") }}
      />
      {/* Reachable via router.push("/signup"); hidden from the tab bar. */}
      <Tabs.Screen name="signup" options={{ href: null }} />
      {/* Reachable via router.push("/stardust"); hidden from the tab bar. */}
      <Tabs.Screen name="stardust" options={{ href: null }} />
      </Tabs>
      </CallProvider>
    </AuthProvider>
  );
}
