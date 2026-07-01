/**
 * LDM-WAVE-1 CHUNK-2 — Capability identifiers (FE mirror of the BE source of truth).
 *
 * This file MIRRORS `REMIBackend/src/models/capabilities.ts`. The BE owns the
 * canonical list (the DB has a `capabilities` table seeded by
 * `REMIBackend/db/migrations/20260515150000_perms_capabilities.ts` and the
 * TS-level union there is the contract that the resolver service and
 * `requireCapability` middleware enforce). The FE keeps a duplicate of the
 * string-literal union because:
 *
 *   1. The list is small and changes infrequently — the cost of mirroring is
 *      lower than the cost of generating it at build time.
 *   2. Tests and component props need a closed union at compile time, before
 *      the app ever calls `GET /auth/me/capabilities`.
 *   3. The `<CanAccess capability="...">` component should refuse to type-check
 *      typos at call sites.
 *
 * Update protocol when adding a capability:
 *
 *   1. Edit `REMIBackend/src/models/capabilities.ts` AND this file in the same
 *      change. Both string-literal unions must match exactly.
 *   2. Add the row in the BE's `db/migrations/...` capability migration (or a
 *      new migration if the original one already shipped).
 *   3. If the new cap should be granted to any role by default, update the
 *      role-default matrix in `REMIBackend/src/db/seeds/009_perms_role_capabilities.ts`.
 *
 * Spec: docs/implementation-plans/landscape-dispatch-map-wave-1.md
 *       §CHUNK-2 — Permissions wiring (FE half)
 */

export const CAPABILITIES = [
  "dispatch.view",
  "dispatch.reassign",
  "dispatch.override",
  "dispatch.delay_reoptimize",
  "dispatch.cap_admin",

  "routes.view",
  "routes.optimize.auto",
  "routes.optimize.manual",
  "routes.stop_reorder",

  "calendar.view",
  "calendar.create",
  "calendar.reschedule",
  "calendar.cancel",

  "customer.view",
  "customer.create",
  "customer.intake.auto",

  "ai.copilot.use",
  "ai.providers.admin",

  "franchise.admin",
  "franchise.financials.view",

  "perms.admin.franchise",
  "perms.admin.global",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/**
 * Runtime type guard for validating capability strings received from the BE
 * (`GET /auth/me/capabilities` returns `string[]`; this narrows it to the
 * closed union for downstream `Set<Capability>` storage).
 */
export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}
