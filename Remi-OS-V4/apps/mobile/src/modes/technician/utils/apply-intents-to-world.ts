/**
 * `applyIntentsToWorld` — pure projection from current world to
 * post-commit world (PR-UX-5 / Now⇄Future calendar toggle).
 *
 * Takes a `CalendarDayResponse[]` snapshot (the canonical shape both
 * `useFranchiseWeekView` and the day query return) plus an array of
 * staged `ReorganizationIntent`s, and returns a new
 * `CalendarDayResponse[]` representing what the calendar will look
 * like *after* the session commits.
 *
 * Compared to `projectIntentsToTechSlots` in
 * `src/utils/logistics-linter.ts`, which only emits collision-checking
 * tech slots for reschedule / reassign / create, this projector
 * handles every intent kind end-to-end so the calendar canvas can
 * render directly from the projected snapshot:
 *
 *   - `reschedule` (with or without `new_technician_id`) — moves the
 *     appointment to its new tech / date / time. The card disappears
 *     from its current slot and reappears at the destination.
 *   - `reassign` — moves the appointment to the new tech, same date /
 *     time.
 *   - `cancel` — the appointment is removed entirely from the
 *     projected world. (The user is previewing the post-commit
 *     calendar; cancelled cards have no place there. The Sequence
 *     tab still lists the cancellation as an audit trail.)
 *   - `create` — adds a synthetic appointment with a NEGATIVE
 *     `id` derived from the intent id (`-(GHOST_ID_OFFSET +
 *     intent.id)` is reserved for chain ghosts; we use
 *     `-(CREATE_ID_OFFSET + intent.id)` to stay clear of that
 *     range and of `SYNTHETIC_DRAFT_EVENT_ID = -1`). The synthetic
 *     carries placeholder customer / service metadata since the
 *     payload doesn't carry a fully-resolved customer record yet —
 *     this is fine for visual preview and the card is plainly
 *     marked as a draft.
 *   - `personal_event_create` / `_update` / `_delete` — applies the
 *     mutation to the destination tech's `personal_events` array.
 *     `_create` synthesizes a UUID-shaped placeholder id
 *     (`pending-create-${intent.id}`).
 *
 * **Off-window destinations.** When an intent targets a date NOT
 * present in the input `weekData` (e.g., a chain destination spilling
 * onto next week while the user is viewing this week), the destination
 * card is dropped from the projection and surfaced via the return
 * value's `offScreen` array. The calendar tab can render a small
 * "N changes off-screen this week →" pip from this metadata. This is
 * preferable to silently injecting a card into a day the user can't
 * see.
 *
 * **Pure function. No React. No I/O. Easy to test.**
 *
 * Returns a fresh `CalendarDayResponse[]` (no mutation of the input)
 * plus an `offScreen` summary. Order of days is preserved; order of
 * appointments / personal events within each tech column matches the
 * input where possible (we re-sort by start time on the destination
 * column so injected cards interleave correctly).
 */

import type {
  CalendarAppointmentItem,
  CalendarDayResponse,
  CalendarTechnicianColumn,
  PersonalEvent,
} from "@technician/types/calendar";
import type {
  ReorganizationIntent,
  ReorganizationIntentPayload,
} from "@technician/types/reorganization";

/**
 * Negative-id base for synthetic `create`-intent appointments in the
 * projected world. Stays clear of:
 *   - `SYNTHETIC_DRAFT_EVENT_ID = -1` (the tap-to-create draft).
 *   - `GHOST_ID_OFFSET = 1_000_000` from `move-chain-ghost-tiles.ts`
 *     (chain ghost destinations).
 *
 * We use `2_000_000` so a `create` intent with id 42 lands at
 * `-(2_000_000 + 42) = -2_000_042`, and `isProjectedCreateEventId`
 * can identify it without an ambiguous range overlap.
 */
export const CREATE_ID_OFFSET = 2_000_000;

export function projectedCreateEventIdFor(intentId: number): number {
  return -(CREATE_ID_OFFSET + intentId);
}

export function isProjectedCreateEventId(id: number): boolean {
  return id <= -CREATE_ID_OFFSET && id > -(CREATE_ID_OFFSET + 1_000_000);
}

