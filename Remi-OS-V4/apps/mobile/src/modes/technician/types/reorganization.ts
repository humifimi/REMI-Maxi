/**
 * Shared reorganization-session types — first introduced by P1-BE-4.
 *
 * The data model behind these types is specified in the calendar-
 * reorganization master plan §3.8. The matching DB tables
 * (`reorganization_sessions`, `reorganization_intents`,
 * `reorganization_session_audit`) and HTTP endpoints land in Phase 6
 * (BE-G3 / BE-G4 / BE-G7..G11). P1-BE-4 only consumes the shapes —
 * the logistics linter is a pure function over `(session, intents,
 * worldSnapshot)` and does not need any of the DB plumbing.
 *
 * IMPORTANT — duplicated source convention.
 *
 * Per master plan §1.5/X1, REMIBackend (Zod 3) and REMITechnician
 * (Zod 4) cannot share a runtime schema package today, so this file
 * is duplicated VERBATIM at:
 *
 *   /Users/jacegalloway/Documents/codebases/REMIBackend/src/types/reorganization.ts   (canonical)
 *   /Users/jacegalloway/Documents/codebases/REMITechnician/src/types/reorganization.ts (mirror)
 *
 * Both copies are pure TypeScript with zero runtime imports, so the
 * duplication is purely textual. If you change one, change the other
 * — see `.cursor/rules/logistics-linter.mdc` (REMITechnician) for the
 * full convention and the planned CI grep check.
 *
 * **Intentional FE/BE divergence — `ReorganizationIntent.clean` and
 * `ReorganizationIntent.conflicts` (FE-CR-1-1, 2026-05-11).** The
 * REMITechnician copy below adds two optional wire-only fields that
 * the BE attaches on read responses (`serializeIntent` in
 * `/Users/jacegalloway/Documents/codebases/REMIBackend/src/routes/v1/_helpers/reorganization.ts`)
 * but that are NOT part of the DB row shape. The BE-side row type
 * stays clean of these fields — they're computed at serialization
 * time from a `LinterIssue[]` joined onto the intent set. The FE
 * needs them on the consumed shape so `useCleanIntentPromotion` can
 * route off the BE's authoritative answer instead of re-running a
 * local linter. PLAN-DEVIATION: 2026-05-11-intent-clean-fe-only —
 * see `docs/PLAN-DEVIATIONS.md#2026-05-11-intent-clean-fe-only`.
 */

// --- Enums (string unions per master plan §3.8.1) ---

export type ReorganizationSessionStatus =
  | "draft"
  | "pending_review"
  | "committing"
  | "committed"
  | "cancelled"
  | "failed"
  | "expired";

export type ReorganizationSessionSource =
  | "tech_app"
  | "franchise_dashboard"
  | "customer_app"
  | "ai_suggestion";

export type RequiredAuthorizerRole =
  | "self"
  | "franchise_owner"
  | "customer"
  | "technician"
  | "dual";

export type ReorganizationIntentType =
  | "reschedule"
  | "reassign"
  | "cancel"
  | "create"
  | "personal_event_create"
  | "personal_event_update"
  | "personal_event_delete";

export type ReorganizationIntentStatus =
  | "proposed"
  | "committed"
  | "reverted"
  | "failed";

// --- Per-intent payloads (discriminated union by `kind`, per §3.8.2) ---

export interface ReschedulePayload {
  kind: "reschedule";
  new_scheduled_date: string; // YYYY-MM-DD
  new_start_time: string; // HH:mm or HH:mm:ss
  new_end_time: string; // HH:mm or HH:mm:ss
  new_technician_id?: number; // optional combo reschedule + reassign
}

export interface ReassignPayload {
  kind: "reassign";
  new_technician_id: number;
  dispatcher_reason?: string;
}

export interface CancelPayload {
  kind: "cancel";
  cancellation_reason: string; // structured: 'customer_request' | 'tech_unavailable' | ...
  cancellation_note?: string;
}

