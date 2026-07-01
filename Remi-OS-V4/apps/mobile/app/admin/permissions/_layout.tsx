/**
 * LDM-WAVE-1 CHUNK-4 — Stack wrapper for the franchisor cross-franchise
 * permissions admin. Mirrors `app/franchise/permissions/_layout.tsx`
 * so the back-button + dark header styling stays identical between the
 * two admin surfaces.
 */

import { Stack } from "expo-router";

export default function AdminPermissionsLayout() {
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
