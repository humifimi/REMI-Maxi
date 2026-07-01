/**
 * LDM-WAVE-1 CHUNK-3 — Wire-format types for the permissions admin
 * surface (BE: `GET /api/v1/franchise/admin/users` and friends).
 *
 * Mirrors the response shape declared in
 * `REMIBackend/src/services/auth/permissions.service.ts`
 * (AdminUserCapabilitySummary, FranchiseMemberListResult,
 *  SetOverrideResult, RemoveOverrideResult, CapabilityAuditEntry).
 *
 * Spec: docs/implementation-plans/landscape-dispatch-map-wave-1.md
 *       §CHUNK-3 — Per-user capability override admin UI → "Endpoint contract"
 */

import type { Capability } from "./capabilities";

export type CapabilityOverrideMode = "grant" | "deny";
export type CapabilityAuditAction = CapabilityOverrideMode | "clear";

export interface AdminUserCapabilitySummary {
  userId: number;
  fullName: string;
  email: string;
  role: string;
  franchiseId: number | null;
  capabilities: {
    fromRole: Capability[];
    grantedByOverride: Capability[];
    deniedByOverride: Capability[];
  };
}

export interface AdminUserListResponse {
  users: AdminUserCapabilitySummary[];
  nextCursor: string | null;
}

export interface SetOverrideResponse {
  override: {
    id: number;
    userId: number;
    capability: Capability;
    mode: CapabilityOverrideMode;
    grantedBy: number | null;
    reason: string | null;
    createdAt: string;
  };
  audit: { id: number; createdAt: string };
}

export interface RemoveOverrideResponse {
  cleared: boolean;
  audit: { id: number; createdAt: string } | null;
}

export interface CapabilityAuditEntry {
  id: number;
  target_user_id: number;
  capability: Capability;
  action: CapabilityAuditAction;
  actor_user_id: number;
  actor_name: string | null;
  reason: string | null;
  franchise_id: number;
  created_at: string;
  /**
   * LDM-WAVE-1 CHUNK-4: present on entries returned by the admin
   * (cross-franchise) audit endpoint, absent on the franchise-scoped
   * CHUNK-3 endpoint. Optional so both consumers share a single type.
   */
  franchise_name?: string | null;
}

export interface CapabilityAuditResponse {
  entries: CapabilityAuditEntry[];
  nextCursor: string | null;
}

// LDM-WAVE-1 CHUNK-4 ─────────────────────────────────────────────────────
// Cross-franchise admin shapes. The wire shape of an admin user list
// entry is the same as `AdminUserCapabilitySummary` plus a guaranteed
// (non-null) `franchiseId` — but we reuse the same TypeScript type to
// avoid duplication; the BE filters out users without franchiseId at
// the service boundary.

export interface AdminFranchiseEntry {
  franchiseId: number;
  name: string;
  userCount: number;
  /** ISO string; null when the franchise has no audit history yet. */
  lastActivityAt: string | null;
}

export interface AdminFranchiseListResponse {
  franchises: AdminFranchiseEntry[];
}

/**
 * Mode selector for the shared `<PermissionsAdminScreen>` and its
 * hooks. `own-franchise` routes against the CHUNK-3 franchise endpoints
 * (`/api/v1/franchise/admin/...`); `cross-franchise` routes against
 * the CHUNK-4 admin endpoints (`/api/v1/admin/permissions/...`).
 */
export type PermissionsAdminMode = "own-franchise" | "cross-franchise";