export interface CreatePayload {
  kind: "create";
  customer_id: number;
  technician_id: number | null; // null = auto-assign at commit
  scheduled_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  service_ids: number[];
  vehicle_id?: number;
  address_zip?: string;
  notes?: string;
}

export interface PersonalEventCreatePayload {
  kind: "personal_event_create";
  technician_id: number;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  title: string;
  category: string;
  shared_with_technician_ids?: number[];
}

export interface PersonalEventUpdatePayload {
  kind: "personal_event_update";
  version: number;
  patch: Partial<Omit<PersonalEventCreatePayload, "kind">>;
}

export interface PersonalEventDeletePayload {
  kind: "personal_event_delete";
  version: number;
}

export type ReorganizationIntentPayload =
  | ReschedulePayload
  | ReassignPayload
  | CancelPayload
  | CreatePayload
  | PersonalEventCreatePayload
  | PersonalEventUpdatePayload
  | PersonalEventDeletePayload;

// --- Policy snapshot (master plan §3.8.1) ---

export interface ReorganizationPolicy {
  tech_authored_self_only: "auto" | "fo_review";
  tech_authored_cross_tech: "auto" | "fo_review";
  tech_authored_with_cancel: "auto" | "fo_review";
  customer_authored_single: "auto" | "fo_review";
  customer_authored_multi: "auto" | "fo_review";
  customer_authored_with_conflict: "auto" | "fo_review";
  ai_authored: "always_fo_review";
}

// --- Linter dependency edge (master plan §3.10) ---

export interface LinterDependencyEdge {
  from_intent_id: number; // NULL during local linting; assigned at finalize
  to_intent_id: number;
  kind:
    | "cascading_reschedule"
    | "tech_capacity_conflict"
    | "route_dependency"
    | "series_consistency";
  severity: "error" | "warning";
  human_explanation: string;
  auto_fix_intent?: ReorganizationIntentPayload;
}

// --- Linter issue (type-only reference for FE-CR-1-1) ---
//
// `LinterIssue` lives in `src/utils/logistics-linter.ts` (the
// canonical FE source). We reference it here via `import type` so
// the `ReorganizationIntent.conflicts` field below can name the
// same nominal type the local linter produces, without dragging
// any runtime code into this types file. `import type` is fully
// erased at compile time so this stays zero-runtime-import even
// though `logistics-linter.ts` imports back from this file
// (TypeScript's type-only import cycle is safe).
//
// Downstream consumers should keep importing `LinterIssue` from
// `logistics-linter.ts` directly — we deliberately don't re-export
// it from here, because some babel transformer configs lower
// `export type { X } from "..."` into a runtime re-export that
// would cause an actual cyclic runtime import.
import type { LinterIssue } from "@technician/utils/logistics-linter";

// --- Top-level row shapes (master plan §3.8.1) ---

export interface ReorganizationSession {
  id: number;
  franchise_id: number;
  author_user_id: number | null;
  source: ReorganizationSessionSource;
  status: ReorganizationSessionStatus;
  required_authorizer_role: RequiredAuthorizerRole;
  eligible_committer_ids: number[];
  policy_snapshot: ReorganizationPolicy;
  idempotency_key: string | null;
  notes: string | null;
  template_id: number | null;
  related_session_id: number | null;
  source_metadata: Record<string, unknown>;
  created_at: string; // ISO8601
  finalized_at: string | null;
  committed_at: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
}

