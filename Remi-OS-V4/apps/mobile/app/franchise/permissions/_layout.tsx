import { Stack } from "expo-router";

/**
 * LDM-WAVE-1 CHUNK-3 — Stack wrapper for the franchise permissions
 * admin screens. Provides the screen header (with the auto-rendered
 * back chevron) for both `index` and `[userId]`. Mirrors the visual
 * treatment of the existing `app/franchise/messages/_layout.tsx` so
 * the two FO admin surfaces feel like siblings.
 */
export default function FranchisePermissionsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#111827" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
        headerTitleAlign: "center",
        headerBackTitle: "Back",
      }}
    />
  );
}
