/**
 * Route: `/settings/reorganization-policy` (P7-FE-1).
 *
 * Thin Expo Router wrapper around the screen at
 * `src/screens/settings/ReorganizationPolicyScreen.tsx` (placed
 * there per the chunk prompt). The wrapper exists so the route
 * surface stays in `app/` per the project's Expo Router convention
 * while the screen body lives in `src/screens/` for testability and
 * to match the prompt-specified path.
 *
 * The route is FO-only — non-FO users land here only via deep link
 * (e.g. an old push notification). Render a friendly redirect-style
 * empty state so we don't leak the policy editor to a technician
 * role. The settings list itself only surfaces this entry to FO
 * users (`app/settings.tsx`), so the typical user never sees the
 * non-FO branch.
 */

import { Stack, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ReorganizationPolicyScreen } from "@technician/screens/settings/ReorganizationPolicyScreen";
import { useAuthStore } from "@/src/stores/auth";
import { UserRole } from "@technician/types/enums";

export default function ReorganizationPolicyRoute() {
  const role = useAuthStore((s) => s.user?.role ?? null);
  const isFranchiseOwner =
    role === UserRole.FRANCHISE_OWNER || role === UserRole.FRANCHISOR;

  if (!isFranchiseOwner) {
    return <NonFranchiseOwnerFallback />;
  }
  return <ReorganizationPolicyScreen />;
}

function NonFranchiseOwnerFallback() {
  const router = useRouter();
  return (
    <View
      style={styles.fallbackContainer}
      testID="reorganization-policy-fo-only"
    >
      <Stack.Screen options={{ title: "Reorganization policy" }} />
      <View style={styles.fallbackCard}>
        <Text style={styles.fallbackTitle}>Franchise owner only</Text>
        <Text style={styles.fallbackBody}>
          Only franchise owners can edit the reorganization policy. If you
          think this is a mistake, ask your franchise owner to update your
          access.
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.fallbackBtn,
            pressed && styles.fallbackBtnPressed,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.fallbackBtnText}>Go back</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fallbackContainer: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  fallbackCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 24,
    gap: 12,
    alignItems: "center",
    maxWidth: 480,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  fallbackTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  fallbackBody: {
    fontSize: 14,
    color: "#4B5563",
    textAlign: "center",
    lineHeight: 20,
  },
  fallbackBtn: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: "#111827",
  },
  fallbackBtnPressed: {
    opacity: 0.85,
  },
  fallbackBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
});