/**
 * Synthetic personal-event id for `personal_event_create` intents.
 * Real personal events use a UUID; we use a sentinel-prefixed string
 * so callers can detect a projected-create at a glance.
 */
export function projectedPersonalEventIdFor(intentId: number): string {
  return `pending-create-${intentId}`;
}

export function isProjectedPersonalEventId(id: string): boolean {
  return id.startsWith("pending-create-");
}

/**
 * Per-intent record of a destination that landed outside the
 * projected weekData's date range. The toggle UI uses this to render
 * "N changes off-screen" pips on the week-nav arrows.
 */
export interface OffScreenDrop {
  intentId: number;
  appointmentId: number | null;
  date: string;
  reason: "destination_date_not_in_window";
}

export interface ApplyIntentsResult {
  days: CalendarDayResponse[];
  offScreen: OffScreenDrop[];
}

interface ApptLocator {
  appt: CalendarAppointmentItem;
  dayIndex: number;
  techIndex: number;
}

interface PersonalEventLocator {
  event: PersonalEvent;
  dayIndex: number;
  techIndex: number;
}

/**
 * Apply staged intents to a calendar week / day snapshot, returning
 * the projected post-commit world.
 *
 * @param days Source `CalendarDayResponse[]` from `useFranchiseWeekView`
 *             (week mode) or `[useDayView.data]` (day mode).
 * @param intents Staged `ReorganizationIntent[]` from
 *                `usePendingRealityStore.intents`. Order doesn't
 *                matter for the projection — we apply in commit order
 *                (cancellations first, then reschedules, etc.) which
 *                matches §6.4.1 BE behavior so the visual matches what
 *                the BE will actually compute.
 */
export function applyIntentsToWorld(
  days: CalendarDayResponse[],
  intents: readonly ReorganizationIntent[],
): ApplyIntentsResult {
  if (intents.length === 0) {
    return { days, offScreen: [] };
  }

  // Deep-clone the input so we can mutate freely. The function
  // returns the cloned tree; callers MUST NOT rely on identity.
  const cloned: CalendarDayResponse[] = days.map((day) => ({
    ...day,
    technicians: day.technicians.map((tech) => ({
      ...tech,
      appointments: tech.appointments.map((appt) => ({ ...appt })),
      personal_events: tech.personal_events.map((pe) => ({ ...pe })),
    })),
  }));
  const offScreen: OffScreenDrop[] = [];

  // Apply in §6.4.1 commit order so the visual matches BE behavior:
  //   cancel → reschedule → reschedule+tech-change → reassign →
  //   create → personal_event_delete → personal_event_update →
  //   personal_event_create.
  const ordered = [...intents].sort(
    (a, b) => commitGroupOf(a.payload) - commitGroupOf(b.payload),
  );

  for (const intent of ordered) {
    applyOneIntent(cloned, intent, offScreen);
  }

  // 2026-05-10 — defensive dedup pass. User-reported smoke-pass bug:
  // toggling Future view on a long chain rendered a customer card
  // ("Daniel Kim") TWICE. The mental model of `applyOneIntent`
  // remove-then-push should keep each appointment id at exactly one
  // location, but a duplicate-input edge case (BE returning the same
  // appointment row in two tech columns when a pending move is staged
  // across techs, or a chain that involves a sequence of reschedule
  // and reassign on the same appointment id where the intermediate
  // state leaves the row reachable from two columns) can leak a
  // duplicate. Dedupe by `appointment.id` across the WHOLE projected
  // week (each id may legitimately appear once per day, so we
  // dedupe per-day rather than globally) — keep the LAST occurrence
  // because that's the most-recently-applied projection. Personal
  // events get the same treatment scoped per-day per-tech (a single
  // PE id may only appear in one tech column per day; cross-day
  // recurrences are different ids by construction).
  //
  // Logging: in __DEV__, emit a warning when the dedup actually
  // removes anything so the next agent can hunt down the upstream
  // double-write. Empty dedups are silent.
  for (const day of cloned) {
    const apptSeenInDay = new Map<number, { techIndex: number; arrayIndex: number }>();
    for (let ti = 0; ti < day.technicians.length; ti += 1) {
      const tech = day.technicians[ti];
      for (let ai = tech.appointments.length - 1; ai >= 0; ai -= 1) {
        const appt = tech.appointments[ai];
        const key = appt.id;
        const seen = apptSeenInDay.get(key);
        if (!seen) {
          apptSeenInDay.set(key, { techIndex: ti, arrayIndex: ai });
          continue;
        }
        // Already seen on a later (= more recently appended) tech
        // column / row — keep that one and drop this earlier copy.
        // Iteration is reverse so the FIRST hit per id (in iteration
        // order) is the LAST occurrence in (techIndex, arrayIndex)
        // lex order, which is the most-recently-applied projection.
        if (__DEV__) {
          console.warn(
            "[applyIntentsToWorld] dropping duplicate appointment in projected day",
            {
              date: day.date,
              appointmentId: appt.id,
              droppedFrom: { techIndex: ti, arrayIndex: ai, techId: tech.technician_id },
              keptAt: seen,
            },
          );
        }
        tech.appointments.splice(ai, 1);
      }
    }
    for (const tech of day.technicians) {
      const peSeen = new Set<string>();
      for (let pi = tech.personal_events.length - 1; pi >= 0; pi -= 1) {
        const pe = tech.personal_events[pi];
        if (peSeen.has(pe.id)) {
          if (__DEV__) {
            console.warn(
              "[applyIntentsToWorld] dropping duplicate personal event in projected day",
              { date: day.date, personalEventId: pe.id, techId: tech.technician_id },
            );
          }
          tech.personal_events.splice(pi, 1);
          continue;
        }
        peSeen.add(pe.id);
      }
    }
  }

  // Re-sort each tech column's appointments + personal events by
  // start time so injected / moved cards interleave correctly.
  for (const day of cloned) {
    for (const tech of day.technicians) {
      tech.appointments.sort(compareApptByStartTime);
      tech.personal_events.sort(comparePersonalEventByStartTime);
    }
  }

  return { days: cloned, offScreen };
}

