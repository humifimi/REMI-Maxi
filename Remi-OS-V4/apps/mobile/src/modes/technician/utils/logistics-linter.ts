/**
 * Logistics linter — P1-BE-4.
 *
 * Pure-function rule engine that inspects a draft `ReorganizationSession`
 * (the proposed intents) against a snapshot of the surrounding world
 * (already-committed appointments, route plans, customer SLA windows,
 * fleet capacity bookkeeping) and returns a flat list of `LinterIssue`s.
 *
 * No I/O, no DB, no Date.now() — every input is supplied by the caller.
 * Same source runs in three places per master plan §4.6:
 *
 *   - REMITechnician — `usePendingRealityStore` selector (local UX)
 *   - REMIBackend     — `session.finalize` handler (authoritative gate)
 *   - REMIBackend     — `session.commit` re-check (concurrent-change safety net)
 *
 * The five rule kinds in the prompt collapse the §4.7 catalog into
 * the v1 surface the review UI actually renders:
 *
 *   - `time_conflict`              ← R1, R2 (tech capacity overlap, in-session and vs committed world)
 *   - `drive_time_impossible`       ← R3, R4 (cascading drive-time, warn → error past min gap)
 *   - `customer_sla_violation`      ← R10  (customer blackout / SLA window violations)
 *   - `fleet_capacity`              ← R9   (fleet account per-tech weekly cap)
 *   - `recurring_series_inconsistency` ← R6 (edit-all vs edit-one collisions on a series)
 *
 * If you change the rule semantics, change them in BOTH copies of this
 * file. See `.cursor/rules/logistics-linter.mdc` (REMITechnician) for
 * the duplicated-source / shared-fixtures contract introduced by P1-BE-4.
 *
 * Canonical: /Users/jacegalloway/Documents/codebases/REMIBackend/src/services/scheduling/logistics-linter.ts
 * Mirror:    /Users/jacegalloway/Documents/codebases/REMITechnician/src/utils/logistics-linter.ts
 *
 * The ONLY intentional difference between the two copies is the
 * relative-path segment in the next import (REMIBackend lives two
 * levels deep under `src/`, REMITechnician lives one level deep). The
 * linter body is byte-identical.
 */

import type {
  ReorganizationIntent,
  ReorganizationIntentPayload,
  ReorganizationSession,
} from "../types/reorganization";

// ---------------------------------------------------------------------------
// LinterIssue (per P1-BE-4 prompt — exact shape, do not extend without
// matching changes in REMITechnician AND in P3-FE-5 review UI).
// ---------------------------------------------------------------------------

export type LinterIssueKind =
  | "time_conflict"
  | "drive_time_impossible"
  | "customer_sla_violation"
  | "fleet_capacity"
  | "recurring_series_inconsistency";

export interface LinterIssue {
  severity: "error" | "warning";
  kind: LinterIssueKind;
  affectedAppointmentIds: number[];
  humanMessage: string;
  suggestedAutoFix?: ReorganizationIntentPayload;
  /**
   * Discriminator on `time_conflict` (R1 / R2): does this issue
   * collide with another in-session staged intent, or with an
   * already-committed appointment outside the session?
   *
   *   - `"staged_intent"` — R1 (`lintTimeConflicts` intra-session
   *     pairwise overlap). Both colliding slots are projected from
   *     intents the user has staged in the current session. The UI
   *     can frame this softer ("heads up, pending move overlap")
   *     because the user owns both sides — nothing on the committed
   *     calendar is in danger yet, and "Stage for review" simply
   *     accumulates two intents in a known-conflicting state that
   *     the review screen will flag at finalize.
   *   - `"committed"` — R2 (intent vs `world.appointments` row).
   *     The proposed slot would land on top of an appointment that
   *     already exists on the calendar. This is the urgent case —
   *     the UI keeps its "Hold on — this would conflict" framing.
   *
   * Other rule kinds (drive_time, sla, fleet, recurring_series)
   * don't have this distinction; they leave the field `undefined`.
   * Optional on purpose so older fixtures + cross-repo BE callers
   * compile without churn during the rollout.
   *
   * Cross-repo: mirrored in
   * /Users/jacegalloway/Documents/codebases/REMIBackend/src/services/scheduling/logistics-linter.ts.
   * See `.cursor/rules/logistics-linter.mdc` for the byte-identity
   * contract.
   */
  collisionWith?: "committed" | "staged_intent";
}

