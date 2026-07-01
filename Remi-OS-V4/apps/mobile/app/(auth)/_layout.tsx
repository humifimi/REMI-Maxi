import { useEffect } from "react";
import { Redirect, Stack } from "expo-router";
import { useAuthStore } from "@/src/stores/auth";
import { useAppModeStore, customerHomePath, technicianHomePath } from "@/src/stores/app-mode";
import { allowAllOrientations, lockToPortrait } from "@technician/utils/orientation";

/**
 * `(auth)` group layout.
 *
 * PR 2.5 (2026-04-24): the login screen is locked to portrait while
 * mounted. The app's global `app.json` `expo.orientation` is
 * `"default"` so the OS allows landscape — but the login screen has
 * no landscape layout (forms get marooned, the keyboard collides with
 * inputs). Locking on focus and re-allowing on unmount keeps the rest
 * of the app's per-screen orientation policy untouched.
 *
 * Resolves docs/FOUND-BUGS.md#2026-04-22-login-screen-rotates-to-landscape.
 */
export default function AuthLayout() {
  const { isAuthenticated, isHydrated } = useAuthStore();

  useEffect(() => {
    void lockToPortrait();
    return () => {
      void allowAllOrientations();
    };
  }, []);

  if (isHydrated && isAuthenticated) {
    const mode = useAppModeStore.getState().mode;
    return <Redirect href={mode === "customer" ? customerHomePath() : technicianHomePath()} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
    </Stack>
  );
}
