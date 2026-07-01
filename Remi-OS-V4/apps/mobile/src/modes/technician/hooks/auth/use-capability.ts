/**
 * LDM-WAVE-1 CHUNK-2 — Singular capability check.
 *
 * Thin wrapper over `useCapabilities()` that answers "does the current
 * user have this one capability?" with a plain `boolean`. Most call
 * sites only care about a single permission, and the boolean form
 * plays nicely with React's existing patterns:
 *
 *   const canReassign = useCapability("dispatch.reassign");
 *   return canReassign ? <ReassignButton /> : null;
 *
 * For declarative usage (and `mode="disable"` semantics), reach for
 * `<CanAccess capability="...">` in `@/src/components/shared/can-access`
 * instead — it composes this same `useCapabilities()` source under
 * the hood, just with a different ergonomic shape.
 *
 * Fail-closed contract:
 *   - While the capabilities query is loading (`isLoading`), return
 *     `false`. Buttons must not flash visible-then-hidden during the
 *     first render after login.
 *   - When the query errored (`isError`), return `false`. A failed
 *     `/auth/me/capabilities` call should not silently grant access.
 *   - When the capability set is defined but does not contain `cap`,
 *     return `false` (the normal "not granted" case).
 *
 * The contract intentionally swallows the distinction between
 * "loading" and "denied" at this boundary because every consumer in
 * the wave-1 spec treats both as "hide the control." Callers that
 * need a tri-state (loading / granted / denied) should drop down to
 * `useCapabilities()` directly.
 *
 * Spec: docs/implementation-plans/landscape-dispatch-map-wave-1.md
 *       §CHUNK-2 — Permissions wiring (FE half)
 */

import { useCapabilities } from "./use-capabilities";
import type { Capability } from "@technician/types/capabilities";

export function useCapability(cap: Capability): boolean {
  const { capabilities, isLoading, isError } = useCapabilities();

  if (isLoading || isError || !capabilities) {
    return false;
  }

  return capabilities.has(cap);
}
