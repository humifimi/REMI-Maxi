/**
 * `useRealtimeCustomerReorganization` (P6-CU-1, CU-G5) — TanStack-
 * Query-aware realtime hook that subscribes to the customer's per-user
 * reorganization channel (`customer:{userId}:reorganization`) and turns
 * each BE-emitted lifecycle event into the right query invalidations so
 * the inbox + Home-tab badge + per-session action sheet + appointments
 * list all stay in sync with FO / Tech / AI activity.
 *
 * Owning section in master plan: Part 5 §5.4.8 (the §5.4.7 referenced
 * in the chunk-prompt body is the re-pointed reschedule modals chunk;
 * §5.4.8 is the customer realtime hook itself). BE channel naming and
 * payload shape live in §6.6.1 / §6.6.3.
 *
 * Mounted from the root layout (`app/_layout.tsx`) so the subscription
 * is alive for any authenticated screen — the Home-tab badge can be
 * visible from any tab and the inbox modal can be opened from anywhere.
 *
 * The shape of this file mirrors REMITechnician's `useRealtimeReorganization`
 * (`/Users/jacegalloway/Documents/codebases/REMITechnician/src/hooks/realtime/use-realtime-reorganization.ts`)
 * — same envelope, same defensive parsing, same event-router-as-pure-
 * function pattern so tests can drive dispatch without spinning up a
 * fake WS server. Differences vs. that file:
 *   1. Channel namespace: `customer:{userId}:reorganization`.
 *   2. No active-session-store coordination. The customer app has no
 *      "Pending Reality" draft store (drafts live on the tech / FO
 *      side); this hook is invalidation-only.
 *   3. Invalidates `reorganizationKeys.all` + `reorganizationDetailKeys.detail`
 *      + `['appointments']` rather than the tech app's `calendarKeys.all`.
 *
 * PLAN-DEVIATION: 2026-05-02-customer-realtime-event-shape — the §8.9
 * Prompt D.8 chunk-prompt fabricates customer-specific event names
 * (`session_pending_for_customer`) and customer-specific query keys
 * (`['customer-reorganizations', 'pending']`) that neither the BE nor
 * the shipped REMICustomer hooks use. This file follows the actual
 * §6.6.3 envelope (event names match `reorganization_audit_action`)
 * and the actual sibling chunks' query keys (P5-CU-2, P5-CU-5). See
 * docs/PLAN-DEVIATIONS.md#2026-05-02-customer-realtime-event-shape
 * for the full event-by-event mapping and anti-instructions.
 */

import { useCallback, useMemo } from 'react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/src/stores/auth';
import { reorganizationKeys } from '@customer/hooks/reorganizations/use-pending-sessions';
import { reorganizationDetailKeys } from '@customer/hooks/reorganizations/use-session-detail';

import {
  type RealtimeChannelHandle,
  useRealtimeChannel,
} from './use-realtime-channel';

/**
 * §6.6.3 envelope, narrowed to the fields this hook reads. The full
 * shape also includes `channel`, `actor_user_id`, and `ts` — those are
 * intentionally omitted from the parser so adding new fields BE-side
 * does not break the FE.
 */
export interface CustomerReorganizationRealtimeEvent {
  /**
   * Maps to the `reorganization_audit_action` enum BE-side. The
   * concrete values P6-BE-6 emits on the customer channel are the
   * same set as the franchise channel (REMIBackend's
   * `publishSessionEvent` fans the same envelope to both); see
   * `KNOWN_CUSTOMER_REORG_EVENTS` below.
   */
  event: string;
  session_id: number;
  /**
   * §6.6.3 "slim session view." Intentionally not the full
   * `CustomerVisibleSession` row — passing it to TanStack
   * `setQueryData` would corrupt the per-session detail cache because
   * the slim view is missing intents, expires_at, etc. This is why
   * the event handler never calls `setQueryData(event.X)` — it
   * invalidates the relevant query so the consumer (inbox list,
   * action sheet) refetches the authoritative row.
   */
  session_summary?: {
    id: number;
    source: string;
    status: string;
    intent_count: number;
  };
}

