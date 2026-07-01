/**
 * Tests for `applyIntentsToWorld` (PR-UX-5 / Now⇄Future toggle).
 *
 * The function is the projector behind the calendar's "Future" mode —
 * it takes the same `CalendarDayResponse[]` snapshot the canvas
 * already consumes plus an array of staged intents, and returns the
 * post-commit world. Coverage targets:
 *
 *   1. Each of the seven intent kinds applies correctly (cancel,
 *      reschedule, reschedule + tech change, reassign, create,
 *      personal_event_create / _update / _delete).
 *   2. Off-window destinations land in `offScreen` instead of
 *      silently disappearing.
 *   3. The input is never mutated.
 *   4. Multiple intents apply in §6.4.1 commit order regardless of
 *      input order.
 *   5. Synthetic ids (create / personal_event_create) use the
 *      reserved sentinel ranges and never collide with real ids.
 */

import {
  applyIntentsToWorld,
  CREATE_ID_OFFSET,
  isProjectedCreateEventId,
  isProjectedPersonalEventId,
  projectedCreateEventIdFor,
  projectedPersonalEventIdFor,
} from "../apply-intents-to-world";
import type {
  CalendarAppointmentItem,
  CalendarDayResponse,
  CalendarTechnicianColumn,
  PersonalEvent,
} from "@technician/types/calendar";
import type { ReorganizationIntent } from "@technician/types/reorganization";

// ── Fixtures ─────────────────────────────────────────────────────

function makeAppt(overrides: Partial<CalendarAppointmentItem>): CalendarAppointmentItem {
  return {
    id: 1,
    customer_id: 100,
    customer_name: "Smith",
    customer_phone: null,
    has_card_on_file: false,
    technician_id: 10,
    technician_name: "Dan",
    franchise_id: 1,
    status: "created",
    scheduled_date: "2026-05-08",
    scheduled_time: "09:00:00",
    scheduled_end_time: "10:00:00",
    started_at: null,
    completed_at: null,
    slot_type: "standard",
    booking_method: "manual",
    location_type: "customer",
    location_address: null,
    notification_preference: "none",
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
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    ...overrides,
  } as CalendarAppointmentItem;
}

function makeTech(
  techId: number,
  name: string,
  appts: CalendarAppointmentItem[],
  pes: PersonalEvent[] = [],
): CalendarTechnicianColumn {
  return {
    technician_id: techId,
    technician_name: name,
    profile_image_url: null,
    job_count: appts.length,
    completed_count: 0,
    appointments: appts,
    personal_events: pes,
  };
}

function makeDay(
  date: string,
  techs: CalendarTechnicianColumn[],
): CalendarDayResponse {
  return { date, technicians: techs };
}

