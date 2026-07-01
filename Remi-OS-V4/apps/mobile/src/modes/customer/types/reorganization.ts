/**
 * Customer-facing subset of the reorganization domain types.
 *
 * Mirrors the shapes from the calendar reorganization master plan §3.8
 * (`/Users/jacegalloway/Documents/codebases/REMITechnician/docs/implementation-plans/calendar-reorganization-master-plan.md`).
 * Only the kinds REMICustomer ever sees or sends are declared here:
 *
 *   - `reschedule` and `cancel` intent payloads — produced by the
 *     re-pointed `useRescheduleAppointment` / `useCancelAppointment`
 *     hooks (P5-CU-3).
 *   - The `CustomerVisibleSession` / `CustomerVisibleIntent` shapes —
 *     server scrubs the response down to these two intent kinds before
 *     it leaves the customer family routes (§3.8.4 / §6.2).
 *
 * The full union (with `reassign`, `create`, and personal-event variants)
 * lives in REMITechnician/REMIBackend; the customer never proposes or
 * receives those.
 */

export type ReorganizationSessionStatus =
  | 'draft'
  | 'pending_review'
  | 'committing'
  | 'committed'
  | 'cancelled'
  | 'failed'
  | 'expired';

export type ReorganizationSessionSource =
  | 'tech_app'
  | 'franchise_dashboard'
  | 'customer_app'
  | 'ai_suggestion';

export interface ReschedulePayload {
  kind: 'reschedule';
  appointment_id: number;
  new_scheduled_date: string; // YYYY-MM-DD
  new_start_time: string; // HH:mm
  new_end_time: string; // HH:mm
  new_technician_id?: number;
}

export interface CancelPayload {
  kind: 'cancel';
  appointment_id: number;
  cancellation_reason: string; // 1..120 chars per backend schema
  cancellation_note?: string;
}

export type CustomerIntentPayload = ReschedulePayload | CancelPayload;

export interface CustomerVisibleIntent {
  id: number;
  session_id: number;
  intent_type: 'reschedule' | 'cancel';
  intent_status: 'proposed' | 'committed' | 'reverted' | 'failed';
  appointment_id: number | null;
  payload: CustomerIntentPayload;
  proposed_at: string;
  committed_at: string | null;
}

export interface CustomerVisibleSession {
  id: number;
  source: ReorganizationSessionSource;
  status: ReorganizationSessionStatus;
  intents: CustomerVisibleIntent[];
  expires_at: string | null;
  created_at: string;
  finalized_at: string | null;
  committed_at: string | null;
  cancelled_at: string | null;
}

/**
 * Per-appointment annotation surfaced on `GET /api/v1/customer/appointments`
 * rows (master plan §5.4.3 + customer-side analog of P6-BE-9). When a
 * pending reorganization session has at least one customer-visible intent
 * targeting the appointment, the BE attaches this summary so the FE can
 * render the "Proposed change" card variant without a second roundtrip.
 *
 * `null` (or missing) when no pending intent affects the appointment. When
 * multiple pending sessions touch the same appointment, the BE picks the
 * most-recently finalized one and surfaces it here; the inbox screen
 * (D.4 / P5-CU-2) is the canonical place to enumerate every pending
 * session.
 *
 * NOTE: as of P5-CU-4 the customer-side BE annotation is not yet shipped;
 * this field stays `undefined` in production responses and the card variant
 * is only exercised by tests / explicit demo wiring. The FE shape is
 * defined here so the contract is stable when BE catches up — see
 * `docs/DEVELOPMENT-LOG.md` under P5-CU-4 for the BE follow-up note.
 */
export interface AppointmentPendingChangeSummary {
  session_id: number;
  source: ReorganizationSessionSource;
  intent: CustomerVisibleIntent;
  expires_at: string | null;
}

/**
 * Body shape for `POST /api/v1/customer/reorganizations`.
 * Mirrors `createSessionBodySchema` in REMIBackend
 * (`src/schemas/reorganization.schema.ts`).
 */
export interface CreateReorganizationSessionRequest {
  notes?: string | null;
  initial_intents?: CustomerIntentPayload[];
  finalize_immediately?: boolean;
}

/**
 * Two response shapes are possible (see customer reorganizations route):
 *   - When `finalize_immediately` triggers the auto-commit path:
 *       { session, auto_committed: true|false, linter_warnings? }
 *   - When the session stays draft:
 *       <CustomerVisibleSession> directly
 *
 * `useCreateReorganizationSession` normalizes both into the first shape.
 */
export interface CreateReorganizationSessionResponse {
  session: CustomerVisibleSession;
  auto_committed: boolean;
  linter_warnings?: unknown;
}