/**
 * Concrete event values the BE emits on `customer:{userId}:reorganization`
 * today (REMIBackend's `publishSessionEvent` in
 * `src/services/reorganizationService.ts:1786-1843` fans the same
 * envelope to franchise + session + every-affected-customer channel).
 *
 * Customer-side mapping (per `handleCustomerReorganizationEvent`):
 *   - `session_created`        — session affecting this customer's
 *                                appointments was just created. Until
 *                                status=`pending_review` it isn't in
 *                                the inbox; invalidating is cheap and
 *                                keeps the cache warm.
 *   - `session_finalized`      — session moved into `pending_review`.
 *                                THIS is the "session pending for
 *                                customer" signal the chunk-prompt
 *                                names (we use the actual BE event
 *                                name; see PLAN-DEVIATION above).
 *   - `session_committed`      — atomic apply succeeded; appointments
 *                                changed in the world.
 *   - `session_failed`         — atomic apply rolled back; the session
 *                                row stays in DB as `failed`. The
 *                                action sheet (if open) refetches and
 *                                its own UI surfaces the failure.
 *   - `session_cancelled`      — author or authorizer cancelled before
 *                                commit. Inbox should drop the row.
 *   - `authorization_granted`  — required authorizer approved a step.
 *                                Per-session detail status changed.
 *   - `authorization_denied`   — required authorizer denied a step.
 *                                Per-session detail status changed.
 *   - `session_expired`        — TTL cron set status=expired. Same
 *                                treatment as cancelled.
 *
 * Events the chunk-prompt body invented that the BE does NOT emit on
 * this channel: `session_pending_for_customer`. See PLAN-DEVIATION
 * above.
 */
export const KNOWN_CUSTOMER_REORG_EVENTS = [
  'session_created',
  'session_finalized',
  'session_committed',
  'session_failed',
  'session_cancelled',
  'authorization_granted',
  'authorization_denied',
  'session_expired',
] as const;
export type KnownCustomerReorgEvent = (typeof KNOWN_CUSTOMER_REORG_EVENTS)[number];

function isCustomerReorganizationEvent(
  payload: unknown,
): payload is CustomerReorganizationRealtimeEvent {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return typeof p.event === 'string' && typeof p.session_id === 'number';
}

/**
 * Reusable invalidation block — exported so unit tests can assert it
 * was hit.
 *
 * Notes on the chosen keys:
 *
 * - `reorganizationKeys.all` (`['reorganizations']`) is the
 *   hierarchical root for the inbox-list query
 *   (`['reorganizations', 'list', 'pending_review']`) AND the per-
 *   session detail query (`['reorganizations', 'detail', sessionId]`).
 *   Per TanStack's prefix-match invalidation, invalidating
 *   `['reorganizations']` covers both children — but we ALSO emit the
 *   more specific detail key so a future sibling that bypasses the
 *   shared prefix can still opt into a single-row refetch.
 * - `['appointments']` is the canonical query key from
 *   `src/hooks/appointments/use-appointments.ts:33`. Owns the
 *   customer-facing appointment list; refetched on commit so the
 *   reschedule shows new times immediately rather than after the next
 *   30 s stale-time tick.
 *
 * PLAN-DEVIATION: 2026-05-02-customer-realtime-event-shape — these are
 * the actual sibling chunks' keys, NOT the chunk-prompt's invented
 * `['customer-reorganizations', 'pending']` / `['customer-reorganizations']`.
 */
export function invalidateCustomerInbox(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: reorganizationKeys.all });
}

export function invalidateCustomerSessionDetail(
  queryClient: QueryClient,
  sessionId: number,
): void {
  queryClient.invalidateQueries({
    queryKey: reorganizationDetailKeys.detail(sessionId),
  });
}

export function invalidateCustomerAppointments(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ['appointments'] });
}

/**
 * Pure event router. Exported for unit tests so they can drive the
 * dispatch directly without spinning up a `WebSocket`. The hook below
 * is just the (channel, store-readers, queryClient) wiring on top.
 */
