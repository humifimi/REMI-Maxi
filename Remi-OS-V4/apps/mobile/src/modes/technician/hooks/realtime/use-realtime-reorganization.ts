/**
 * `useRealtimeReorganization` (P6-FE-1, FE-G14) — TanStack-Query-aware
 * realtime hook that subscribes to the per-franchise reorganization
 * channel and converts BE-emitted lifecycle events into TanStack
 * Query cache invalidations for the consumers downstream of this
 * subscription (calendar canvas, future
 * `useFranchisePendingReorganizations`, review screen
 * `useReorganizationSession(id)`, mount-time
 * `useActiveReorganization`).
 *
 * **The router does NOT mutate `usePendingRealityStore` directly.**
 * Local-store reconciliation flows exclusively through
 * `reconcileActiveSession`, which runs inside the queryFns of the
 * two hooks above after they refetch in response to invalidation.
 * This is the load-bearing post-2026-05-08 invariant — see the
 * function-level JSDoc on `handleReorganizationEvent` below for
 * the full rationale and the regression history that established
 * the rule. Any contributor who wants to write to
 * `usePendingRealityStore` from a realtime event MUST instead
 * invalidate the right query key and let the reconciler decide
 * what to do based on the BE-canonical answer.
 *
 * Owning section in master plan: §5.3.2 (FE-G14). Subscription
 * envelope and channel naming come from §6.6.3 — the BE forwards the
 * raw envelope without wrapping it in a `type` field, so the dispatch
 * keys off `event` instead.
 *
 * Mounted from `app/(tabs)/_layout.tsx` so the subscription is alive
 * for the whole authenticated tabs region (not just the calendar
 * canvas) — this keeps the cache warm for the review screen and the
 * Pending Reality HUD even while the user has another tab focused.
 *
 * PLAN-DEVIATION: 2026-04-24-realtime-reorg-be-shape — the §8.x
 * Prompt C.10 chunk-prompt's event table assumes intent-level events
 * and a `setSession(event.session)` payload that the BE does not
 * actually emit. This file follows the §6.6.3 contract instead. See
 * docs/PLAN-DEVIATIONS.md#2026-04-24-realtime-reorg-be-shape for the
 * full rationale and event-by-event mapping.
 */

import { useCallback, useMemo } from "react";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";

import { useAuthStore } from "@/src/stores/auth";
import { calendarKeys } from "@technician/hooks/schedule/use-calendar";

import {
  type RealtimeChannelHandle,
  useRealtimeChannel,
} from "./use-realtime-channel";

/**
 * §6.6.3 envelope, narrowed to the fields this hook reads. The full
 * shape also includes `channel`, `actor_user_id`, and `ts` — those are
 * intentionally omitted from the parser so adding new fields BE-side
 * does not break the FE.
 */
export interface ReorganizationRealtimeEvent {
  /**
   * Maps to the `reorganization_audit_action` enum BE-side. The
   * concrete values P6-BE-6 emits on the franchise channel today
   * are exported below as `KNOWN_REORG_EVENTS`.
   */
  event: string;
  session_id: number;
  /**
   * §6.6.3 "slim session view." Intentionally not the full
   * `ReorganizationSession` row — passing it to
   * `usePendingRealityStore.setSession()` would corrupt the store
   * because the slim view is missing `franchise_id`, `created_by`,
   * `requires_authorizer_role`, the policy snapshot, etc.
   *
   * This is why the event handler never calls `setSession(event.X)`
   * — it invalidates the relevant query so the
   * `useReorganizationSession(id)` consumer refetches the
   * authoritative row, which then writes the store via its own
   * `onSuccess` branch.
   */
  session_summary?: {
    id: number;
    source: string;
    status: string;
    intent_count: number;
  };
}

/**
 * Concrete event values P6-BE-6's `publishSessionEvent` emits on
 * `franchise:{id}:reorganization` today (REMIBackend
 * `src/services/reorganizationService.ts:1690-1747`):
 *
 *   - `session_created`        — author opened a draft
 *   - `session_finalized`      — author moved draft → pending_review
 *   - `session_committed`      — atomic apply succeeded
 *   - `session_failed`         — atomic apply rolled back
 *   - `session_cancelled`      — author or authorizer cancelled
 *   - `authorization_granted`  — required authorizer approved
 *   - `authorization_denied`   — required authorizer denied
 *   - `session_expired`        — TTL cron set status=expired
 *                                (audit enum is shipped; cron land in
 *                                a follow-up — handled defensively)
 *
 * Events the chunk-prompt mentioned that the BE does NOT emit on this
 * channel: `session_updated`, `intent_added`, `intent_removed`,
 * `intent_modified`, `intent_committed`. See PLAN-DEVIATION above.
 */
