/**
 * `buildModifyIntentPayloadForGhostDrag` (PR-UX-2 PASS 2.8, task `c7`).
 *
 * When the user drags a move-chain destination ghost on the calendar
 * canvas, we want the underlying `ReorganizationIntent`'s destination
 * payload to update (NOT to create a new intent). The drag-end handler
 * captures a `GhostDragDestination` from the gesture; this helper
 * folds it into the existing intent and returns the replacement
 * `ReorganizationIntentPayload` to send via the BE's
 * `PATCH /reorganizations/:id` `op: "modify_intent"` endpoint.
 *
 * Per-kind rules (matches `projectIntentsToTechSlots` in
 * `detect-move-chains.ts` — only the kinds that actually project a
 * destination ghost are handled; cancel/personal_event_delete/
 * personal_event_update never produce a draggable ghost):
 *
 *   - `reschedule` — replace `new_scheduled_date`,
 *     `new_start_time`, `new_end_time`, and `new_technician_id`
 *     (omitted entirely when the drag landed on the appointment's
 *     original tech, mirroring the form-sheet behaviour).
 *
 *   - `reassign` — if the drag is same-date + same-time as the
 *     source appointment, mutate `new_technician_id` only (the
 *     payload stays a `reassign`). If date/time changed, ESCALATE
 *     to a `reschedule` payload — `reassign` has no date/time
 *     fields so we'd lose the user's gesture otherwise. Escalation
 *     is intentional: drag-on-ghost is a destination-mutation
 *     primitive, not a "preserve the original intent_type" promise.
 *
 *   - `create` — replace `scheduled_date`, `scheduled_start_time`,
 *     `scheduled_end_time`, and `technician_id`.
 *
 * Returns `null` (with a `console.warn`) when the intent's payload
 * kind doesn't have a destination, or when the source-appointment
 * lookup is missing for a `reassign` (we can't tell whether the
 * gesture is same-date-same-time without the source row, and
 * silently escalating could surprise the user).
 *
 * Pure function — no React, no store reads, no I/O. Tested in
 * `__tests__/move-chain-ghost-drag.test.ts`.
 */

import type {
  ReorganizationIntent,
  ReorganizationIntentPayload,
} from "@technician/types/reorganization";

/**
 * The post-drag destination, in the same shape the calendar's
 * drag-end handler computes for normal appointment drags. All
 * fields are clamped + snapped at the call site (see
 * `RC_WORK_START` / `RC_WORK_END` clamps in `handleRCDragEnd`),
 * so this helper does no further normalization.
 */
export interface GhostDragDestination {
  /** YYYY-MM-DD (the drag's `date` field, or the calendar's selected date). */
  date: string;
  /** Minutes-of-day (0..1440) for the dropped tile's start edge. */
  startMinutes: number;
  /** Minutes-of-day (0..1440) for the dropped tile's end edge. */
  endMinutes: number;
  /**
   * The resource (technician) the drag landed on. `null` when the
   * gesture didn't land on any tech column (e.g. landscape gutter)
   * — the caller should treat that as a no-op rather than calling
   * this helper.
   */
  technicianId: number | null;
}

/**
 * The minimum source-appointment shape this helper needs to detect
 * "same-date + same-time" for the `reassign` escalation guard.
 * Matches the relevant fields of `LinterAppointment` /
 * `CalendarAppointmentItem` so callers can pass either shape
 * without an adapter.
 */
export interface GhostDragSourceAppointment {
  technician_id: number;
  scheduled_date: string;
  /** HH:mm or HH:mm:ss */
  scheduled_time?: string | null;
  scheduled_start_time?: string;
  scheduled_end_time?: string;
}

/**
 * Convert a HH:mm or HH:mm:ss string to minutes-of-day. Mirrors
 * `parseHmToMinutes` in `detect-move-chains.ts` — copied here
 * (not imported) so this helper stays free of detect-move-chains
 * coupling and can ship tests in isolation.
 */
