/**
 * Tests for the `pending_intent_summary` plumbing in
 * `src/utils/resource-calendar-mapping.ts` (P3-FE-8 / C.12).
 *
 * The mapping wraps the BE annotation onto the produced
 * `RCEvent.meta.pendingIntentSummary` for appointments, and
 * deliberately omits it for personal events (the overlay is
 * appointment-only).
 *
 * NOTE: this repo does not currently ship a Jest runner end-to-end;
 * the file follows the canonical jest-expo shape — assertions pass
 * once the runner lands.
 */

import {
  getPendingIntentSummaryFromEvent,
  mapDayResponseToResources,
} from "../resource-calendar-mapping";
import type {
  CalendarAppointmentItem,
  CalendarDayResponse,
  CalendarTechnicianColumn,
  PersonalEvent,
} from "@technician/types/calendar";
import type { PendingIntentSummary } from "@technician/types/reorganization";

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

function makeAppointment(
  overrides: Partial<CalendarAppointmentItem> = {},
): CalendarAppointmentItem {
  return {
    id: 5001,
    customer_id: 3001,
    customer_name: "Mr. Smith",
    customer_phone: null,
    has_card_on_file: false,
    technician_id: 42,
    technician_name: "Tech A",
    franchise_id: 1,
    status: "scheduled",
    scheduled_date: "2026-04-24",
    scheduled_time: "09:00:00",
    scheduled_end_time: "10:00:00",
    started_at: null,
    completed_at: null,
    slot_type: "standard",
    booking_method: "manual",
    location_type: "onsite",
    location_address: null,
    notification_preference: "email",
    explanation: null,
    scoring_factors: null,
    appointment_note: null,
    cancellation_reason: null,
    cancelled_at: null,
    no_show_at: null,
    recurrence_rule: null,
    recurrence_series_id: null,
    fleet_account_id: null,
    booked_by: null,
    booked_by_name: null,
    services: [],
    tax_lines: [],
    alerts: [],
    pending_intent_summary: null,
    created_at: "2026-04-23T15:00:00.000Z",
    updated_at: "2026-04-23T15:00:00.000Z",
    ...overrides,
  } as CalendarAppointmentItem;
}

function makePersonalEvent(
  overrides: Partial<PersonalEvent> = {},
): PersonalEvent {
  return {
    id: "pe-1",
    technician_id: 42,
    franchise_id: 1,
    title: "Lunch",
    date: "2026-04-24",
    start_time: "2026-04-24T16:00:00.000Z",
    end_time: "2026-04-24T17:00:00.000Z",
    color: null,
    notes: null,
    created_at: "2026-04-23T15:00:00.000Z",
    updated_at: "2026-04-23T15:00:00.000Z",
    ...overrides,
  } as PersonalEvent;
}

function makeSummary(
  overrides: Partial<PendingIntentSummary> = {},
): PendingIntentSummary {
  return {
    intent_count: 2,
    kinds: ["reschedule", "reassign"],
    source: "franchise_app",
    most_recent_session_id: 9001,
    ...overrides,
  };
}

function makeTechColumn(
  appointments: CalendarAppointmentItem[],
  personal_events: PersonalEvent[] = [],
): CalendarTechnicianColumn {
  return {
    technician_id: 42,
    technician_name: "Tech A",
    profile_image_url: null,
    job_count: appointments.length,
    completed_count: 0,
    appointments,
    personal_events,
  };
}

function makeDay(
  appointments: CalendarAppointmentItem[],
  personal_events: PersonalEvent[] = [],
): CalendarDayResponse {
  return {
    date: "2026-04-24",
    technicians: [makeTechColumn(appointments, personal_events)],
  };
}

// ---------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------

describe("appointmentToEvent (via mapDayResponseToResources)", () => {
  it("forwards a non-null pending_intent_summary onto event.meta.pendingIntentSummary", () => {
    const summary = makeSummary({
      source: "tech_app",
      kinds: ["reschedule"],
      intent_count: 1,
      most_recent_session_id: 7001,
    });
    const day = makeDay([
      makeAppointment({ pending_intent_summary: summary }),
    ]);

    const [resource] = mapDayResponseToResources(day);
    const apptEvent = resource.events.find((e) => e.id === 5001);
    expect(apptEvent).toBeDefined();
    expect(apptEvent?.meta?.pendingIntentSummary).toEqual(summary);
    expect(getPendingIntentSummaryFromEvent(apptEvent!)).toEqual(summary);
  });

  it("forwards null when the appointment has no pending intents", () => {
    const day = makeDay([
      makeAppointment({ pending_intent_summary: null }),
    ]);
    const [resource] = mapDayResponseToResources(day);
    const apptEvent = resource.events.find((e) => e.id === 5001);
    expect(apptEvent?.meta?.pendingIntentSummary).toBeNull();
    expect(getPendingIntentSummaryFromEvent(apptEvent!)).toBeNull();
  });
});

describe("personalEventToEvent (via mapDayResponseToResources)", () => {
  it("does NOT carry a pendingIntentSummary key on its meta", () => {
    const day = makeDay([], [makePersonalEvent()]);
    const [resource] = mapDayResponseToResources(day);
    const peEvent = resource.events.find((e) => e.meta?.isPersonal === true);
    expect(peEvent).toBeDefined();
    expect(peEvent?.meta?.pendingIntentSummary).toBeUndefined();
    // Helper short-circuits to null for events without the field.
    expect(getPendingIntentSummaryFromEvent(peEvent!)).toBeNull();
  });
});

describe("getPendingIntentSummaryFromEvent", () => {
  it("returns null for null/undefined inputs", () => {
    expect(getPendingIntentSummaryFromEvent(null)).toBeNull();
    expect(getPendingIntentSummaryFromEvent(undefined)).toBeNull();
  });
});