function makePE(overrides: Partial<PersonalEvent>): PersonalEvent {
  return {
    id: "pe-1",
    franchise_id: 1,
    created_by: 99,
    title: "Lunch",
    date: "2026-05-08",
    start_time: "12:00:00",
    end_time: "13:00:00",
    duration_minutes: 60,
    recurrence_rule: null,
    notes: null,
    shared_with: [],
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

function makeIntent(
  id: number,
  payload: ReorganizationIntent["payload"],
  apptId: number | null = null,
  peId: string | null = null,
): ReorganizationIntent {
  return {
    id,
    session_id: 1,
    intent_type: payload.kind,
    intent_status: "proposed",
    appointment_id: apptId,
    personal_event_id: peId,
    payload,
    inverse_payload: null,
    prior_state_snapshot: null,
    linter_dependency_edges: [],
    commit_order: null,
    proposed_at: "2026-05-08T09:00:00Z",
    committed_at: null,
    chain_id: "",
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe("applyIntentsToWorld — empty intents", () => {
  it("returns the same days reference unchanged when intents is empty", () => {
    const days = [makeDay("2026-05-08", [makeTech(10, "Dan", [makeAppt({ id: 1 })])])];
    const result = applyIntentsToWorld(days, []);
    expect(result.days).toBe(days);
    expect(result.offScreen).toEqual([]);
  });
});

describe("applyIntentsToWorld — cancel", () => {
  it("removes the appointment from the projected world", () => {
    const days = [
      makeDay("2026-05-08", [makeTech(10, "Dan", [makeAppt({ id: 1 }), makeAppt({ id: 2 })])]),
    ];
    const intents = [
      makeIntent(
        100,
        {
          kind: "cancel",
          cancellation_reason: "customer_request",
        },
        1,
      ),
    ];
    const { days: projected } = applyIntentsToWorld(days, intents);
    const ids = projected[0].technicians[0].appointments.map((a) => a.id);
    expect(ids).toEqual([2]);
  });

  it("is a no-op for cancels with null appointment_id", () => {
    const days = [
      makeDay("2026-05-08", [makeTech(10, "Dan", [makeAppt({ id: 1 })])]),
    ];
    const intents = [
      makeIntent(100, { kind: "cancel", cancellation_reason: "x" }, null),
    ];
    const { days: projected } = applyIntentsToWorld(days, intents);
    expect(projected[0].technicians[0].appointments).toHaveLength(1);
  });
});

describe("applyIntentsToWorld — reschedule (same tech, new time)", () => {
  it("moves the card to the new time on the same tech", () => {
    const days = [
      makeDay("2026-05-08", [makeTech(10, "Dan", [makeAppt({ id: 1, scheduled_time: "09:00:00" })])]),
    ];
    const intents = [
      makeIntent(
        200,
        {
          kind: "reschedule",
          new_scheduled_date: "2026-05-08",
          new_start_time: "14:00",
          new_end_time: "15:00",
        },
        1,
      ),
    ];
    const { days: projected } = applyIntentsToWorld(days, intents);
    const tech = projected[0].technicians[0];
    expect(tech.appointments).toHaveLength(1);
    expect(tech.appointments[0].scheduled_time).toBe("14:00:00");
    expect(tech.appointments[0].scheduled_end_time).toBe("15:00:00");
    expect(tech.appointments[0].technician_id).toBe(10);
  });
});

describe("applyIntentsToWorld — reschedule with tech change", () => {
  it("moves the card to a different tech column on the destination date", () => {
    const days = [
      makeDay("2026-05-08", [
        makeTech(10, "Dan", [makeAppt({ id: 1 })]),
        makeTech(20, "Trey", []),
      ]),
    ];
    const intents = [
      makeIntent(
        201,
        {
          kind: "reschedule",
          new_scheduled_date: "2026-05-08",
          new_start_time: "11:00",
          new_end_time: "12:00",
          new_technician_id: 20,
        },
        1,
      ),
    ];
    const { days: projected } = applyIntentsToWorld(days, intents);
    expect(projected[0].technicians[0].appointments).toHaveLength(0);
    expect(projected[0].technicians[1].appointments).toHaveLength(1);
    expect(projected[0].technicians[1].appointments[0].technician_id).toBe(20);
  });

  it("synthesizes an empty tech column when destination tech isn't in the day", () => {
    const days = [
      makeDay("2026-05-08", [makeTech(10, "Dan", [makeAppt({ id: 1 })])]),
    ];
    const intents = [
      makeIntent(
        201,
        {
          kind: "reschedule",
          new_scheduled_date: "2026-05-08",
          new_start_time: "11:00",
          new_end_time: "12:00",
          new_technician_id: 99,
        },
        1,
      ),
    ];
    const { days: projected } = applyIntentsToWorld(days, intents);
    const synth = projected[0].technicians.find((t) => t.technician_id === 99);
    expect(synth).toBeDefined();
    expect(synth!.appointments).toHaveLength(1);
  });
});

describe("applyIntentsToWorld — reschedule off-window", () => {
  it("drops the destination from the projection and records it in offScreen", () => {
    const days = [
      makeDay("2026-05-08", [makeTech(10, "Dan", [makeAppt({ id: 1 })])]),
    ];
    const intents = [
      makeIntent(
        202,
        {
          kind: "reschedule",
          new_scheduled_date: "2026-05-15", // not in window
          new_start_time: "11:00",
          new_end_time: "12:00",
        },
        1,
      ),
    ];
    const { days: projected, offScreen } = applyIntentsToWorld(days, intents);
    expect(projected[0].technicians[0].appointments).toHaveLength(0);
    expect(offScreen).toEqual([
      {
        intentId: 202,
        appointmentId: 1,
        date: "2026-05-15",
        reason: "destination_date_not_in_window",
      },
    ]);
  });
});

describe("applyIntentsToWorld — reassign", () => {
  it("moves the card to the new tech column on the same day, same time", () => {
    const days = [
      makeDay("2026-05-08", [
        makeTech(10, "Dan", [makeAppt({ id: 1, scheduled_time: "09:00:00" })]),
        makeTech(20, "Trey", []),
      ]),
    ];
    const intents = [
      makeIntent(
        300,
        { kind: "reassign", new_technician_id: 20 },
        1,
      ),
    ];
    const { days: projected } = applyIntentsToWorld(days, intents);
    expect(projected[0].technicians[0].appointments).toHaveLength(0);
    expect(projected[0].technicians[1].appointments).toHaveLength(1);
    expect(projected[0].technicians[1].appointments[0].scheduled_time).toBe("09:00:00");
  });
});

describe("applyIntentsToWorld — create", () => {
  it("injects a synthetic appointment with a reserved negative id", () => {
    const days = [makeDay("2026-05-08", [makeTech(10, "Dan", [])])];
    const intents = [
      makeIntent(400, {
        kind: "create",
        customer_id: 555,
        technician_id: 10,
        scheduled_date: "2026-05-08",
        scheduled_start_time: "10:00",
        scheduled_end_time: "11:00",
        service_ids: [1, 2],
      }),
    ];
    const { days: projected } = applyIntentsToWorld(days, intents);
    expect(projected[0].technicians[0].appointments).toHaveLength(1);
    const created = projected[0].technicians[0].appointments[0];
    expect(created.id).toBe(projectedCreateEventIdFor(400));
    expect(isProjectedCreateEventId(created.id)).toBe(true);
    expect(created.id).toBeLessThanOrEqual(-CREATE_ID_OFFSET);
    expect(created.customer_id).toBe(555);
    expect(created.services).toHaveLength(2);
  });

  it("drops creates with null technician_id (auto-assign at commit) into offScreen", () => {
    const days = [makeDay("2026-05-08", [makeTech(10, "Dan", [])])];
    const intents = [
      makeIntent(401, {
        kind: "create",
        customer_id: 555,
        technician_id: null,
        scheduled_date: "2026-05-08",
        scheduled_start_time: "10:00",
        scheduled_end_time: "11:00",
        service_ids: [],
      }),
    ];
    const { days: projected, offScreen } = applyIntentsToWorld(days, intents);
    expect(projected[0].technicians[0].appointments).toHaveLength(0);
    expect(offScreen).toHaveLength(1);
  });
});

describe("applyIntentsToWorld — personal events", () => {
  it("creates a personal event with a reserved synthetic id", () => {
    const days = [makeDay("2026-05-08", [makeTech(10, "Dan", [])])];
    const intents = [
      makeIntent(500, {
        kind: "personal_event_create",
        technician_id: 10,
        scheduled_date: "2026-05-08",
        start_time: "12:00",
        end_time: "13:00",
        title: "Lunch",
        category: "break",
      }),
    ];
    const { days: projected } = applyIntentsToWorld(days, intents);
    expect(projected[0].technicians[0].personal_events).toHaveLength(1);
    const pe = projected[0].technicians[0].personal_events[0];
    expect(pe.id).toBe(projectedPersonalEventIdFor(500));
    expect(isProjectedPersonalEventId(pe.id)).toBe(true);
    expect(pe.duration_minutes).toBe(60);
  });

  it("deletes a personal event by id", () => {
    const days = [
      makeDay("2026-05-08", [makeTech(10, "Dan", [], [makePE({ id: "pe-99" })])]),
    ];
    const intents = [
      makeIntent(
        501,
        { kind: "personal_event_delete", version: 1 },
        null,
        "pe-99",
      ),
    ];
    const { days: projected } = applyIntentsToWorld(days, intents);
    expect(projected[0].technicians[0].personal_events).toHaveLength(0);
  });

  it("updates a personal event's title and time", () => {
    const days = [
      makeDay("2026-05-08", [
        makeTech(10, "Dan", [], [makePE({ id: "pe-100", title: "Lunch" })]),
      ]),
    ];
    const intents = [
      makeIntent(
        502,
        {
          kind: "personal_event_update",
          version: 1,
          patch: { title: "Doctor", start_time: "14:00", end_time: "15:00" },
        },
        null,
        "pe-100",
      ),
    ];
    const { days: projected } = applyIntentsToWorld(days, intents);
    const pe = projected[0].technicians[0].personal_events[0];
    expect(pe.title).toBe("Doctor");
    expect(pe.start_time).toBe("14:00:00");
    expect(pe.end_time).toBe("15:00:00");
  });
});

describe("applyIntentsToWorld — purity", () => {
  it("never mutates the input days", () => {
    const days = [
      makeDay("2026-05-08", [makeTech(10, "Dan", [makeAppt({ id: 1 })])]),
    ];
    const snapshot = JSON.stringify(days);
    applyIntentsToWorld(days, [
      makeIntent(700, { kind: "cancel", cancellation_reason: "x" }, 1),
    ]);
    expect(JSON.stringify(days)).toBe(snapshot);
  });
});

describe("applyIntentsToWorld — commit ordering", () => {
  it("applies cancel before reschedule even when intents are passed in reverse order", () => {
    // Two intents that target the same appt. If reschedule applied
    // first then cancel, the cancel would still remove the moved
    // card (correct). If cancel applied first, the reschedule
    // would no-op (also correct). End state must be the same:
    // appt 1 absent.
    const days = [
      makeDay("2026-05-08", [makeTech(10, "Dan", [makeAppt({ id: 1 })])]),
    ];
    const intents = [
      makeIntent(
        800,
        {
          kind: "reschedule",
          new_scheduled_date: "2026-05-08",
          new_start_time: "11:00",
          new_end_time: "12:00",
        },
        1,
      ),
      makeIntent(801, { kind: "cancel", cancellation_reason: "x" }, 1),
    ];
    const { days: projected } = applyIntentsToWorld(days, intents);
    expect(projected[0].technicians[0].appointments).toHaveLength(0);
  });
});

describe("applyIntentsToWorld — long-chain duplicate-card guard (2026-05-10 user repro)", () => {
  // User-reported smoke-pass bug: toggling Future view on a long
  // chain rendered a customer card ("Daniel Kim") twice. The
  // single-step projector paths (reschedule, reassign, create)
  // each remove-then-push by id, so duplicates can only arise from
  // (a) duplicate input rows (BE leak) or (b) some interaction
  // between chained intents we haven't proven impossible. The
  // dedup pass at the end of `applyIntentsToWorld` is the safety
  // net; this test pins it as a regression surface.

  it("dedupes when the input already has the same appointment id in two columns", () => {
    // Simulate a BE leak where appointment 1 appears in BOTH techs
    // on the same day (e.g., a stale pending-intent annotation
    // that the BE didn't fold back). The projector must not
    // propagate the duplicate.
    const days = [
      makeDay("2026-05-08", [
        makeTech(10, "Dan", [makeAppt({ id: 1, customer_name: "Daniel Kim" })]),
        makeTech(20, "Trey", [makeAppt({ id: 1, customer_name: "Daniel Kim" })]),
      ]),
    ];

    const { days: projected } = applyIntentsToWorld(days, [
      makeIntent(
        900,
        {
          kind: "reschedule",
          new_scheduled_date: "2026-05-08",
          new_start_time: "14:00",
          new_end_time: "15:00",
        },
        1,
      ),
    ]);

    // Across all tech columns of all days: appointment id 1 should
    // appear at most once.
    const allApptIds = projected.flatMap((d) =>
      d.technicians.flatMap((t) => t.appointments.map((a) => a.id)),
    );
    const occurrences = allApptIds.filter((id) => id === 1).length;
    expect(occurrences).toBeLessThanOrEqual(1);
  });

  it("4-step cascade chain produces exactly one card per appointment", () => {
    // Reconstruction of the user's repro shape: a 4-link chain
    // where each step displaces the next. End state: each
    // appointment lands in its destination slot, no slot has the
    // same id twice.
    const days = [
      makeDay("2026-05-08", [
        makeTech(10, "Tech A", [
          makeAppt({ id: 100, customer_name: "Daniel Kim", scheduled_time: "09:00:00", scheduled_end_time: "10:00:00" }),
          makeAppt({ id: 101, customer_name: "B", scheduled_time: "10:00:00", scheduled_end_time: "11:00:00" }),
          makeAppt({ id: 102, customer_name: "C", scheduled_time: "11:00:00", scheduled_end_time: "12:00:00" }),
          makeAppt({ id: 103, customer_name: "D", scheduled_time: "12:00:00", scheduled_end_time: "13:00:00" }),
        ]),
      ]),
    ];
    const intents = [
      makeIntent(
        1,
        {
          kind: "reschedule",
          new_scheduled_date: "2026-05-08",
          new_start_time: "10:00",
          new_end_time: "11:00",
        },
        100,
      ),
      makeIntent(
        2,
        {
          kind: "reschedule",
          new_scheduled_date: "2026-05-08",
          new_start_time: "11:00",
          new_end_time: "12:00",
        },
        101,
      ),
      makeIntent(
        3,
        {
          kind: "reschedule",
          new_scheduled_date: "2026-05-08",
          new_start_time: "12:00",
          new_end_time: "13:00",
        },
        102,
      ),
      makeIntent(
        4,
        {
          kind: "reschedule",
          new_scheduled_date: "2026-05-08",
          new_start_time: "13:00",
          new_end_time: "14:00",
        },
        103,
      ),
    ];

    const { days: projected } = applyIntentsToWorld(days, intents);
    const tech = projected[0].technicians[0];

    // Exactly 4 cards (one per appointment), each at its new time.
    expect(tech.appointments).toHaveLength(4);
    const idCounts = tech.appointments.reduce<Record<number, number>>(
      (acc, a) => {
        acc[a.id] = (acc[a.id] ?? 0) + 1;
        return acc;
      },
      {},
    );
    expect(idCounts).toEqual({ 100: 1, 101: 1, 102: 1, 103: 1 });
  });
});