function parseHmToMinutes(hm: string | null | undefined): number | null {
  if (!hm) return null;
  const [hStr, mStr] = hm.split(":");
  const h = parseInt(hStr ?? "", 10);
  const m = parseInt(mStr ?? "0", 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function minutesToHmm(min: number): string {
  const clamped = Math.max(0, Math.min(min, 24 * 60));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

export function buildModifyIntentPayloadForGhostDrag(
  intent: ReorganizationIntent,
  dest: GhostDragDestination,
  sourceAppointment: GhostDragSourceAppointment | null,
): ReorganizationIntentPayload | null {
  if (dest.technicianId === null) {
    if (__DEV__) {
      console.warn(
        "[MoveChain:GhostDrag] no technicianId on drop — ignoring",
        { intentId: intent.id, kind: intent.payload.kind },
      );
    }
    return null;
  }

  const newDate = dest.date;
  const newStartHHmm = minutesToHmm(dest.startMinutes);
  const newEndHHmm = minutesToHmm(dest.endMinutes);

  const payload = intent.payload;

  // 2026-05-05 (PR-UX-2 PASS 2.13): every payload kind that targets an
  // existing appointment MUST round-trip `appointment_id` inside the
  // payload itself. The BE's zod schemas (`reschedulePayloadSchema` /
  // `reassignPayloadSchema` in REMIBackend/src/schemas/reorganization.schema.ts)
  // require it, and the BE service's `deriveTargetsFromPayload` reads
  // it off the payload (not off any sibling field). The dev-seed wire
  // wrapper (`intentToWirePayload` in app/pending-reality/review.tsx)
  // already stitches the same field for the create path; this helper
  // is the parallel seam for the modify path. Without it the BE 422s
  // every ghost-drag with `Request failed with status code 422` and
  // the FE alert reads "The change didn't save" — confirmed on-device
  // 2026-05-05 13:38 with intent 501 / appt 42524 / session 370.
  // Personal-event payloads (currently unreachable here — the switch
  // below explicitly rejects them — but kept conditional in case a
  // future kind needs `personal_event_id` instead of `appointment_id`).
  const apptIdField =
    intent.appointment_id !== null
      ? { appointment_id: intent.appointment_id }
      : intent.personal_event_id !== null
        ? { personal_event_id: intent.personal_event_id }
        : {};

  switch (payload.kind) {
    case "reschedule": {
      // Mirror the form-sheet convention: omit `new_technician_id`
      // when the drop landed on the appointment's original tech.
      // The detection algorithm (`projectIntentsToTechSlots`) falls
      // back to the source appointment's tech in that case anyway,
      // so omitting keeps the wire payload minimal.
      const originalTechId = sourceAppointment?.technician_id ?? null;
      const techChanged =
        originalTechId === null || originalTechId !== dest.technicianId;
      return {
        kind: "reschedule",
        ...apptIdField,
        new_scheduled_date: newDate,
        new_start_time: newStartHHmm,
        new_end_time: newEndHHmm,
        ...(techChanged ? { new_technician_id: dest.technicianId } : {}),
      } as ReorganizationIntentPayload;
    }

    case "reassign": {
      if (!sourceAppointment) {
        if (__DEV__) {
          console.warn(
            "[MoveChain:GhostDrag] reassign ghost dragged with no sourceAppointment — cannot decide same-time-vs-escalate; ignoring",
            { intentId: intent.id },
          );
        }
        return null;
      }
      const sourceStartMin = parseHmToMinutes(
        sourceAppointment.scheduled_start_time ??
          sourceAppointment.scheduled_time,
      );
      const sourceEndMin = parseHmToMinutes(
        sourceAppointment.scheduled_end_time,
      );
      const sameDate = sourceAppointment.scheduled_date === newDate;
      const sameStart =
        sourceStartMin !== null && sourceStartMin === dest.startMinutes;
      const sameEnd =
        sourceEndMin === null || sourceEndMin === dest.endMinutes;

      if (sameDate && sameStart && sameEnd) {
        // Pure cross-tech move — keep the lighter `reassign` shape.
        return {
          kind: "reassign",
          ...apptIdField,
          new_technician_id: dest.technicianId,
        } as ReorganizationIntentPayload;
      }

      // Date/time changed — escalate to a reschedule. See helper
      // docstring for rationale.
      return {
        kind: "reschedule",
        ...apptIdField,
        new_scheduled_date: newDate,
        new_start_time: newStartHHmm,
        new_end_time: newEndHHmm,
        new_technician_id: dest.technicianId,
      } as ReorganizationIntentPayload;
    }

    case "create": {
      // `create` payloads have no existing appointment to identify;
      // the BE generates the row on commit. No `appointment_id`
      // stitch needed (and adding it would make the zod schema 422).
      return {
        ...payload,
        scheduled_date: newDate,
        scheduled_start_time: newStartHHmm,
        scheduled_end_time: newEndHHmm,
        technician_id: dest.technicianId,
      };
    }

    case "cancel":
    case "personal_event_create":
    case "personal_event_update":
    case "personal_event_delete":
      if (__DEV__) {
        console.warn(
          "[MoveChain:GhostDrag] payload kind has no draggable destination — ignoring",
          { intentId: intent.id, kind: payload.kind },
        );
      }
      return null;
  }
}
