/**
 * P5-CU-5 — TanStack Query hooks backing the per-session approval
 * action sheet (`app/inbox/approvals/[sessionId].tsx`). Three concerns:
 *
 *   - `useReorganizationSession(sessionId)` — GET the full session
 *     payload (intents + audit) for the action sheet's intent list.
 *   - `useRespondToReorganizationSession()` — collapsed approve/deny
 *     POST per the customer family's `/respond` endpoint.
 *   - `useCounterProposeReorganizationSession()` — POST .../counter-
 *     propose with the customer's new intent payload.
 *
 * All mutations attach a fresh `Idempotency-Key` per call (master plan
 * §6.3) — same pattern as `mintSession()` in
 * `src/hooks/appointments/use-appointments.ts`.
 *
 * On success, mutations invalidate both the per-session detail key and
 * the pending-list key so the inbox row + Home-tab badge refresh in
 * lock-step. The action sheet screen also dismisses itself.
 *
 * PLAN-DEVIATION: 2026-05-02-customer-respond-endpoint-shape — the
 * §8.9 Prompt D.5 chunk-prompt instructs `POST .../approve` and
 * `POST .../deny`, but the customer family actually ships `/respond`
 * keyed off `body.action`. We follow the §6.2 spec body. Inline
 * markers also live on `ENDPOINTS.REORGANIZATIONS.RESPOND` and on the
 * `respondMutation` mutationFn below; full anti-instructions in
 * `docs/PLAN-DEVIATIONS.md#2026-05-02-customer-respond-endpoint-shape`.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import { randomUUID } from '@customer/utils/uuid';
import type { ApiResponse } from '@customer/types/api';
import type {
  CustomerIntentPayload,
  CustomerVisibleSession,
} from '@customer/types/reorganization';
import { reorganizationKeys } from './use-pending-sessions';

export const reorganizationDetailKeys = {
  detail: (sessionId: number) =>
    ['reorganizations', 'detail', sessionId] as const,
};

/**
 * Fetch a single reorganization session by id. The action sheet calls
 * this on mount to render the intent list with timestamps the inbox row
 * doesn't carry. `staleTime: 15_000` is shorter than the list's 30s
 * because the user just tapped to drill in — they expect the data to be
 * fresh.
 *
 * `enabled` defaults to true and is false-friendly so a screen rendered
 * with a missing `sessionId` route param doesn't fire a useless request.
 */
export function useReorganizationSession(
  sessionId: number | null,
  options?: { enabled?: boolean },
) {
  const enabled = (options?.enabled ?? true) && sessionId != null;
  return useQuery({
    queryKey: reorganizationDetailKeys.detail(sessionId ?? -1),
    queryFn: async () => {
      const { data } = await apiClient.get<
        ApiResponse<CustomerVisibleSession>
      >(ENDPOINTS.REORGANIZATIONS.DETAIL(sessionId as number));
      return data.data;
    },
    enabled,
    staleTime: 15_000,
  });
}

export type RespondAction = 'approve' | 'decline';

export interface RespondMutationVariables {
  sessionId: number;
  action: RespondAction;
  declineReasonKind?: string;
  declineReasonText?: string;
}

export interface RespondMutationResult {
  session: CustomerVisibleSession;
  /**
   * Only meaningful for the `approve` action; `false` for `decline`.
   * Mirrors `auto_committed` from the BE's `/respond` `approve` branch.
   */
  autoCommitted: boolean;
}

/**
 * Issue an approve or decline against a pending reorganization session.
 *
 * The BE's customer `/respond` endpoint returns two response shapes:
 *   - `approve` → `{ session, auto_committed }`
 *   - `decline` → `<CustomerVisibleSession>` directly
 * (`REMIBackend/src/routes/v1/customer/reorganizations.ts:177-204`).
 * We normalize to a single `RespondMutationResult` so consumers don't
 * have to discriminate.
 *
 * 422 errors propagate as Axios errors with
 * `error.response.data.message === 'linter_errors_block_finalize'` and
 * `error.response.data.data.issues: LinterIssue[]`. The action-sheet
 * screen formats those issues inline above the CTAs.
 */
