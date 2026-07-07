import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from "@expo-google-fonts/poppins";
import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from "@expo-google-fonts/bricolage-grotesque";
import { COLORS, FONTS } from "../src/theme";
import { AuthProvider } from "../src/context/AuthContext";
import { CreditProvider } from "../src/context/CreditContext";
import { CallProvider } from "../src/context/CallProvider";
import WelcomeCelebration from "../src/components/WelcomeCelebration";
import PushManager from "../src/components/PushManager";

// Each tab maps to an Ionicons glyph, swapping to the filled variant when active.
type IoniconName = React.ComponentProps<typeof Ionicons>["name"];
const TAB_ICON: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  index: { active: "sparkles", inactive: "sparkles-outline" },
  psychics: { active: "moon", inactive: "moon-outline" },
  sessions: { active: "chatbubbles", inactive: "chatbubbles-outline" },
  profile: { active: "person", inactive: "person-outline" },
};

export default function RootLayout() {
  // Load Poppins (body) + Bricolage Grotesque (headlines) before rendering so
  // fontFamily references resolve. If loading fails, `error` is set and we
  // still render (RN falls back to system font).
  const [loaded, error] = useFonts({
    Poppins_400Regular,
    Poppins_600SemiBold,
    Poppins_700Bold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
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
      <CreditProvider>
      <CallProvider>
      <Tabs
        screenOptions={{
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 85,
          paddingBottom: 20,
        },
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.textFaint,
        tabBarLabelStyle: {
          fontSize: 12,
          letterSpacing: 0.08,
          fontFamily: FONTS.regular,
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
      {/* One-time "£15 is waiting" moment for accounts with unspent credit. */}
      <WelcomeCelebration />
      {/* Push notifications: foreground suppression, token registration,
          tap-to-open-chat routing. Inert in Expo Go. */}
      <PushManager />
      </CallProvider>
      </CreditProvider>
    </AuthProvider>
  );
}
