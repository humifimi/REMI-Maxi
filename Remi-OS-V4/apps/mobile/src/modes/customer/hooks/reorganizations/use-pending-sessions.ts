/**
 * P5-CU-2 — TanStack Query hook backing the approval inbox surface.
 *
 * Calls `GET /api/v1/customer/reorganizations?status=pending_review` and
 * returns the list of `CustomerVisibleSession`s that currently need the
 * authenticated customer's attention. Sessions are returned in
 * most-recent-first order (newest-finalized at the top, falling back to
 * `created_at` when `finalized_at` is not yet set) per master plan §5.4.4.
 *
 * Two consumers:
 *   - `app/inbox/approvals.tsx` renders the rows.
 *   - `app/(tabs)/index.tsx` reads `data.length` for the Home-tab badge.
 *
 * Both call the same hook so they share TanStack Query's cache: the
 * inbox screen never refetches when the user opens it from the badge,
 * and the badge updates as soon as the inbox refetches.
 *
 * PLAN-DEVIATION: 2026-05-02-pending-review-status-filter — master plan
 * §8.9 Prompt D.4 says `?status=pending`, but the canonical
 * `ReorganizationSessionStatus` enum (master plan §3.8.1, mirrored in
 * `src/types/reorganization.ts`) has no `pending` value — the customer-
 * visible filter is `pending_review`. §5.4.2 in the spec body uses the
 * correct value and wins per the deviation rule. See
 * `docs/PLAN-DEVIATIONS.md#2026-05-02-pending-review-status-filter`.
 */

import { useQuery } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse } from '@customer/types/api';
import type {
  CustomerVisibleSession,
  ReorganizationSessionStatus,
} from '@customer/types/reorganization';

export const reorganizationKeys = {
  all: ['reorganizations'] as const,
  list: (status: ReorganizationSessionStatus | 'all') =>
    ['reorganizations', 'list', status] as const,
};

/**
 * "Most recent first" comparator used by both the inbox renderer and
 * the badge. Pulled out as a top-level export so tests can exercise it
 * directly without going through the network mock.
 */
type PendingSessionsPayload =
  | CustomerVisibleSession[]
  | { sessions: CustomerVisibleSession[] };

/** BE list endpoint returns `{ sessions: [...] }` inside `data`. */
export function normalizePendingSessionsList(
  payload: PendingSessionsPayload | null | undefined,
): CustomerVisibleSession[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.sessions)) return payload.sessions;
  return [];
}

export function compareSessionsMostRecentFirst(
  a: CustomerVisibleSession,
  b: CustomerVisibleSession,
): number {
  const aTs = a.finalized_at ?? a.created_at;
  const bTs = b.finalized_at ?? b.created_at;
  // Lexicographic comparison works on ISO 8601 strings; descending = newest first.
  if (aTs > bTs) return -1;
  if (aTs < bTs) return 1;
  // Tie-break by id desc so the order is stable and deterministic for tests.
  return b.id - a.id;
}

/**
 * Fetches the customer's pending reorganization sessions.
 *
 * `staleTime: 30_000` matches the appointments hook (`useAppointments`),
 * so opening the inbox right after dismissing it doesn't refire the
 * request. `refetchOnWindowFocus: true` covers the "user came back from
 * push notification" case until P6-CU-1 wires the realtime channel.
 */
export function usePendingReorganizationSessions(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const query = useQuery({
    queryKey: reorganizationKeys.list('pending_review'),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<PendingSessionsPayload>>(
        ENDPOINTS.REORGANIZATIONS.LIST,
        { params: { status: 'pending_review' } },
      );
      return normalizePendingSessionsList(data.data);
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    enabled,
  });

  // Sort lives outside the queryFn so the cached payload stays in
  // server-returned order (the future realtime patch path can rely on
  // server ordering for cache-set operations) and the sorted view is
  // computed at read time.
  const sorted = query.data
    ? [...query.data].sort(compareSessionsMostRecentFirst)
    : query.data;

  return { ...query, data: sorted };
}

/**
 * Convenience selector for the Home-tab badge count. Returns `0`
 * during loading or on error — the badge is a "nice to have" affordance
 * and a pulsing skeleton or red error pip would be more disruptive than
 * the missing badge. The actual error surface lives on the inbox
 * screen (so the user only sees "couldn't load" once they go looking).
 *
 * NOTE: this is the one place in the chunk where we deliberately let an
 * error look like "no pending changes" — see `.cursor/rules/architecture.mdc`
 * §1.5 C1's silent-empty footgun. The inbox screen itself surfaces the
 * error explicitly per the customer-app override #5 in the chunk prompt.
 */
export function usePendingReorganizationCount(): number {
  const { data } = usePendingReorganizationSessions();
  return data?.length ?? 0;
}