export interface ReorganizationIntent {
  id: number;
  session_id: number;
  intent_type: ReorganizationIntentType;
  intent_status: ReorganizationIntentStatus;
  appointment_id: number | null; // INTEGER per §3.1
  personal_event_id: string | null; // UUID per §3.1
  payload: ReorganizationIntentPayload;
  inverse_payload: ReorganizationIntentPayload | null;
  prior_state_snapshot: Record<string, unknown> | null;
  linter_dependency_edges: LinterDependencyEdge[];
  commit_order: number | null;
  proposed_at: string;
  committed_at: string | null;
  // PLAN-DEVIATION: 2026-05-10-sticky-chain-identity-fe — opaque
  // grouping identifier assigned ONCE on the BE at `op:add_intent`
  // time and preserved verbatim through `op:modify_intent` /
  // `op:remove_intent`. Mirrors REMIBackend
  // `src/types/reorganization.ts` `chain_id: string` (see
  // /Users/jacegalloway/Documents/codebases/REMIBackend/docs/PLAN-DEVIATIONS.md#2026-05-10-sticky-chain-identity).
  // FE consumers prefer this over the synthesized
  // `chain-{seedIntentId}` so the user's 4-link chain stays as ONE
  // chain after a `modify_intent` that breaks the conflict
  // topology. Non-null for any intent reaching the FE from a
  // post-migration BE; the type is `string` to match BE exactly.
  // The detector defensively falls back to the synthesized id
  // when an intent lacks `chain_id` at runtime (BE deploy-window
  // edge or local optimistic intent not yet ack'd) — see
  // `src/utils/detect-move-chains.ts` and
  // docs/PLAN-DEVIATIONS.md#2026-05-10-sticky-chain-identity-fe.
  chain_id: string;
  // PLAN-DEVIATION: 2026-05-11-intent-clean-fe-only — wire-only
  // fields the BE attaches at serialization time
  // (`serializeIntent` in REMIBackend
  // `routes/v1/_helpers/reorganization.ts`). NOT a DB row column,
  // so the BE-side type mirror does not declare them; the FE-side
  // type adds them so consumers (`useCleanIntentPromotion`) can
  // read the BE's authoritative lint answer instead of running a
  // local linter. Both are optional because (a) GET responses run
  // the linter (`serializeSessionWithLint`) and ship accurate
  // values, but (b) mutation responses (POST /create, PATCH
  // /update, POST /finalize, POST /commit, POST /commit-many,
  // POST /cancel, POST /authorize, POST /deny) use the plain
  // `serializeSession` which passes an empty `issues` array, so
  // every intent comes back `clean: true, conflicts: []`
  // regardless of the real lint state. The realtime hook's
  // subsequent prefix invalidation refetches the GET and corrects
  // the values within a few ms — consumers MUST treat
  // `clean: true` after a mutation as "best guess, will be
  // corrected" rather than authoritative. See
  // docs/PLAN-DEVIATIONS.md#2026-05-11-intent-clean-fe-only for
  // the full context.
  clean?: boolean;
  conflicts?: LinterIssue[];
}

// --- Pending intent summary (P6-BE-9) ---
//
// Server-side annotation joined onto every appointment row the calendar
// canvas consumes. Lets FE consumers render a "this card has a pending
// change" overlay (P3-FE-8 / C.12) without an N+1 round-trip per visible
// appointment.
//
// "Active" means an intent whose parent `reorganization_sessions.status`
// is one of `('draft', 'pending_review')`. Committed / cancelled /
// failed / expired sessions do NOT contribute — the appointment row in
// that case already reflects the committed mutation, or the would-have-
// committed mutation no longer matters.
//
// `source` is mapped from the underlying `reorganization_session_source`
// DB enum to a friendlier FE-facing union per the C.12 deferred-chunk
// spec in REMITechnician/docs/DEVELOPMENT-LOG.md§deferred-chunk-p3-fe-8.
// The mapping (BE → FE):
//   tech_app            → tech_app
//   franchise_dashboard → franchise_app
//   customer_app        → customer_app
//   ai_suggestion       → ai_engine
// `mixed` indicates two or more sibling sessions from different sources
// touch this appointment.

export type PendingIntentSummarySource =
  | "tech_app"
  | "franchise_app"
  | "customer_app"
  | "ai_engine"
  | "mixed";

