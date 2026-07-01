/**
 * P5-CU-7 — Customer-authored N-intent reorganization session mint.
 *
 * Calls `POST /api/v1/customer/reorganizations` with one or more
 * reschedule intents and `finalize_immediately: true`. Used by the
 * multi-reschedule screen (`app/schedule/multi-reschedule.tsx`).
 *
 * Shape of the BE response (mirrors
 * `REMIBackend/src/routes/v1/customer/reorganizations.ts:100-126`):
 *
 *   201 + { session, auto_committed: true,  linter_warnings? }  — auto-committed
 *   201 + { session, auto_committed: false, linter_warnings? }  — needs FO review
 *   201 + <CustomerVisibleSession> (draft)                      — unused; we always send finalize_immediately
 *   422 + { message: 'linter_errors_block_finalize',
 *           data: { issues: LinterIssue[] } }                   — linter blocked finalize
 *
 * Per master plan §2.5, a customer_authored multi-intent session
 * defaults to `customer_authored_multi = fo_review` — i.e. the
 * common-case response is `auto_committed: false`. Callers should
 * render both branches even though in production the auto-committed
 * branch is rare (would only fire if a franchise's trust-gradient
 * policy was overridden to `auto` for customer_authored_multi).
 *
 * PLAN-DEVIATION: 2026-05-02-customer-mint-response-status-codes — the
 * §8.9 Prompt D.7 chunk-prompt body says "200 → 'All set', 202 →
 * 'Submitted for approval', 422 → linter", but the customer family's
 * `POST /reorganizations` always returns **201** on success (either
 * auto-committed or draft/pending_review — discriminated via
 * `auto_committed: boolean` in the response body, NOT via HTTP status
 * code). The UX branching this hook exposes via `{ session,
 * autoCommitted }` matches the chunk-prompt's two success branches
 * while the status-code disagreement is absorbed here. See
 * `docs/PLAN-DEVIATIONS.md#2026-05-02-customer-mint-response-status-codes`.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import { randomUUID } from '@customer/utils/uuid';
import type { ApiResponse, Appointment } from '@customer/types/api';
import type {
  CreateReorganizationSessionRequest,
  CreateReorganizationSessionResponse,
  CustomerIntentPayload,
  CustomerVisibleSession,
  ReschedulePayload,
} from '@customer/types/reorganization';
import { reorganizationKeys } from './use-pending-sessions';

/**
 * Default appointment duration when the appointment carries no services
 * or the services lack `duration_minutes`. Mirrors
 * `DEFAULT_APPOINTMENT_DURATION_MIN` in `use-appointments.ts` — kept
 * duplicated rather than shared because exporting from the appointments
 * hooks file would widen its public API for a single consumer.
 */
const DEFAULT_APPOINTMENT_DURATION_MIN = 60;

/**
 * Compute the total service duration for an appointment. Falls back
 * to `DEFAULT_APPOINTMENT_DURATION_MIN` when services are missing or
 * carry no duration metadata.
 */
export function totalServiceMinutes(appointment: Appointment): number {
  const sum = (appointment.services ?? []).reduce(
    (acc, s) => acc + (s.service?.duration_minutes ?? 0),
    0,
  );
  return sum > 0 ? sum : DEFAULT_APPOINTMENT_DURATION_MIN;
}

/**
 * "HH:mm" + minutes → "HH:mm". Mirrors `addMinutesToTimeOfDay` in
 * `use-appointments.ts`; same caveat as `totalServiceMinutes` about
 * not re-exporting across hook files.
 */