function applyOneIntent(
  days: CalendarDayResponse[],
  intent: ReorganizationIntent,
  offScreen: OffScreenDrop[],
): void {
  const payload = intent.payload;
  switch (payload.kind) {
    case "cancel":
      applyCancel(days, intent);
      return;
    case "reschedule":
      applyReschedule(days, intent, payload, offScreen);
      return;
    case "reassign":
      applyReassign(days, intent, payload);
      return;
    case "create":
      applyCreate(days, intent, payload, offScreen);
      return;
    case "personal_event_delete":
      applyPersonalEventDelete(days, intent);
      return;
    case "personal_event_update":
      applyPersonalEventUpdate(days, intent, payload);
      return;
    case "personal_event_create":
      applyPersonalEventCreate(days, intent, payload, offScreen);
      return;
  }
}

function commitGroupOf(payload: ReorganizationIntentPayload): number {
  switch (payload.kind) {
    case "cancel":
      return 1;
    case "reschedule":
      return payload.new_technician_id != null ? 3 : 2;
    case "reassign":
      return 4;
    case "create":
      return 5;
    case "personal_event_delete":
      return 6;
    case "personal_event_update":
      return 7;
    case "personal_event_create":
      return 8;
  }
}

function applyCancel(
  days: CalendarDayResponse[],
  intent: ReorganizationIntent,
): void {
  if (intent.appointment_id == null) return;
  removeAppointmentById(days, intent.appointment_id);
}