export const KNOWN_REORG_EVENTS = [
  "session_created",
  "session_finalized",
  "session_committed",
  "session_failed",
  "session_cancelled",
  "authorization_granted",
  "authorization_denied",
  "session_expired",
] as const;
export type KnownReorgEvent = (typeof KNOWN_REORG_EVENTS)[number];

function isReorganizationEvent(
  payload: unknown,
): payload is ReorganizationRealtimeEvent {
  if (typeof payload !== "object" || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return typeof p.event === "string" && typeof p.session_id === "number";
}

/**
 * Reusable invalidation block — exported so unit tests can assert it
 * was hit, and so a hypothetical session-channel hook (`P6-FE-2` if
 * it ever lands) can reuse the same key set without re-deriving.
 *
 * Notes on the chosen keys:
 *
 * - `["reorganizations"]` is the hierarchical root for both the
 *   franchise-pending-list query (`useFranchisePendingReorganizations`,
 *   not yet shipped) and the per-session detail query
 *   (`useReorganizationSession(id)`, ditto). Per §1.2.5 / TanStack's
 *   prefix-match invalidation, invalidating `["reorganizations"]`
 *   covers both children — but we ALSO emit the more specific
 *   `["reorganizations", "session", sessionId]` form so a future
 *   sibling that shipped its own narrower query key list can opt
 *   into a single-row refetch.
 * - `calendarKeys.all` covers both appointments and personal events
 *   (they're co-keyed under `["calendar", ...]` per
 *   `src/hooks/schedule/use-calendar.ts:18-27` and
 *   `use-personal-events.ts`). The chunk-prompt called these out as
 *   `["appointments"]` and `["personal-events"]`; the shipped
 *   namespace is `["calendar", ...]`.
 */
export function invalidateReorganizationKeys(
  queryClient: QueryClient,
  opts: { sessionId?: number; alsoCalendar?: boolean },
): void {
  queryClient.invalidateQueries({ queryKey: ["reorganizations"] });
  if (opts.sessionId != null) {
    queryClient.invalidateQueries({
      queryKey: ["reorganizations", "session", opts.sessionId],
    });
  }
  if (opts.alsoCalendar) {
    queryClient.invalidateQueries({ queryKey: calendarKeys.all });
  }
}

/**
 * Wire the franchise reorganization channel. No-op when no franchise
 * id is available (logged out / hydrating), per §6.6.4 fail-soft.
 *
 * The hook is render-side-effect-free except for `useRealtimeChannel`'s
 * internal `connected` boolean, which we expose for debug surfaces but
 * domain code should NOT gate on (caches refetch on reconnect).
 */
export function useRealtimeReorganization(): RealtimeChannelHandle {
  const queryClient = useQueryClient();
  const franchiseId = useAuthStore((s) => s.user?.franchiseId ?? null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const channel = useMemo(() => {
    if (!isAuthenticated || franchiseId == null) return null;
    return `franchise:${franchiseId}:reorganization`;
  }, [isAuthenticated, franchiseId]);

  const onMessage = useCallback(
    (payload: unknown) => {
      if (!isReorganizationEvent(payload)) return;
      handleReorganizationEvent(payload, queryClient);
    },
    [queryClient],
  );

  return useRealtimeChannel({ channel, onMessage });
}

/**
 * Pure event router. Exported for unit tests so they can drive the
 * dispatch directly without spinning up a `WebSocket`. The hook above
 * is just the (channel, store-readers, queryClient) wiring.
 *
 * # 2026-05-08 follow-up — realtime never mutates the local store
 *
 * Earlier passes (originally P6-FE-1, then PR #100's hardening of
 * the same pattern) tried to gate a direct `usePendingRealityStore.
 * getState().clear()` call on `event.session_id === store.sessionId`.
 * That gate was structurally wrong: the BE legitimately broadcasts
 * `session_created` (and `intent_added` shapes the BE may emit in
 * future passes — see `KNOWN_REORG_EVENTS`) for the user's OWN
 * just-staged session. A sessionId-match gate cannot tell those
 * apart from a real cancel/commit echo, so the gate happily admitted
 * the user's own session events and `clear()` wiped the freshly-
 * staged session ~1s after the ghost landed. The user reported the
 * regression three times across PR #98 / #99 / #100 with the same
 * symptom and the same `clear()` stack-trace pinning the realtime
 * call site.
 *
 * The fix this pass ships: **realtime never calls
 * `usePendingRealityStore.clear()` (or any other store action).**
 * Every terminal-state branch invalidates the relevant TanStack
 * Query keys instead and lets `reconcileActiveSession` (running
 * inside `useActiveReorganization` and `useReorganizationSession`'s
 * queryFns after the refetch) decide whether the local store
 * should be mutated. The reconciler reads the BE-canonical answer
 * and either:
 *
 *   - clears the store (BE says no active session) — the only
 *     authoritative way to know the local draft is dead.
 *   - calls `setSession(session, intents)` (BE says session
 *     still alive) — the same path used by mutation hooks.
 *   - no-ops (local already matches the BE state).
 *
 * Cache writes are still allowed in this router (they're how the
 * franchise list stays correct; they don't mutate the local
 * `usePendingRealityStore`). Only the store-mutating paths have to
 * go.
 *
 * See `usePendingRealityStore.clear`'s JSDoc for the catalog of
 * sanctioned auto-clear sites today, and
 * `docs/PLAN-DEVIATIONS.md#2026-05-08-cancel-hook-no-auto-coord`
 * for the full regression history (cancel-mutation arm, then
 * realtime-arm guard, then this final realtime-no-store-mutation
 * pass that retired the guard altogether).
 *
 * Anti-instructions (load-bearing):
 *
 *   - Do NOT re-introduce `usePendingRealityStore.getState().clear()`
 *     (or `setSession`, `addIntent`, etc.) from inside any case in
 *     this switch. The reconciler is the only sanctioned consumer
 *     of the BE-canonical answer; the realtime layer's job ends at
 *     query-cache invalidation.
 *   - Do NOT add a new "if event matches active session, clear local"
 *     gate in any future terminal-state branch (`session_aborted`,
 *     etc.). The gate cannot distinguish the user's own session
 *     events from a real terminal echo, so it's structurally unable
 *     to do what callers think it does.
 *   - Cache writes (e.g. `cacheReorganizationResult(queryClient,
 *     fid, null)`) ARE allowed here — they don't mutate the local
 *     store. This file does not currently use them; if a future
 *     pass needs to seed the active-session cache from a realtime
 *     event, that's fine.
 */
export function handleReorganizationEvent(
  event: ReorganizationRealtimeEvent,
  queryClient: QueryClient,
): void {
  switch (event.event) {
    case "session_created":
      // A brand-new session in this franchise — refresh the
      // franchise list. Active-session coordination is a refetch
      // path (per the file-level invariant): if this is the user's
      // own just-staged session, `useActiveReorganization` will
      // refetch and `reconcileActiveSession` will see the same id
      // already in the store and no-op. If the BE returns a
      // different session (or null), the reconciler handles the
      // eviction / clear path.
      invalidateReorganizationKeys(queryClient, {});
      return;

    case "session_finalized":
    case "authorization_granted":
    case "authorization_denied":
      // Status changed but session is still alive. Invalidate so
      // the detail-row + active-session refetches pick up the new
      // status and (for `session_finalized`) the policy snapshot.
      // The reconciler writes the authoritative row.
      invalidateReorganizationKeys(queryClient, {
        sessionId: event.session_id,
      });
      return;

    case "session_committed":
      // Atomic apply succeeded — appointments and personal events
      // changed in the world. Invalidate the active-session +
      // session-detail + calendar caches; if this was the user's
      // active draft, the BE will return null on the active-
      // session refetch and `reconcileActiveSession(null)` clears
      // local. If the user has already moved on to a fresh session,
      // the BE returns the fresh row and reconcile is a no-op /
      // refresh.
      invalidateReorganizationKeys(queryClient, {
        sessionId: event.session_id,
        alsoCalendar: true,
      });
      return;

    case "session_cancelled":
    case "session_expired":
      // Terminal non-success states. Same reconcile-via-refetch
      // contract as `session_committed` but no calendar refetch —
      // the world did not change.
      invalidateReorganizationKeys(queryClient, {
        sessionId: event.session_id,
      });
      return;

    case "session_failed":
      // Atomic apply rolled back; status is `failed`. The session
      // is still in the DB and the author may retry. Refetch so
      // the review screen surfaces the failure cards. The session
      // is still alive, so reconcile is a refresh — no clear path.
      invalidateReorganizationKeys(queryClient, {
        sessionId: event.session_id,
      });
      return;

    default:
      // Unknown event — could be a new BE-side action that hasn't
      // been handled here yet. Be permissive: invalidate the
      // franchise list so the cache stays correct, but do not
      // touch the store directly. Intentional no `console.warn`
      // per §6.6.4 fail-soft.
      invalidateReorganizationKeys(queryClient, {});
      return;
  }
}