export function addMinutesToTimeOfDay(time: string, minutes: number): string {
  const [hStr, mStr] = time.split(':');
  const base = (Number(hStr) || 0) * 60 + (Number(mStr) || 0);
  const total = ((base + minutes) % (24 * 60) + 24 * 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Build a `reschedule` intent payload from an appointment + the
 * customer's picked new date/time. `new_end_time` is derived from the
 * appointment's existing service durations so the BE linter has a
 * real end-time to check against tech availability (§3.10).
 */
export function buildRescheduleIntent(
  appointment: Appointment,
  newScheduledDate: string,
  newStartTime: string,
  newTechnicianId?: number,
): ReschedulePayload {
  const duration = totalServiceMinutes(appointment);
  const payload: ReschedulePayload = {
    kind: 'reschedule',
    appointment_id: appointment.id,
    new_scheduled_date: newScheduledDate,
    new_start_time: newStartTime,
    new_end_time: addMinutesToTimeOfDay(newStartTime, duration),
  };
  if (newTechnicianId != null) payload.new_technician_id = newTechnicianId;
  return payload;
}

export interface CreateReorganizationSessionMutationVariables {
  intents: CustomerIntentPayload[];
  notes?: string | null;
  finalizeImmediately?: boolean;
}

export interface CreateReorganizationSessionResult {
  session: CustomerVisibleSession;
  autoCommitted: boolean;
}

/**
 * Normalize the two possible BE response shapes into a single
 * `{ session, autoCommitted }` result.
 */
function normalizeCreateResponse(
  raw: CreateReorganizationSessionResponse | CustomerVisibleSession,
): CreateReorganizationSessionResult {
  if ('session' in raw && raw.session) {
    return {
      session: raw.session,
      autoCommitted: Boolean(raw.auto_committed),
    };
  }
  const session = raw as CustomerVisibleSession;
  return {
    session,
    autoCommitted: session.status === 'committed',
  };
}

/**
 * Mint a reorganization session with 1..N customer intents.
 *
 * On success, invalidates:
 *   - `['appointments']` — cards on the Home tab flip into the
 *     `pending_change` variant as soon as P6-BE-10 ships the
 *     BE annotation.
 *   - `reorganizationKeys.all` — the approval inbox and Home-tab
 *     badge pick the new session up on next read.
 */
export function useCreateReorganizationSession() {
  const queryClient = useQueryClient();
  return useMutation<
    CreateReorganizationSessionResult,
    Error,
    CreateReorganizationSessionMutationVariables
  >({
    mutationFn: async ({ intents, notes, finalizeImmediately }) => {
      const body: CreateReorganizationSessionRequest = {
        initial_intents: intents,
        finalize_immediately: finalizeImmediately ?? true,
      };
      if (notes != null) body.notes = notes;
      const { data } = await apiClient.post<
        ApiResponse<
          CreateReorganizationSessionResponse | CustomerVisibleSession
        >
      >(ENDPOINTS.REORGANIZATIONS.CREATE, body, {
        headers: { 'Idempotency-Key': randomUUID() },
      });
      return normalizeCreateResponse(data.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reorganizationKeys.all });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

/**
 * Canonical wire shape of a BE `LinterIssue` per
 * `REMIBackend/src/services/scheduling/logistics-linter.ts` — kept
 * loose-typed at the `unknown` boundary because the canonical type
 * lives in REMIBackend/REMITechnician and only the shape below is
 * load-bearing on the customer side.
 *
 * We deliberately accept both `affectedAppointmentIds` (the canonical
 * name) and `affected_appointment_ids` (snake_case variant seen on
 * older fixtures) so a contract tweak on the BE doesn't break this
 * screen silently.
 */
export interface LinterIssueSummary {
  humanMessage: string;
  affectedAppointmentIds: number[];
  severity?: 'error' | 'warning';
  kind?: string;
}

/**
 * Normalize one raw `LinterIssue` (typed as `unknown` at the wire
 * boundary) into a `LinterIssueSummary`. Returns null if the shape
 * is unrecognized — caller falls back to a generic "scheduling
 * conflict" copy.
 */
export function summarizeLinterIssue(
  raw: unknown,
): LinterIssueSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const issue = raw as Record<string, unknown>;

  const messageCandidate =
    (typeof issue.humanMessage === 'string' && issue.humanMessage) ||
    (typeof issue.message === 'string' && issue.message) ||
    (typeof issue.human_message === 'string' && issue.human_message) ||
    '';
  if (!messageCandidate) return null;

  const idsRaw =
    issue.affectedAppointmentIds ??
    issue.affected_appointment_ids ??
    [];
  const affectedAppointmentIds = Array.isArray(idsRaw)
    ? idsRaw.filter((x): x is number => typeof x === 'number')
    : [];

  const severity =
    issue.severity === 'error' || issue.severity === 'warning'
      ? issue.severity
      : undefined;
  const kind = typeof issue.kind === 'string' ? issue.kind : undefined;

  return {
    humanMessage: messageCandidate,
    affectedAppointmentIds,
    severity,
    kind,
  };
}

/**
 * Bucket a raw list of linter issues (from the 422 response envelope)
 * by appointment_id so the per-row error surface can render only the
 * issues affecting that row. Issues with an empty
 * `affectedAppointmentIds` land in the `unassigned` bucket and are
 * rendered at the top of the screen.
 */
export interface BucketedLinterIssues {
  byAppointmentId: Map<number, LinterIssueSummary[]>;
  unassigned: LinterIssueSummary[];
}

export function bucketLinterIssuesByAppointment(
  issues: unknown[],
): BucketedLinterIssues {
  const byAppointmentId = new Map<number, LinterIssueSummary[]>();
  const unassigned: LinterIssueSummary[] = [];

  for (const raw of issues) {
    const summary = summarizeLinterIssue(raw);
    if (!summary) continue;
    if (summary.affectedAppointmentIds.length === 0) {
      unassigned.push(summary);
      continue;
    }
    for (const apptId of summary.affectedAppointmentIds) {
      const existing = byAppointmentId.get(apptId);
      if (existing) {
        existing.push(summary);
      } else {
        byAppointmentId.set(apptId, [summary]);
      }
    }
  }

  return { byAppointmentId, unassigned };
}