function applyReschedule(
  days: CalendarDayResponse[],
  intent: ReorganizationIntent,
  payload: Extract<ReorganizationIntentPayload, { kind: "reschedule" }>,
  offScreen: OffScreenDrop[],
): void {
  if (intent.appointment_id == null) return;
  const located = findAppointmentById(days, intent.appointment_id);
  if (!located) {
    // The source isn't visible in the input window, but the
    // destination might be. Without the source we can't reconstruct
    // a faithful destination card (we'd be missing customer name,
    // service list, etc.), so we drop it. The Sequence tab still
    // lists the intent.
    offScreen.push({
      intentId: intent.id,
      appointmentId: intent.appointment_id,
      date: payload.new_scheduled_date,
      reason: "destination_date_not_in_window",
    });
    return;
  }
  const { appt, dayIndex, techIndex } = located;
  // Source is always in-window if we found it; remove from source.
  days[dayIndex].technicians[techIndex].appointments = days[
    dayIndex
  ].technicians[techIndex].appointments.filter((a) => a.id !== appt.id);

  // Destination tech defaults to the source's current tech when the
  // payload doesn't override.
  const destTechId = payload.new_technician_id ?? appt.technician_id;
  const destDayIndex = days.findIndex((d) => d.date === payload.new_scheduled_date);
  if (destDayIndex < 0) {
    // Card moved off-window. Source is gone (correct — that's the
    // post-commit world for this week), and the destination is
    // recorded for the off-screen pip.
    offScreen.push({
      intentId: intent.id,
      appointmentId: intent.appointment_id,
      date: payload.new_scheduled_date,
      reason: "destination_date_not_in_window",
    });
    return;
  }
  let destTechIndex = days[destDayIndex].technicians.findIndex(
    (t) => t.technician_id === destTechId,
  );
  if (destTechIndex < 0 && destTechId != null) {
    // Destination tech doesn't have a column on this day (e.g., off
    // duty). Synthesize an empty column so the card has somewhere to
    // land. Name falls back to the source tech's name; in practice
    // the FE roster lookup overrides this.
    days[destDayIndex].technicians.push(makeEmptyTechColumn(destTechId, appt.technician_name));
    destTechIndex = days[destDayIndex].technicians.length - 1;
  }
  if (destTechIndex < 0) {
    // No destination tech and no fallback — drop with off-screen.
    offScreen.push({
      intentId: intent.id,
      appointmentId: intent.appointment_id,
      date: payload.new_scheduled_date,
      reason: "destination_date_not_in_window",
    });
    return;
  }
  const moved: CalendarAppointmentItem = {
    ...appt,
    technician_id: destTechId,
    scheduled_date: payload.new_scheduled_date,
    scheduled_time: normalizeTime(payload.new_start_time),
    scheduled_end_time: normalizeTime(payload.new_end_time),
    pending_intent_summary: null,
  };
  days[destDayIndex].technicians[destTechIndex].appointments.push(moved);
}

function applyReassign(
  days: CalendarDayResponse[],
  intent: ReorganizationIntent,
  payload: Extract<ReorganizationIntentPayload, { kind: "reassign" }>,
): void {
  if (intent.appointment_id == null) return;
  const located = findAppointmentById(days, intent.appointment_id);
  if (!located) return;
  const { appt, dayIndex, techIndex } = located;
  days[dayIndex].technicians[techIndex].appointments = days[
    dayIndex
  ].technicians[techIndex].appointments.filter((a) => a.id !== appt.id);

  let destTechIndex = days[dayIndex].technicians.findIndex(
    (t) => t.technician_id === payload.new_technician_id,
  );
  if (destTechIndex < 0) {
    days[dayIndex].technicians.push(
      makeEmptyTechColumn(payload.new_technician_id, appt.technician_name),
    );
    destTechIndex = days[dayIndex].technicians.length - 1;
  }
  days[dayIndex].technicians[destTechIndex].appointments.push({
    ...appt,
    technician_id: payload.new_technician_id,
    pending_intent_summary: null,
  });
}

function applyCreate(
  days: CalendarDayResponse[],
  intent: ReorganizationIntent,
  payload: Extract<ReorganizationIntentPayload, { kind: "create" }>,
  offScreen: OffScreenDrop[],
): void {
  const destDayIndex = days.findIndex((d) => d.date === payload.scheduled_date);
  if (destDayIndex < 0) {
    offScreen.push({
      intentId: intent.id,
      appointmentId: null,
      date: payload.scheduled_date,
      reason: "destination_date_not_in_window",
    });
    return;
  }
  if (payload.technician_id == null) {
    // Auto-assign-at-commit. We can't render an unassigned card on
    // any tech's column — drop with off-screen so the user knows
    // there's a creation pending that doesn't have a slot yet.
    offScreen.push({
      intentId: intent.id,
      appointmentId: null,
      date: payload.scheduled_date,
      reason: "destination_date_not_in_window",
    });
    return;
  }
  let destTechIndex = days[destDayIndex].technicians.findIndex(
    (t) => t.technician_id === payload.technician_id,
  );
  if (destTechIndex < 0) {
    days[destDayIndex].technicians.push(
      makeEmptyTechColumn(payload.technician_id, null),
    );
    destTechIndex = days[destDayIndex].technicians.length - 1;
  }
  days[destDayIndex].technicians[destTechIndex].appointments.push(
    makeProjectedCreateAppointment(intent, payload),
  );
}

