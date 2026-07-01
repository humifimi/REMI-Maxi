/**
 * LDM-WAVE-1 CHUNK-3 / CHUNK-4 — Franchise-scoped permissions admin (wrapper).
 *
 * Default route under `/franchise/permissions`. Entry point from the
 * More tab (gated by `<CanAccess capability="perms.admin.franchise">`
 * — see `app/(tabs)/more.tsx`). On mount, double-checks the
 * capability via `useCapability` and redirects to `/` if absent
 * (defense in depth — a caller without the cap shouldn't have gotten
 * the entry point rendered to them).
 *
 * As of CHUNK-4 this screen is a THIN WRAPPER around the shared
 * `<PermissionsAdminScreen>` component (which also backs the
 * cross-franchise admin at `/admin/permissions/`). All list rendering,
 * search, and empty-state logic lives in the shared component; this
 * file handles the auth pre-check, mode wiring, and user-row tap
 * navigation back to the franchise namespace.
 *
 * Spec: docs/implementation-plans/landscape-dispatch-map-wave-1.md
 *       §CHUNK-3 (own-franchise) + §CHUNK-4 (component lift).
 */

import { useEffect } from "react";
import { Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useAuthStore } from "@/src/stores/auth";
import { PermissionsAdminScreen } from "@technician/components/franchise/permissions-admin-screen";

export default function FranchisePermissionsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "administrator";
  const franchiseId = user?.franchiseId ?? null;

  useEffect(() => {
    if (!isAdmin) {
      router.replace("/");
    }
  }, [isAdmin, router]);

  if (!isAdmin) {
    return null;
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "Permissions",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <PermissionsAdminScreen
        mode="own-franchise"
        franchiseId={franchiseId}
        onUserPress={(entry) =>
          router.push(`/franchise/permissions/${entry.userId}` as never)
        }
        testIDPrefix="permissions"
      />
    </>
  );
}