export interface PendingIntentSummary {
  intent_count: number;
  // Distinct intent types across all active sibling sessions targeting
  // this appointment. Order is not guaranteed — FE callers should not
  // depend on it.
  kinds: ReorganizationIntentType[];
  source: PendingIntentSummarySource;
  // Highest active-session id touching this appointment (sessions are
  // SERIAL, so MAX(id) approximates "most recent"). FE deeplinks to
  // `/pending-reality/review?focusAppointmentId=...` use this as the
  // primary session target; a second-most-recent session is unreachable
  // through this annotation by design (re-query the session list if you
  // need it).
  most_recent_session_id: number | null;
}

// --- Customer-visible intent + pending-change annotation (P6-BE-10) ---
//
// Customer-side analog of `PendingIntentSummary` (P6-BE-9). Surfaced on
// every appointment row returned by `GET /api/v1/customer/appointments`
// so REMICustomer can render the "Proposed change" `AppointmentCard`
// variant (master plan §5.4.3 / D.3 / `P5-CU-4`) without an N+1
// roundtrip per visible appointment.
//
// Differences from the tech-side `PendingIntentSummary`:
//
//   1. Returns the FULL intent (kind + payload), not aggregate counts.
//      The customer card renders a side-by-side current-vs-proposed
//      diff and needs the payload to do that.
//   2. Source is the RAW DB enum (`tech_app | franchise_dashboard |
//      customer_app | ai_suggestion`), not the friendlier remapped
//      union the tech side uses. Matches REMICustomer's
//      `ReorganizationSessionSource` shipped in P5-CU-3 — keeping the
//      vocabulary aligned with `customer_visible_session.source`
//      avoids a translator at the consumer.
//   3. Filtered to customer-visible intent kinds only (`reschedule |
//      cancel`) per master plan §3.8.4 — the same filter the
//      `toCustomerVisibleSession` helper applies to session responses.
//      Sessions whose only intent against the appointment is a
//      tech-internal kind (`reassign`, `personal_event_*`, `create`)
//      MUST NOT surface a `pending_change` annotation.
//   4. One annotation per appointment, not aggregated. Pick the
//      highest `intent.id` (which, since intents are SERIAL, is the
//      most recently created customer-visible intent). The inbox
//      surface (D.4 / `P5-CU-2`) is the canonical place to enumerate
//      every pending session.
//
// Authorization: trusts the caller to pre-scope the input list to
// appointments that already passed `appointments.customer_id =
// req.user.userId` filtering. `findByCustomer` is the only call site
// today and meets that requirement.

export type CustomerVisibleIntentType = "reschedule" | "cancel";

export type CustomerVisibleIntentPayload = ReschedulePayload | CancelPayload;

// Customer-visible intent — narrowed `ReorganizationIntent` mirroring
// REMICustomer's `CustomerVisibleIntent` in
// `src/types/reorganization.ts`. Only the fields REMICustomer actually
// reads are projected; `prior_state_snapshot`,
// `linter_dependency_edges`, `inverse_payload`, `commit_order`, and
// `personal_event_id` are intentionally omitted to keep the wire
// payload tight.
export interface CustomerVisibleIntent {
  id: number;
  session_id: number;
  intent_type: CustomerVisibleIntentType;
  intent_status: ReorganizationIntentStatus;
  appointment_id: number | null;
  payload: CustomerVisibleIntentPayload;
  proposed_at: string;
  committed_at: string | null;
}

// Per-appointment annotation surfaced on `GET /api/v1/customer/
// appointments` rows. `null` (or missing on pre-P6-BE-10 servers) when
// no customer-visible pending intent affects the appointment.
export interface AppointmentPendingChangeSummary {
  session_id: number;
  source: ReorganizationSessionSource;
  intent: CustomerVisibleIntent;
  expires_at: string | null;
}