// ---------------------------------------------------------------------------
// Linter input snapshot.
//
// `LinterAppointment` and friends are the linter's *input contract*, not
// DB rows. The caller (server finalize/commit handlers, FE store
// selectors) is responsible for assembling the snapshot from the live
// world — pulling `appointments` rows, computing `scheduled_end_time`
// from `appointments.scheduled_time + service.duration_minutes`,
// joining `recurrence_series_id` where present, etc.
//
// Keeping the linter snapshot-driven is what makes it pure and what
// lets the same fixtures power tests on both sides of the wire.
// ---------------------------------------------------------------------------

export interface LinterAppointment {
  id: number;
  customer_id: number;
  technician_id: number | null;
  franchise_id: number | null;
  fleet_company_id?: number | null;
  status: string; // AppointmentStatus union — kept loose so the snapshot stays cross-repo portable
  scheduled_date: string; // YYYY-MM-DD (linter requires non-null; caller filters out unscheduled rows)
  scheduled_start_time: string; // HH:mm or HH:mm:ss
  scheduled_end_time: string; // HH:mm or HH:mm:ss
  recurrence_series_id?: string | null;
}

export interface LinterRouteStop {
  appointment_id: number;
  stop_order: number;
  drive_time_from_previous_min: number | null;
}

export interface LinterRoute {
  id: number;
  technician_id: number;
  date: string; // YYYY-MM-DD
  stops: LinterRouteStop[];
  // Minimum driveable gap between two stops in this route, used to
  // upgrade R3 (warn) → R4 (error). Defaults to 5 minutes of slack
  // when omitted; the FE/BE callers should keep the field populated
  // from the franchise's drive-time engine output once available.
  min_drive_gap_min?: number;
}

export interface CustomerSlaWindow {
  // Non-overlapping windows the customer is unavailable. Inclusive of
  // both ends. A reschedule intent that puts an appointment inside
  // any of these windows fires `customer_sla_violation`.
  start_iso: string; // ISO8601 datetime
  end_iso: string;
  reason?: string;
}

export interface CustomerSla {
  customer_id: number;
  blackout_windows: CustomerSlaWindow[];
}

export interface FleetTechCap {
  technician_id: number;
  // Number of fleet appointments already committed this week for the
  // (fleet_company_id, technician_id) pair, NOT counting any draft
  // intents in the current session.
  week_committed_count: number;
}

export interface FleetAccountState {
  fleet_company_id: number;
  per_tech_weekly_cap: number;
  per_tech_counts: FleetTechCap[];
}

export interface FleetState {
  accounts: FleetAccountState[];
}

export interface LinterWorldSnapshot {
  appointments: LinterAppointment[];
  routes: LinterRoute[];
  customerSlas: CustomerSla[];
  fleet: FleetState;
}

// ---------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------

export function lintSession(
  session: ReorganizationSession,
  intents: ReorganizationIntent[],
  worldSnapshot: LinterWorldSnapshot,
): LinterIssue[] {
  // Touch `session` so future rules (e.g. policy-snapshot-driven severity
  // overrides per master plan §4.7) have it on the signature without a
  // breaking change. v1 doesn't read it; suppress unused-arg lint via
  // assignment to void.
  void session;

  const issues: LinterIssue[] = [];
  issues.push(...lintTimeConflicts(intents, worldSnapshot));
  issues.push(...lintDriveTimeImpossible(intents, worldSnapshot));
  issues.push(...lintCustomerSlaViolations(intents, worldSnapshot));
  issues.push(...lintFleetCapacity(intents, worldSnapshot));
  issues.push(...lintRecurringSeriesInconsistency(intents, worldSnapshot));
  return issues;
}

// ---------------------------------------------------------------------------
// Rule 1 — time_conflict (R1 + R2).
// Two intents in the same session put the same technician into overlapping
// time, OR an intent puts a tech into overlap with an already-committed
// appointment outside the session.
// ---------------------------------------------------------------------------

