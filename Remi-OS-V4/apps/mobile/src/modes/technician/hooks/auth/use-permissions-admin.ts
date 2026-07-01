/**
 * LDM-WAVE-1 CHUNK-3 — Hooks for the franchise-scoped capability override
 * admin surface (BE: `/api/v1/franchise/admin/...`).
 *
 * - `useFranchiseUsersWithCapabilities(franchiseId)` — paginated list,
 *   one entry per user with their three-bucket cap matrix.
 * - `useSetCapabilityOverride()` — mutation. Invalidates the admin list AND
 *   the target user's `["auth", "capabilities", userId]` cache so an admin
 *   editing their own caps sees the change immediately.
 * - `useRemoveCapabilityOverride()` — mutation, same invalidations as set.
 * - `useUserCapabilityAudit(userId)` — paginated per-user audit history.
 *
 * Spec: docs/implementation-plans/landscape-dispatch-map-wave-1.md
 *       §CHUNK-3 — Per-user capability override admin UI → "Behavior contract — FE"
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { adminApi, franchiseApi } from "@technician/api/client";
import { AdminEndpoints, FranchiseEndpoints } from "@technician/api/endpoints";
import type { Capability } from "@technician/types/capabilities";
import type {
  AdminFranchiseListResponse,
  AdminUserListResponse,
  CapabilityAuditResponse,
  CapabilityOverrideMode,
  PermissionsAdminMode,
  RemoveOverrideResponse,
  SetOverrideResponse,
} from "@technician/types/permissions-admin";

const ADMIN_USERS_KEY = "perms-admin-users";
const ADMIN_AUDIT_KEY = "perms-admin-audit";
// LDM-WAVE-1 CHUNK-4 — workspace-switcher cache key.
const ADMIN_FRANCHISES_KEY = "perms-admin-franchises";

// LDM-WAVE-1 CHUNK-4 ─────────────────────────────────────────────────────
// Helper: pick the right client + path for the current mode. Keeps the
// mode-switching logic in one place so the call sites in the public
// hooks below stay readable.

function fetchUsers(
  mode: PermissionsAdminMode,
  franchiseId: number | null | undefined,
  limit: number
): Promise<AdminUserListResponse> {
  if (mode === "own-franchise") {
    if (franchiseId == null) {
      // The own-franchise mode requires a franchiseId. Callers should
      // not enable the query without one (see `enabled` below); throwing
      // here keeps mistakes loud during development.
      return Promise.reject(
        new Error("own-franchise mode requires a franchiseId")
      );
    }
    return franchiseApi<AdminUserListResponse>(
      "get",
      FranchiseEndpoints.admin.users,
      { franchiseId: String(franchiseId), limit: String(limit) }
    );
  }
  // cross-franchise: franchiseId is optional. Null/undefined → all
  // franchises; specific id → server-side filter.
  const query: Record<string, string> = { limit: String(limit) };
  if (franchiseId != null) query.franchiseId = String(franchiseId);
  return adminApi<AdminUserListResponse>(
    "get",
    AdminEndpoints.permissions.users,
    query
  );
}

function setOverrideRequest(
  mode: PermissionsAdminMode,
  targetUserId: number,
  capability: Capability,
  body: { mode: CapabilityOverrideMode; reason: string | null }
): Promise<SetOverrideResponse> {
  if (mode === "own-franchise") {
    return franchiseApi<SetOverrideResponse>(
      "put",
      FranchiseEndpoints.admin.userCapability(targetUserId, capability),
      body
    );
  }
  return adminApi<SetOverrideResponse>(
    "put",
    AdminEndpoints.permissions.userCapability(targetUserId, capability),
    body
  );
}

function removeOverrideRequest(
  mode: PermissionsAdminMode,
  targetUserId: number,
  capability: Capability,
  body: { reason: string | null }
): Promise<RemoveOverrideResponse> {
  if (mode === "own-franchise") {
    return franchiseApi<RemoveOverrideResponse>(
      "delete",
      FranchiseEndpoints.admin.userCapability(targetUserId, capability),
      body
    );
  }
  return adminApi<RemoveOverrideResponse>(
    "delete",
    AdminEndpoints.permissions.userCapability(targetUserId, capability),
    body
  );
}

function fetchUserAudit(
  mode: PermissionsAdminMode,
  userId: number,
  limit: number
): Promise<CapabilityAuditResponse> {
  if (mode === "own-franchise") {
    return franchiseApi<CapabilityAuditResponse>(
      "get",
      FranchiseEndpoints.admin.userAudit(userId),
      { limit: String(limit) }
    );
  }
  return adminApi<CapabilityAuditResponse>(
    "get",
    AdminEndpoints.permissions.userAudit(userId),
    { limit: String(limit) }
  );
}

// LDM-WAVE-1 CHUNK-4 — hooks now accept an explicit `mode` so the same
// hook backs both the franchise-scoped CHUNK-3 screen and the cross-
// franchise CHUNK-4 screen. CHUNK-3 callers either pass `mode:
// 'own-franchise'` explicitly or rely on the default (kept backward-
// compatible). Query keys include the mode AND franchiseId so the
// two surfaces don't collide in TanStack Query's cache.

interface UseUsersArgs {
  mode?: PermissionsAdminMode;
  /**
   * Required when mode is 'own-franchise'. Optional when
   * 'cross-franchise' — null/undefined means "all franchises".
   */
  franchiseId?: number | null;
  limit?: number;
}