function applyPersonalEventDelete(
  days: CalendarDayResponse[],
  intent: ReorganizationIntent,
): void {
  if (intent.personal_event_id == null) return;
  removePersonalEventById(days, intent.personal_event_id);
}

function applyPersonalEventUpdate(
  days: CalendarDayResponse[],
  intent: ReorganizationIntent,
  payload: Extract<ReorganizationIntentPayload, { kind: "personal_event_update" }>,
): void {
  if (intent.personal_event_id == null) return;
  const located = findPersonalEventById(days, intent.personal_event_id);
  if (!located) return;
  const { event, dayIndex, techIndex } = located;
  const patch = payload.patch;
  const updated: PersonalEvent = {
    ...event,
    title: patch.title ?? event.title,
    date: patch.scheduled_date ?? event.date,
    start_time: patch.start_time ? normalizeTime(patch.start_time) : event.start_time,
    end_time: patch.end_time ? normalizeTime(patch.end_time) : event.end_time,
  };
  days[dayIndex].technicians[techIndex].personal_events = days[
    dayIndex
  ].technicians[techIndex].personal_events.filter((pe) => pe.id !== event.id);
  // If the date or technician changed, relocate.
  const destDayIndex = days.findIndex((d) => d.date === updated.date);
  if (destDayIndex < 0) return; // off-window
  const destTechId = patch.technician_id ?? days[dayIndex].technicians[techIndex].technician_id;
  let destTechIndex = days[destDayIndex].technicians.findIndex(
    (t) => t.technician_id === destTechId,
  );
  if (destTechIndex < 0) {
    days[destDayIndex].technicians.push(makeEmptyTechColumn(destTechId, null));
    destTechIndex = days[destDayIndex].technicians.length - 1;
  }
  days[destDayIndex].technicians[destTechIndex].personal_events.push(updated);
}

function applyPersonalEventCreate(
  days: CalendarDayResponse[],
  intent: ReorganizationIntent,
  payload: Extract<ReorganizationIntentPayload, { kind: "personal_event_create" }>,
  offScreen: OffScreenDrop[],
): void {
  const destDayIndex = days.findIndex((d) => d.date === payload.scheduled_date);
  if (destDayIndex < 0) {
    offScreen.push({
      intentId: intent.id,
      appointmentId: null,
      date: payload.scheduled_date,
      reason: "destination_date_not_in_window",
    });
    return;
  }
  let destTechIndex = days[destDayIndex].technicians.findIndex(
    (t) => t.technician_id === payload.technician_id,
  );
  if (destTechIndex < 0) {
    days[destDayIndex].technicians.push(
      makeEmptyTechColumn(payload.technician_id, null),
    );
    destTechIndex = days[destDayIndex].technicians.length - 1;
  }
  days[destDayIndex].technicians[destTechIndex].personal_events.push({
    id: projectedPersonalEventIdFor(intent.id),
    franchise_id: 0,
    created_by: 0,
    title: payload.title,
    date: payload.scheduled_date,
    start_time: normalizeTime(payload.start_time),
    end_time: normalizeTime(payload.end_time),
    duration_minutes: durationMinutes(payload.start_time, payload.end_time),
    recurrence_rule: null,
    notes: null,
    shared_with: payload.shared_with_technician_ids ?? [],
    created_at: intent.proposed_at,
    updated_at: intent.proposed_at,
  });
}

function findAppointmentById(
  days: CalendarDayResponse[],
  apptId: number,
): ApptLocator | null {
  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const day = days[dayIndex];
    for (let techIndex = 0; techIndex < day.technicians.length; techIndex++) {
      const tech = day.technicians[techIndex];
      const found = tech.appointments.find((a) => a.id === apptId);
      if (found) {
        return { appt: found, dayIndex, techIndex };
      }
    }
  }
  return null;
}