export function handleCustomerReorganizationEvent(
  event: CustomerReorganizationRealtimeEvent,
  queryClient: QueryClient,
): void {
  switch (event.event) {
    case 'session_finalized':
      // Status moved to `pending_review` — the inbox + Home-tab badge
      // need to surface this session, and the per-session detail key
      // must refetch so the action sheet (if open via deep link)
      // shows the up-to-date intent list. This is the customer-side
      // "session pending for customer" signal.
      invalidateCustomerInbox(queryClient);
      invalidateCustomerSessionDetail(queryClient, event.session_id);
      return;

    case 'session_committed':
      // Atomic apply succeeded — appointments changed in the world.
      // Invalidate the inbox so the now-resolved session disappears,
      // the per-session detail so an open action sheet flips to its
      // committed-state UI, and the appointments list so the new
      // times render without waiting for the 30 s stale-time tick.
      invalidateCustomerInbox(queryClient);
      invalidateCustomerSessionDetail(queryClient, event.session_id);
      invalidateCustomerAppointments(queryClient);
      return;

    case 'session_failed':
      // Atomic apply rolled back; row stays in DB as `failed`. The
      // session is still listed (for audit), and its detail status
      // changed. Refetch so the action sheet (if open on this id)
      // surfaces the new status — that screen's own UI handles the
      // user-visible toast (per customer-app override #4: no
      // optimistic resolve; the failure UI is the action sheet's
      // responsibility, not this hook's).
      invalidateCustomerInbox(queryClient);
      invalidateCustomerSessionDetail(queryClient, event.session_id);
      return;

    case 'session_cancelled':
    case 'session_expired':
      // Terminal non-success states. Inbox should drop the row (it
      // filters on `pending_review`); per-session detail status
      // changed. No appointments invalidation — the world did not
      // change.
      invalidateCustomerInbox(queryClient);
      invalidateCustomerSessionDetail(queryClient, event.session_id);
      return;

    case 'authorization_granted':
    case 'authorization_denied':
      // A different authorizer (typically FO) made progress. The
      // session is still in `pending_review` from the customer's POV
      // until commit/cancel; status hasn't terminally moved. Refresh
      // both list and detail so the action sheet's "Awaiting FO"
      // copy (P5-CU-5) flips correctly.
      invalidateCustomerInbox(queryClient);
      invalidateCustomerSessionDetail(queryClient, event.session_id);
      return;

    case 'session_created':
      // Session affecting this customer's appointments was just
      // created. Until status=`pending_review` it isn't in the inbox,
      // but invalidating is cheap and keeps the cache warm for the
      // immediately-following `session_finalized` event most session
      // creates pair with.
      invalidateCustomerInbox(queryClient);
      return;

    default:
      // Unknown event — could be a new BE-side action that hasn't
      // been handled here yet. Be permissive: invalidate the inbox so
      // the cache stays correct. No console.warn per §6.6.4 fail-soft.
      invalidateCustomerInbox(queryClient);
      return;
  }
}

/**
 * Wire the customer reorganization channel. No-op when no userId is
 * available (logged out / hydrating), per §6.6.4 fail-soft.
 *
 * The hook is render-side-effect-free except for `useRealtimeChannel`'s
 * internal `connected` boolean, which we expose for debug surfaces but
 * domain code should NOT gate on (caches refetch on reconnect).
 *
 * Called once from `RootNavigator` in `app/_layout.tsx`. The hook
 * automatically:
 *   - Stays disabled while the auth store is hydrating
 *     (`isAuthenticated` is `false`).
 *   - Subscribes the moment `userId` lands in the store post-login.
 *   - Tears down the WS on logout (the `useEffect` in
 *     `useRealtimeChannel` watches `channel` and the channel becomes
 *     `null` when the user logs out).
 *
 * The `useRealtimeChannel` primitive itself fail-softs on a missing
 * token (`useAuthStore.getState().accessToken` returns `null` →
 * `connect()` returns early; no WebSocket is opened, no console
 * noise). So in practice "WS URL unset" — which in this app means
 * no API_BASE_URL configured for the current build — manifests as a
 * silent connection failure that auto-reconnects every 3 s; the
 * caches just won't refresh in real time, which matches the fail-
 * soft contract from §6.6.4.
 */
export function useRealtimeCustomerReorganization(): RealtimeChannelHandle {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.userId ?? null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const channel = useMemo(() => {
    if (!isAuthenticated || userId == null) return null;
    return `customer:${userId}:reorganization`;
  }, [isAuthenticated, userId]);

  const onMessage = useCallback(
    (payload: unknown) => {
      if (!isCustomerReorganizationEvent(payload)) return;
      handleCustomerReorganizationEvent(payload, queryClient);
    },
    [queryClient],
  );

  return useRealtimeChannel({ channel, onMessage });
}
