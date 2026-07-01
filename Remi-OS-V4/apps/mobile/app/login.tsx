import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRouter } from "expo-router";
import { Brand } from "@technician/constants/brand";
import { useUnifiedLogin } from "@/src/hooks/use-unified-login";
import {
  useAppModeStore,
  customerHomePath,
  technicianHomePath,
} from "@/src/stores/app-mode";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

/** Unified login for every role — routes by API `appMode`. */
export default function UnifiedLoginScreen() {
  const router = useRouter();
  const login = useUnifiedLogin();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const { control, handleSubmit } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = (values: LoginForm) => {
    setServerError(null);
    login.mutate(values, {
      onSuccess: async (data) => {
        const mode = data.user.appMode ?? useAppModeStore.getState().mode;
        router.replace(
          mode === "customer" ? customerHomePath() : technicianHomePath()
        );
      },
      onError: (err) => {
        setServerError(
          err instanceof Error ? err.message : "Sign in failed. Try again."
        );
      },
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.brand}>{Brand.appName}</Text>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>
            {/* One account for all the users. */}
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value }, fieldState }) => (
                <>
                  <TextInput
                    style={[styles.input, fieldState.error && styles.inputError]}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    placeholder="you@example.com"
                    placeholderTextColor="#9CA3AF"
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                  />
                  {fieldState.error ? (
                    <Text style={styles.fieldError}>{fieldState.error.message}</Text>
                  ) : null}
                </>
              )}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value }, fieldState }) => (
                <>
                  <View style={styles.passwordRow}>
                    <TextInput
                      style={[
                        styles.input,
                        styles.passwordInput,
                        fieldState.error && styles.inputError,
                      ]}
                      secureTextEntry={!showPassword}
                      autoComplete="password"
                      placeholder="Password"
                      placeholderTextColor="#9CA3AF"
                      value={value}
                      onBlur={onBlur}
                      onChangeText={onChange}
                    />
                    <Pressable
                      onPress={() => setShowPassword((v) => !v)}
                      style={styles.eyeBtn}
                      hitSlop={8}
                    >
                      <MaterialIcons
                        name={showPassword ? "visibility-off" : "visibility"}
                        size={22}
                        color="#6B7280"
                      />
                    </Pressable>
                  </View>
                  {fieldState.error ? (
                    <Text style={styles.fieldError}>{fieldState.error.message}</Text>
                  ) : null}
                </>
              )}
            />
          </View>

          {serverError ? <Text style={styles.serverError}>{serverError}</Text> : null}

          <Pressable
            style={[styles.primaryBtn, login.isPending && styles.primaryBtnDisabled]}
            onPress={handleSubmit(onSubmit)}
            disabled={login.isPending}
          >
            {login.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Sign In</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#111827" },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    justifyContent: "center",
  },
  brand: {
    fontSize: 14,
    fontWeight: "700",
    color: "#60A5FA",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: "#F9FAFB",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#9CA3AF",
    lineHeight: 22,
    marginBottom: 28,
  },
  field: { marginBottom: 16 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#D1D5DB",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: "#F9FAFB",
  },
  inputError: { borderColor: "#F87171" },
  passwordRow: { position: "relative" },
  passwordInput: { paddingRight: 48 },
  eyeBtn: { position: "absolute", right: 12, top: 14 },
  fieldError: { color: "#F87171", fontSize: 12, marginTop: 4 },
  serverError: {
    color: "#FCA5A5",
    textAlign: "center",
    marginBottom: 12,
    fontSize: 14,
  },
  primaryBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
});