function removeAppointmentById(
  days: CalendarDayResponse[],
  apptId: number,
): void {
  for (const day of days) {
    for (const tech of day.technicians) {
      tech.appointments = tech.appointments.filter((a) => a.id !== apptId);
    }
  }
}

function findPersonalEventById(
  days: CalendarDayResponse[],
  eventId: string,
): PersonalEventLocator | null {
  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const day = days[dayIndex];
    for (let techIndex = 0; techIndex < day.technicians.length; techIndex++) {
      const tech = day.technicians[techIndex];
      const found = tech.personal_events.find((pe) => pe.id === eventId);
      if (found) {
        return { event: found, dayIndex, techIndex };
      }
    }
  }
  return null;
}

function removePersonalEventById(
  days: CalendarDayResponse[],
  eventId: string,
): void {
  for (const day of days) {
    for (const tech of day.technicians) {
      tech.personal_events = tech.personal_events.filter((pe) => pe.id !== eventId);
    }
  }
}

function makeEmptyTechColumn(
  techId: number,
  fallbackName: string | null,
): CalendarTechnicianColumn {
  return {
    technician_id: techId,
    technician_name: fallbackName ?? `Tech ${techId}`,
    profile_image_url: null,
    job_count: 0,
    completed_count: 0,
    appointments: [],
    personal_events: [],
  };
}

function makeProjectedCreateAppointment(
  intent: ReorganizationIntent,
  payload: Extract<ReorganizationIntentPayload, { kind: "create" }>,
): CalendarAppointmentItem {
  return {
    id: projectedCreateEventIdFor(intent.id),
    customer_id: payload.customer_id,
    customer_name: "New customer",
    customer_phone: null,
    has_card_on_file: false,
    technician_id: payload.technician_id,
    technician_name: null,
    franchise_id: null,
    status: "created",
    scheduled_date: payload.scheduled_date,
    scheduled_time: normalizeTime(payload.scheduled_start_time),
    scheduled_end_time: normalizeTime(payload.scheduled_end_time),
    started_at: null,
    completed_at: null,
    slot_type: "standard",
    booking_method: "manual",
    location_type: "customer",
    location_address: null,
    // 2026-05-25 — Calendar list endpoint serves these for the
    // detail-sheet fallback. Projected create-intents don't have a
    // joined address yet (the FE is staging a new appointment), so
    // both are null. The detail sheet renders "Address not on file"
    // for null + null in this case.
    address_line: null,
    address_city: null,
    notification_preference: "none",
    explanation: null,
    scoring_factors: null,
    appointment_note: payload.notes ?? null,
    cancellation_reason: null,
    cancelled_at: null,
    no_show_at: null,
    recurrence_rule: null,
    recurrence_series_id: null,
    fleet_account_id: null,
    booked_by: null,
    booked_by_name: null,
    services: payload.service_ids.map((id) => ({
      service_id: id,
      service_name: `Service #${id}`,
      price: 0,
      quantity: 1,
      technician_qualified: true,
    })),
    tax_lines: [],
    alerts: [],
    pending_intent_summary: null,
    created_at: intent.proposed_at,
    updated_at: intent.proposed_at,
  } as CalendarAppointmentItem;
}

function compareApptByStartTime(
  a: CalendarAppointmentItem,
  b: CalendarAppointmentItem,
): number {
  const at = a.scheduled_time ?? "00:00";
  const bt = b.scheduled_time ?? "00:00";
  if (at !== bt) return at < bt ? -1 : 1;
  return a.id - b.id;
}

function comparePersonalEventByStartTime(
  a: PersonalEvent,
  b: PersonalEvent,
): number {
  if (a.start_time !== b.start_time) return a.start_time < b.start_time ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

function normalizeTime(value: string): string {
  // Backend `timestamptz` HH:mm:ss vs FE-emitted HH:mm. Calendar
  // consumes `scheduled_time` as a string so we just keep whatever
  // the payload supplied. If shorter than 5 chars, pad to HH:mm.
  if (value.length >= 8) return value; // HH:mm:ss
  if (value.length === 5) return `${value}:00`; // HH:mm
  return value;
}

function durationMinutes(startHm: string, endHm: string): number {
  return parseHmToMin(endHm) - parseHmToMin(startHm);
}

function parseHmToMin(value: string): number {
  const parts = value.split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}
