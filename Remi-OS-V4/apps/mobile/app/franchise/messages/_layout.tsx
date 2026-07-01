import { Stack } from "expo-router";

/**
 * MSG-FE-FO-1 — Franchise Owner messaging-oversight stack.
 * Mirrors the visual treatment of the technician-side
 * `app/message/_layout.tsx` so the two surfaces feel like
 * siblings; the franchise stack uses `/franchise/messages/*`
 * routes and is reachable only via the More-menu entry that's
 * gated on `user?.role === 'franchise_owner'`.
 */
export default function FranchiseMessagesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#111827" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
        headerTitleAlign: "center",
      }}
    />
  );
}
