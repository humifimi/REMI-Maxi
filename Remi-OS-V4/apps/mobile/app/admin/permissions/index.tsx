/**
 * LDM-WAVE-1 CHUNK-4 — Cross-franchise permissions admin (list).
 *
 * Default route under `/admin/permissions`. Entry from the More tab,
 * gated by `<CanAccess capability="perms.admin.global">`. Pre-check
 * via `useCapability` + redirect for defense in depth — a non-
 * franchisor or franchisor lacking the global cap shouldn't have seen
 * the entry point but the screen still bails to `/` if they reach it.
 *
 * Body is the shared `<PermissionsAdminScreen mode="cross-franchise">`
 * lifted out of CHUNK-3 during this chunk; the workspace switcher
 * (chip row of franchises + "All franchises") lives inside that
 * component and drives the local `selectedFranchiseId` state on this
 * screen. Tapping a user row routes to `/admin/permissions/[userId]?
 * franchiseId=<their-franchise>` — the franchiseId is forwarded so
 * the detail screen knows which franchise to query for the single-
 * user lookup.
 */

import { useEffect, useState } from "react";
import { Pressable } from "react-native";
import { Stack, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { PermissionsAdminScreen } from "@technician/components/franchise/permissions-admin-screen";
import { useAuthStore } from "@/src/stores/auth";

export default function AdminPermissionsListScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "administrator";

  // null = "all franchises" — the default view when entering the
  // cross-franchise admin. The workspace switcher updates this.
  const [selectedFranchiseId, setSelectedFranchiseId] = useState<number | null>(
    null
  );

  useEffect(() => {
    if (!isAdmin) {
      router.replace("/");
    }
  }, [isAdmin, router]);

  if (!isAdmin) return null;

  return (
    <>
      <Stack.Screen
        options={{
          title: "Cross-franchise permissions",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <MaterialIcons name="arrow-back" size={24} color="#fff" />
            </Pressable>
          ),
        }}
      />
      <PermissionsAdminScreen
        mode="cross-franchise"
        franchiseId={selectedFranchiseId}
        onFranchiseChange={setSelectedFranchiseId}
        onUserPress={(entry) =>
          router.push(
            // The detail screen needs franchiseId so it can query the
            // right franchise's user list when looking up just one user.
            `/admin/permissions/${entry.userId}?franchiseId=${entry.franchiseId}` as never
          )
        }
        testIDPrefix="admin-permissions"
      />
    </>
  );
}