function lintTimeConflicts(
  intents: ReorganizationIntent[],
  world: LinterWorldSnapshot,
): LinterIssue[] {
  const issues: LinterIssue[] = [];

  // Project each intent into a per-tech timeline slot (skipping intents
  // that don't materialize one — e.g. cancels and personal-event mutations).
  const slots = projectIntentsToTechSlots(intents, world);

  // R1 — pairwise overlap inside the session.
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      const a = slots[i];
      const b = slots[j];
      if (a.technician_id !== b.technician_id) continue;
      if (a.date !== b.date) continue;
      if (!intervalsOverlap(a.startMin, a.endMin, b.startMin, b.endMin)) continue;

      const fix = suggestSlotShift(a, b);
      issues.push({
        severity: "error",
        kind: "time_conflict",
        affectedAppointmentIds: dedupeAppointmentIds([a.appointment_id, b.appointment_id]),
        humanMessage: `Two changes in this session put technician ${a.technician_id} into overlapping work on ${a.date} (${a.startTime}-${a.endTime} vs ${b.startTime}-${b.endTime}).`,
        suggestedAutoFix: fix,
        collisionWith: "staged_intent",
      });
    }
  }

  // R2 — overlap with already-committed appointments OUTSIDE this session.
  // Build a lookup of appointment ids touched by the session so we don't
  // double-count an appointment against its own pre-mutation row.
  const sessionTouchedIds = new Set<number>();
  for (const intent of intents) {
    if (intent.appointment_id !== null) sessionTouchedIds.add(intent.appointment_id);
  }

  for (const slot of slots) {
    for (const committed of world.appointments) {
      if (sessionTouchedIds.has(committed.id)) continue;
      if (committed.technician_id !== slot.technician_id) continue;
      if (committed.scheduled_date !== slot.date) continue;
      const cStart = parseHmToMinutes(committed.scheduled_start_time);
      const cEnd = parseHmToMinutes(committed.scheduled_end_time);
      if (!intervalsOverlap(slot.startMin, slot.endMin, cStart, cEnd)) continue;

      issues.push({
        severity: "error",
        kind: "time_conflict",
        affectedAppointmentIds: dedupeAppointmentIds([slot.appointment_id, committed.id]),
        humanMessage: `Proposed time ${slot.startTime}-${slot.endTime} for technician ${slot.technician_id} on ${slot.date} overlaps committed appointment #${committed.id} (${committed.scheduled_start_time}-${committed.scheduled_end_time}).`,
        suggestedAutoFix: shiftIntentByMinutes(slot, cEnd - slot.startMin + 5),
        collisionWith: "committed",
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Rule 2 — drive_time_impossible (R3 + R4).
// An intent's new time creates a tight (or impossibly short) drive-time
// window with the next stop on its route. R3 = warning, R4 = error.
// ---------------------------------------------------------------------------

function lintDriveTimeImpossible(
  intents: ReorganizationIntent[],
  world: LinterWorldSnapshot,
): LinterIssue[] {
  const issues: LinterIssue[] = [];
  const slots = projectIntentsToTechSlots(intents, world);

  for (const slot of slots) {
    // Locate the route the slot's appointment belongs to (if any).
    const route = world.routes.find(
      (r) =>
        r.technician_id === slot.technician_id &&
        r.date === slot.date &&
        r.stops.some((s) => s.appointment_id === slot.appointment_id),
    );
    if (!route) continue;
    const stop = route.stops.find((s) => s.appointment_id === slot.appointment_id);
    if (!stop) continue;

    // Find the next stop on the route after this one.
    const next = route.stops
      .filter((s) => s.stop_order > stop.stop_order)
      .sort((a, b) => a.stop_order - b.stop_order)[0];
    if (!next) continue;

    const nextAppt = world.appointments.find((a) => a.id === next.appointment_id);
    if (!nextAppt) continue;
    const nextStartMin = parseHmToMinutes(nextAppt.scheduled_start_time);
    const gapMin = nextStartMin - slot.endMin;
    const driveMin = next.drive_time_from_previous_min ?? 0;
    const minGap = route.min_drive_gap_min ?? 5;

    if (gapMin < driveMin) {
      // R4 — gap is shorter than minimum drive time → impossible.
      issues.push({
        severity: "error",
        kind: "drive_time_impossible",
        affectedAppointmentIds: [slot.appointment_id, next.appointment_id],
        humanMessage: `New end time ${slot.endTime} leaves only ${gapMin} min before appointment #${next.appointment_id} starts at ${nextAppt.scheduled_start_time}, but the drive is ${driveMin} min.`,
        suggestedAutoFix: shiftIntentByMinutes(slot, gapMin - driveMin),
      });
    } else if (gapMin < driveMin + minGap) {
      // R3 — feasible but tight (no slack beyond drive time).
      issues.push({
        severity: "warning",
        kind: "drive_time_impossible",
        affectedAppointmentIds: [slot.appointment_id, next.appointment_id],
        humanMessage: `New end time ${slot.endTime} leaves ${gapMin} min before appointment #${next.appointment_id}; drive is ${driveMin} min (less than ${minGap} min slack).`,
        suggestedAutoFix: shiftIntentByMinutes(slot, gapMin - driveMin - minGap),
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Rule 3 — customer_sla_violation (R10).
// Reschedule intent moves an appointment into a customer-marked
// blackout window. Always an error in v1.
// ---------------------------------------------------------------------------

function lintCustomerSlaViolations(
  intents: ReorganizationIntent[],
  world: LinterWorldSnapshot,
): LinterIssue[] {
  const issues: LinterIssue[] = [];

  for (const intent of intents) {
    if (intent.payload.kind !== "reschedule") continue;
    if (intent.appointment_id === null) continue;
    const appt = world.appointments.find((a) => a.id === intent.appointment_id);
    if (!appt) continue;
    const sla = world.customerSlas.find((s) => s.customer_id === appt.customer_id);
    if (!sla) continue;

    const newStartIso = combineToIso(intent.payload.new_scheduled_date, intent.payload.new_start_time);
    const newEndIso = combineToIso(intent.payload.new_scheduled_date, intent.payload.new_end_time);

    for (const window of sla.blackout_windows) {
      if (
        intervalsOverlap(
          isoToEpochMinutes(newStartIso),
          isoToEpochMinutes(newEndIso),
          isoToEpochMinutes(window.start_iso),
          isoToEpochMinutes(window.end_iso),
        )
      ) {
        const reasonSuffix = window.reason ? ` (${window.reason})` : "";
        issues.push({
          severity: "error",
          kind: "customer_sla_violation",
          affectedAppointmentIds: [appt.id],
          humanMessage: `Proposed time ${intent.payload.new_start_time}-${intent.payload.new_end_time} on ${intent.payload.new_scheduled_date} falls inside customer ${appt.customer_id}'s blackout window ${window.start_iso} → ${window.end_iso}${reasonSuffix}.`,
        });
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Rule 4 — fleet_capacity (R9).
// Reassign intent puts a fleet appointment with a tech who would
// exceed the fleet account's per-tech weekly cap. Warning, not error.
// ---------------------------------------------------------------------------

function lintFleetCapacity(
  intents: ReorganizationIntent[],
  world: LinterWorldSnapshot,
): LinterIssue[] {
  const issues: LinterIssue[] = [];

  // Track per-(fleet, tech) draft additions across the session so that
  // multiple reassign intents to the same tech accumulate.
  const draftDelta = new Map<string, number>();
  const tally = (fleetId: number, techId: number, delta: number): number => {
    const key = `${fleetId}:${techId}`;
    const next = (draftDelta.get(key) ?? 0) + delta;
    draftDelta.set(key, next);
    return next;
  };

  for (const intent of intents) {
    let appt: LinterAppointment | undefined;
    let newTechId: number | null = null;

    if (intent.payload.kind === "reassign") {
      if (intent.appointment_id === null) continue;
      appt = world.appointments.find((a) => a.id === intent.appointment_id);
      newTechId = intent.payload.new_technician_id;
    } else if (intent.payload.kind === "reschedule" && intent.payload.new_technician_id !== undefined) {
      // Combo reschedule + reassign also retargets the tech.
      if (intent.appointment_id === null) continue;
      appt = world.appointments.find((a) => a.id === intent.appointment_id);
      newTechId = intent.payload.new_technician_id;
    } else if (intent.payload.kind === "create") {
      // Brand-new fleet appointment also counts toward capacity.
      newTechId = intent.payload.technician_id;
      appt = newTechId === null ? undefined : ({
        id: -1,
        customer_id: intent.payload.customer_id,
        technician_id: newTechId,
        franchise_id: null,
        fleet_company_id: null,
        status: "draft",
        scheduled_date: intent.payload.scheduled_date,
        scheduled_start_time: intent.payload.scheduled_start_time,
        scheduled_end_time: intent.payload.scheduled_end_time,
      } satisfies LinterAppointment);
    } else {
      continue;
    }

    if (!appt || newTechId === null) continue;
    const fleetId = appt.fleet_company_id;
    if (fleetId === undefined || fleetId === null) continue;

    const account = world.fleet.accounts.find((a) => a.fleet_company_id === fleetId);
    if (!account) continue;
    const baseline =
      account.per_tech_counts.find((c) => c.technician_id === newTechId)?.week_committed_count ?? 0;
    const newDraftCount = tally(fleetId, newTechId, 1);
    const projected = baseline + newDraftCount;

    if (projected > account.per_tech_weekly_cap) {
      issues.push({
        severity: "warning",
        kind: "fleet_capacity",
        affectedAppointmentIds: appt.id > 0 ? [appt.id] : [],
        humanMessage: `Reassigning fleet ${fleetId}'s appointment to technician ${newTechId} would put them at ${projected}/${account.per_tech_weekly_cap} fleet jobs this week (cap exceeded).`,
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Rule 5 — recurring_series_inconsistency (R6).
// Session contains both an "edit all in series" intent and an
// "edit one occurrence" intent on the same recurrence_series_id.
// ---------------------------------------------------------------------------

function lintRecurringSeriesInconsistency(
  intents: ReorganizationIntent[],
  world: LinterWorldSnapshot,
): LinterIssue[] {
  const issues: LinterIssue[] = [];

  // Group reschedule + cancel intents by their underlying recurrence series.
  // The intent payload doesn't carry the series id directly; it's derived
  // from the appointment row in the world snapshot.
  const bySeries = new Map<string, { editAll: number[]; editOne: number[]; affected: number[] }>();

  for (const intent of intents) {
    if (intent.appointment_id === null) continue;
    if (intent.payload.kind !== "reschedule" && intent.payload.kind !== "cancel") continue;
    const appt = world.appointments.find((a) => a.id === intent.appointment_id);
    if (!appt) continue;
    const seriesId = appt.recurrence_series_id ?? null;
    if (!seriesId) continue;

    const bucket =
      bySeries.get(seriesId) ?? ({ editAll: [], editOne: [], affected: [] } as {
        editAll: number[];
        editOne: number[];
        affected: number[];
      });
    // The "edit all" intent is conventionally encoded in source_metadata
    // of the parent session OR by an intent whose appointment_id is the
    // series-master row; in v1 we lean on the intent metadata flag
    // captured into prior_state_snapshot.scope === 'series'. Fixtures
    // pin both shapes.
    const scope = (intent.prior_state_snapshot as { scope?: string } | null)?.scope;
    if (scope === "series") bucket.editAll.push(intent.id);
    else bucket.editOne.push(intent.id);
    bucket.affected.push(appt.id);
    bySeries.set(seriesId, bucket);
  }

  for (const [seriesId, bucket] of bySeries) {
    if (bucket.editAll.length > 0 && bucket.editOne.length > 0) {
      issues.push({
        severity: "error",
        kind: "recurring_series_inconsistency",
        affectedAppointmentIds: dedupeAppointmentIds(bucket.affected),
        humanMessage: `Recurrence series ${seriesId} has both an "edit entire series" change (intents: ${bucket.editAll.join(", ")}) and one or more "edit single occurrence" changes (intents: ${bucket.editOne.join(", ")}). Pick one strategy.`,
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Helpers — pure, no I/O.
// ---------------------------------------------------------------------------

interface TechSlot {
  intent_id: number;
  appointment_id: number;
  technician_id: number;
  date: string;
  startMin: number;
  endMin: number;
  startTime: string;
  endTime: string;
  intentPayload: ReorganizationIntentPayload;
}

function projectIntentsToTechSlots(
  intents: ReorganizationIntent[],
  world: LinterWorldSnapshot,
): TechSlot[] {
  const slots: TechSlot[] = [];

  for (const intent of intents) {
    if (intent.payload.kind === "reschedule") {
      if (intent.appointment_id === null) continue;
      const appt = world.appointments.find((a) => a.id === intent.appointment_id);
      const techId = intent.payload.new_technician_id ?? appt?.technician_id ?? null;
      if (techId === null) continue;
      slots.push({
        intent_id: intent.id,
        appointment_id: intent.appointment_id,
        technician_id: techId,
        date: intent.payload.new_scheduled_date,
        startMin: parseHmToMinutes(intent.payload.new_start_time),
        endMin: parseHmToMinutes(intent.payload.new_end_time),
        startTime: intent.payload.new_start_time,
        endTime: intent.payload.new_end_time,
        intentPayload: intent.payload,
      });
    } else if (intent.payload.kind === "reassign") {
      if (intent.appointment_id === null) continue;
      const appt = world.appointments.find((a) => a.id === intent.appointment_id);
      if (!appt) continue;
      slots.push({
        intent_id: intent.id,
        appointment_id: intent.appointment_id,
        technician_id: intent.payload.new_technician_id,
        date: appt.scheduled_date,
        startMin: parseHmToMinutes(appt.scheduled_start_time),
        endMin: parseHmToMinutes(appt.scheduled_end_time),
        startTime: appt.scheduled_start_time,
        endTime: appt.scheduled_end_time,
        intentPayload: intent.payload,
      });
    } else if (intent.payload.kind === "create") {
      if (intent.payload.technician_id === null) continue;
      slots.push({
        intent_id: intent.id,
        // `create` intents don't have an appointment_id yet (assigned at
        // commit). Use a synthetic negative id derived from intent.id so
        // overlap output stays unique and traceable to the intent.
        appointment_id: -intent.id,
        technician_id: intent.payload.technician_id,
        date: intent.payload.scheduled_date,
        startMin: parseHmToMinutes(intent.payload.scheduled_start_time),
        endMin: parseHmToMinutes(intent.payload.scheduled_end_time),
        startTime: intent.payload.scheduled_start_time,
        endTime: intent.payload.scheduled_end_time,
        intentPayload: intent.payload,
      });
    }
    // cancel + personal_event_* intents do not project a tech slot
    // for the linter's overlap rules.
  }

  return slots;
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function parseHmToMinutes(value: string): number {
  // Accepts "HH:mm" or "HH:mm:ss". Anything else throws — the caller
  // provides bad input and we want fixtures to surface it loudly.
  const parts = value.split(":");
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`logistics-linter: cannot parse time "${value}"`);
  }
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    throw new Error(`logistics-linter: non-numeric time "${value}"`);
  }
  return h * 60 + m;
}

function combineToIso(date: string, time: string): string {
  // Naive ISO assembly — tests/fixtures assume the snapshot is in the
  // franchise's local TZ and the linter compares apples-to-apples.
  // Production callers normalize before passing in.
  const parts = time.split(":");
  const hh = (parts[0] ?? "00").padStart(2, "0");
  const mm = (parts[1] ?? "00").padStart(2, "0");
  const ss = (parts[2] ?? "00").padStart(2, "0");
  return `${date}T${hh}:${mm}:${ss}`;
}

function isoToEpochMinutes(iso: string): number {
  // Parse a naive local ISO ("YYYY-MM-DDTHH:mm:ss") into minutes-since-
  // epoch using UTC as a stable reference frame. The caller guarantees
  // both sides of the comparison are in the same TZ, so absolute UTC
  // alignment is a no-op for comparison purposes.
  const ms = Date.parse(`${iso}Z`);
  if (!Number.isFinite(ms)) {
    throw new Error(`logistics-linter: cannot parse iso "${iso}"`);
  }
  return Math.floor(ms / 60_000);
}

function dedupeAppointmentIds(ids: number[]): number[] {
  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

function suggestSlotShift(a: TechSlot, b: TechSlot): ReorganizationIntentPayload | undefined {
  // Suggest moving the *later* slot to start when the earlier one ends,
  // preserving its duration. Only emit the suggestion if the intent kind
  // is reschedule (we don't propose auto-fixes for create/reassign here —
  // the review UI in P3-FE-5 surfaces those manually).
  const later = a.startMin >= b.startMin ? a : b;
  const earlier = later === a ? b : a;
  if (later.intentPayload.kind !== "reschedule") return undefined;
  const newStart = earlier.endMin + 5; // 5-min cushion
  const duration = later.endMin - later.startMin;
  return {
    kind: "reschedule",
    new_scheduled_date: later.intentPayload.new_scheduled_date,
    new_start_time: minutesToHm(newStart),
    new_end_time: minutesToHm(newStart + duration),
    new_technician_id: later.intentPayload.new_technician_id,
  };
}

function shiftIntentByMinutes(slot: TechSlot, minutes: number): ReorganizationIntentPayload | undefined {
  if (slot.intentPayload.kind !== "reschedule") return undefined;
  const newStart = slot.startMin + minutes;
  const duration = slot.endMin - slot.startMin;
  return {
    kind: "reschedule",
    new_scheduled_date: slot.intentPayload.new_scheduled_date,
    new_start_time: minutesToHm(newStart),
    new_end_time: minutesToHm(newStart + duration),
    new_technician_id: slot.intentPayload.new_technician_id,
  };
}

function minutesToHm(total: number): string {
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