export function useRespondToReorganizationSession() {
  const queryClient = useQueryClient();
  return useMutation<RespondMutationResult, Error, RespondMutationVariables>({
    mutationFn: async ({
      sessionId,
      action,
      declineReasonKind,
      declineReasonText,
    }) => {
      const body: Record<string, unknown> = { action };
      if (action === 'decline') {
        body.decline_reason_kind = declineReasonKind;
        if (declineReasonText) body.decline_reason_text = declineReasonText;
      }
      // PLAN-DEVIATION: 2026-05-02-customer-respond-endpoint-shape —
      // hits `/respond` per §6.2, NOT `/approve` or `/deny` per §8.9
      // Prompt D.5. See docs/PLAN-DEVIATIONS.md#2026-05-02-customer-respond-endpoint-shape.
      const { data } = await apiClient.post<
        ApiResponse<
          | { session: CustomerVisibleSession; auto_committed: boolean }
          | CustomerVisibleSession
        >
      >(ENDPOINTS.REORGANIZATIONS.RESPOND(sessionId), body, {
        headers: { 'Idempotency-Key': randomUUID() },
      });
      const payload = data.data;
      if ('session' in payload && payload.session) {
        return {
          session: payload.session,
          autoCommitted: Boolean(payload.auto_committed),
        };
      }
      const session = payload as CustomerVisibleSession;
      return {
        session,
        autoCommitted: session.status === 'committed',
      };
    },
    onSuccess: (result, variables) => {
      // The pending-list query and the per-session detail query both go
      // stale once the customer responds. Invalidating (rather than
      // setQueryData-ing) keeps the BE as the source of truth for
      // status transitions (the response branch the customer didn't
      // see — e.g. dual-grant partial — would otherwise drift).
      queryClient.invalidateQueries({ queryKey: reorganizationKeys.all });
      queryClient.invalidateQueries({
        queryKey: reorganizationDetailKeys.detail(variables.sessionId),
      });
      // Approving a reschedule auto-commits the underlying appointment
      // change. Refresh the list so the AppointmentCard's pending_change
      // pill disappears immediately rather than on the next 30s poll.
      if (result.autoCommitted) {
        queryClient.invalidateQueries({ queryKey: ['appointments'] });
      }
    },
  });
}

export interface CounterProposeMutationVariables {
  sessionId: number;
  initialIntents: CustomerIntentPayload[];
}

/**
 * Mint a counter-proposal session (master plan §5.4.4 last-row CTA).
 * Returns the **new** session (with `related_session_id` set to the
 * original). The original session's status is unchanged per §4.5
 * ("DO NOT cascade-cancel related_session_id; counter-proposals are
 * independent and survive the original's denial"); the customer is
 * still expected to explicitly approve / decline the original later.
 */
export function useCounterProposeReorganizationSession() {
  const queryClient = useQueryClient();
  return useMutation<CustomerVisibleSession, Error, CounterProposeMutationVariables>({
    mutationFn: async ({ sessionId, initialIntents }) => {
      const { data } = await apiClient.post<
        ApiResponse<CustomerVisibleSession>
      >(
        ENDPOINTS.REORGANIZATIONS.COUNTER_PROPOSE(sessionId),
        { initial_intents: initialIntents },
        { headers: { 'Idempotency-Key': randomUUID() } },
      );
      return data.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: reorganizationKeys.all });
      queryClient.invalidateQueries({
        queryKey: reorganizationDetailKeys.detail(variables.sessionId),
      });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

/**
 * Pull the structured linter issues out of an Axios 422 error body.
 *
 * The BE's response envelope on `linter_errors_block_finalize` is:
 *   `{ error: true, message: 'linter_errors_block_finalize',
 *      data: { issues: LinterIssue[] } }`
 * (`REMIBackend/src/services/reorganizationService.ts:1373-1381`).
 * Returns `null` when the error isn't a structured 422 — caller falls
 * back to a generic "Couldn't approve" toast in that case.
 *
 * Kept loose-typed (`unknown[]`) on purpose: REMICustomer doesn't ship
 * the `LinterIssue` type yet (it's REMIBackend / REMITechnician-side),
 * and the action sheet only renders `String(issue.message)` style text,
 * not domain-specific fields.
 */
export interface LinterRejection {
  issues: unknown[];
}

export function extractLinterRejection(error: unknown): LinterRejection | null {
  if (!error || typeof error !== 'object') return null;
  const maybeAxios = error as {
    response?: { status?: number; data?: { message?: string; data?: unknown } };
  };
  if (maybeAxios.response?.status !== 422) return null;
  if (maybeAxios.response.data?.message !== 'linter_errors_block_finalize') {
    return null;
  }
  const inner = maybeAxios.response.data.data as
    | { issues?: unknown[] }
    | undefined;
  if (!inner || !Array.isArray(inner.issues)) return null;
  return { issues: inner.issues };
}