export function useFranchiseUsersWithCapabilities(
  franchiseIdOrArgs: number | undefined | UseUsersArgs,
  legacyOptions?: { limit?: number }
) {
  // Back-compat: original CHUNK-3 signature was
  // `useFranchiseUsersWithCapabilities(franchiseId, { limit })`. Detect
  // and normalize. New callers pass a single args object.
  const args: UseUsersArgs =
    typeof franchiseIdOrArgs === "object" && franchiseIdOrArgs !== null
      ? franchiseIdOrArgs
      : {
          mode: "own-franchise",
          franchiseId: franchiseIdOrArgs ?? null,
          limit: legacyOptions?.limit,
        };

  const mode: PermissionsAdminMode = args.mode ?? "own-franchise";
  const limit = args.limit ?? 50;
  const franchiseId = args.franchiseId ?? null;

  // Cache-key shape — mode FIRST so cross-franchise / own-franchise
  // never share a slot. franchiseId NEXT so switching workspaces in the
  // cross-franchise switcher doesn't stomp the previous list.
  const queryKey = [ADMIN_USERS_KEY, mode, franchiseId, limit] as const;

  return useQuery({
    queryKey,
    queryFn: () => fetchUsers(mode, franchiseId, limit),
    // own-franchise mode needs a real franchiseId; cross-franchise mode
    // can run with a null franchiseId (= all franchises view).
    enabled:
      mode === "cross-franchise" || (franchiseId !== null && franchiseId > 0),
    staleTime: 30_000,
  });
}

interface SetOverrideArgs {
  targetUserId: number;
  capability: Capability;
  mode: CapabilityOverrideMode;
  reason?: string | null;
  /**
   * LDM-WAVE-1 CHUNK-4 — surface the override lives on. Defaults to
   * the franchise-scoped endpoint (CHUNK-3 caller) so existing call
   * sites are unaffected.
   */
  adminMode?: PermissionsAdminMode;
}

export function useSetCapabilityOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: SetOverrideArgs): Promise<SetOverrideResponse> => {
      const adminMode: PermissionsAdminMode = args.adminMode ?? "own-franchise";
      return setOverrideRequest(adminMode, args.targetUserId, args.capability, {
        mode: args.mode,
        reason: args.reason ?? null,
      });
    },
    onSuccess: (_data, args) => {
      // Invalidate BOTH modes' user lists — the same override flips the
      // user's capability matrix in either surface, and the
      // franchisor's own-franchise view should reflect a cross-franchise
      // grant they just made.
      queryClient.invalidateQueries({ queryKey: [ADMIN_USERS_KEY] });
      queryClient.invalidateQueries({
        queryKey: [ADMIN_AUDIT_KEY, args.targetUserId],
      });
      queryClient.invalidateQueries({
        queryKey: ["auth", "capabilities", args.targetUserId],
      });
    },
  });
}

interface RemoveOverrideArgs {
  targetUserId: number;
  capability: Capability;
  reason?: string | null;
  /** LDM-WAVE-1 CHUNK-4 — see `SetOverrideArgs.adminMode`. */
  adminMode?: PermissionsAdminMode;
}

export function useRemoveCapabilityOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      args: RemoveOverrideArgs
    ): Promise<RemoveOverrideResponse> => {
      const adminMode: PermissionsAdminMode = args.adminMode ?? "own-franchise";
      return removeOverrideRequest(
        adminMode,
        args.targetUserId,
        args.capability,
        { reason: args.reason ?? null }
      );
    },
    onSuccess: (_data, args) => {
      queryClient.invalidateQueries({ queryKey: [ADMIN_USERS_KEY] });
      queryClient.invalidateQueries({
        queryKey: [ADMIN_AUDIT_KEY, args.targetUserId],
      });
      queryClient.invalidateQueries({
        queryKey: ["auth", "capabilities", args.targetUserId],
      });
    },
  });
}

interface UseAuditArgs {
  userId: number | undefined;
  mode?: PermissionsAdminMode;
  limit?: number;
}

export function useUserCapabilityAudit(
  userIdOrArgs: number | undefined | UseAuditArgs,
  legacyOptions?: { limit?: number }
) {
  const args: UseAuditArgs =
    typeof userIdOrArgs === "object" && userIdOrArgs !== null
      ? userIdOrArgs
      : {
          userId: userIdOrArgs,
          mode: "own-franchise",
          limit: legacyOptions?.limit,
        };

  const mode: PermissionsAdminMode = args.mode ?? "own-franchise";
  const limit = args.limit ?? 25;

  return useQuery({
    queryKey: [ADMIN_AUDIT_KEY, args.userId, mode, limit] as const,
    queryFn: () =>
      fetchUserAudit(mode, args.userId as number, limit),
    enabled: args.userId !== undefined && args.userId > 0,
    staleTime: 30_000,
  });
}

// LDM-WAVE-1 CHUNK-4 ─────────────────────────────────────────────────────
// Workspace-switcher data source. Drives the FranchiseWorkspaceSwitcher
// on the cross-franchise admin screen. Cached on its own key because
// the list is independent of which workspace is currently selected.

export function useAdminFranchiseList(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [ADMIN_FRANCHISES_KEY] as const,
    queryFn: () =>
      adminApi<AdminFranchiseListResponse>(
        "get",
        AdminEndpoints.permissions.franchises
      ),
    enabled: options?.enabled ?? true,
    // Franchise list rarely changes within a session; 5 minutes is
    // plenty and keeps the switcher snappy on workspace toggles.
    staleTime: 5 * 60_000,
  });
}
