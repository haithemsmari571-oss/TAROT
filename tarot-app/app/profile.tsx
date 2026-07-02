import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../src/theme/colors";
import { useAuth } from "../src/context/AuthContext";

export default function ProfileScreen() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.lavender} />
      </View>
    );
  }

  return user ? <Account /> : <SignInForm />;
}

function Account() {
  const { user, signOut } = useAuth();
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <StatusBar style="light" />
      <View style={styles.accountContent}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={40} color={COLORS.lavender} />
        </View>
        <Text style={styles.username}>{user?.username}</Text>
        <Text style={styles.email}>{user?.email}</Text>

        <TouchableOpacity
          style={styles.signOutBtn}
          activeOpacity={0.85}
          onPress={signOut}
        >
          <Text style={styles.signOutText}>SIGN OUT</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function SignInForm() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        (err?.response?.status === 401 || err?.response?.status === 400
          ? "Incorrect email or password."
          : "Couldn't sign in. Check your connection and try again.");
      setError(typeof detail === "string" ? detail : "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SafeAreaView style={styles.root} edges={["top"]}>
        <StatusBar style="light" />
        <View style={styles.formContent}>
          <Text style={styles.title}>SIGN IN</Text>
          <Text style={styles.subtitle}>
            Sign in to start a reading with your psychic.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="rgba(255,255,255,0.3)"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
            editable={!submitting}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="rgba(255,255,255,0.3)"
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
            editable={!submitting}
            onSubmitEditing={onSubmit}
            returnKeyType="go"
          />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            activeOpacity={0.85}
            onPress={onSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>SIGN IN</Text>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: "center",
    justifyContent: "center",
  },
  // Sign-in form
  formContent: { flex: 1, justifyContent: "center", paddingHorizontal: 28 },
  title: {
    fontSize: 26,
    color: COLORS.text,
    letterSpacing: 1,
    fontFamily: "Poppins_700Bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textMuted,
    fontFamily: "Poppins_400Regular",
    marginBottom: 28,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.text,
    fontFamily: "Poppins_400Regular",
    marginBottom: 14,
  },
  error: {
    color: "#FF6B6B",
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    marginBottom: 12,
  },
  submitBtn: {
    backgroundColor: COLORS.purple,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 6,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: {
    color: "#fff",
    fontSize: 13,
    letterSpacing: 1.2,
    fontFamily: "Poppins_700Bold",
  },
  // Account view
  accountContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: "rgba(210,185,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  username: {
    fontSize: 20,
    color: COLORS.text,
    fontFamily: "Poppins_700Bold",
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontFamily: "Poppins_400Regular",
    marginBottom: 36,
  },
  signOutBtn: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 12,
  },
  signOutText: {
    color: COLORS.text,
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: "Poppins_700Bold",
  },
});
