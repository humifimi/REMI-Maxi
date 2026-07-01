/**
 * Unit tests for `buildModifyIntentPayloadForGhostDrag` (PR-UX-2 PASS 2.8 task `c7`).
 *
 * The helper folds a calendar drag-end gesture into the existing
 * `ReorganizationIntent`'s payload so the BE's `modify_intent` op
 * can replace it. Tests cover the per-kind branches the helper
 * promises to handle (reschedule / reassign / create) and the
 * no-op kinds it deliberately rejects (cancel / personal_event_*).
 */

import {
  buildModifyIntentPayloadForGhostDrag,
  type GhostDragDestination,
  type GhostDragSourceAppointment,
} from "@technician/components/calendar/move-chain-ghost-drag";
import type {
  ReorganizationIntent,
  ReorganizationIntentPayload,
} from "@technician/types/reorganization";

function intentWith(
  payload: ReorganizationIntentPayload,
  overrides: Partial<ReorganizationIntent> = {},
): ReorganizationIntent {
  return {
    id: 100,
    session_id: 1,
    intent_type:
      payload.kind === "reschedule"
        ? "reschedule"
        : payload.kind === "reassign"
          ? "reassign"
          : payload.kind === "create"
            ? "create"
            : payload.kind === "cancel"
              ? "cancel"
              : payload.kind,
    intent_status: "proposed",
    appointment_id: 555,
    personal_event_id: null,
    payload,
    inverse_payload: null,
    prior_state_snapshot: null,
    linter_dependency_edges: [],
    commit_order: null,
    proposed_at: new Date(0).toISOString(),
    committed_at: null,
    chain_id: "",
    ...overrides,
  };
}

const SOURCE_APPT_TECH_3_AT_9_TO_10: GhostDragSourceAppointment = {
  technician_id: 3,
  scheduled_date: "2026-04-24",
  scheduled_time: "09:00:00",
  scheduled_start_time: "09:00:00",
  scheduled_end_time: "10:00:00",
};

const DEST_TECH_5_AT_11_TO_12: GhostDragDestination = {
  date: "2026-04-25",
  startMinutes: 11 * 60,
  endMinutes: 12 * 60,
  technicianId: 5,
};

describe("buildModifyIntentPayloadForGhostDrag — reschedule", () => {
  it("replaces date / start / end and includes new_technician_id when tech changed", () => {
    const intent = intentWith({
      kind: "reschedule",
      new_scheduled_date: "2026-04-24",
      new_start_time: "09:00:00",
      new_end_time: "10:00:00",
      new_technician_id: 3,
    });
    const out = buildModifyIntentPayloadForGhostDrag(
      intent,
      DEST_TECH_5_AT_11_TO_12,
      SOURCE_APPT_TECH_3_AT_9_TO_10,
    );
    expect(out).toEqual({
      kind: "reschedule",
      appointment_id: 555,
      new_scheduled_date: "2026-04-25",
      new_start_time: "11:00:00",
      new_end_time: "12:00:00",
      new_technician_id: 5,
    });
  });

  it("omits new_technician_id when drop tech matches the source appointment's tech", () => {
    const intent = intentWith({
      kind: "reschedule",
      new_scheduled_date: "2026-04-24",
      new_start_time: "09:00:00",
      new_end_time: "10:00:00",
      new_technician_id: 3,
    });
    const sameTechDest: GhostDragDestination = {
      date: "2026-04-25",
      startMinutes: 14 * 60,
      endMinutes: 15 * 60,
      technicianId: 3,
    };
    const out = buildModifyIntentPayloadForGhostDrag(
      intent,
      sameTechDest,
      SOURCE_APPT_TECH_3_AT_9_TO_10,
    );
    expect(out).toEqual({
      kind: "reschedule",
      appointment_id: 555,
      new_scheduled_date: "2026-04-25",
      new_start_time: "14:00:00",
      new_end_time: "15:00:00",
    });
    expect((out as { new_technician_id?: number }).new_technician_id).toBeUndefined();
  });

  it("includes new_technician_id when no source appointment is available (defensive)", () => {
    const intent = intentWith({
      kind: "reschedule",
      new_scheduled_date: "2026-04-24",
      new_start_time: "09:00:00",
      new_end_time: "10:00:00",
    });
    const out = buildModifyIntentPayloadForGhostDrag(
      intent,
      DEST_TECH_5_AT_11_TO_12,
      null,
    );
    expect(out).toMatchObject({
      kind: "reschedule",
      new_technician_id: 5,
    });
  });
});

describe("buildModifyIntentPayloadForGhostDrag — reassign", () => {
  it("keeps a reassign payload when only the tech changed (same date, same time)", () => {
    const intent = intentWith({
      kind: "reassign",
      new_technician_id: 4,
    });
    const sameTimeDifferentTech: GhostDragDestination = {
      date: "2026-04-24",
      startMinutes: 9 * 60,
      endMinutes: 10 * 60,
      technicianId: 5,
    };
    const out = buildModifyIntentPayloadForGhostDrag(
      intent,
      sameTimeDifferentTech,
      SOURCE_APPT_TECH_3_AT_9_TO_10,
    );
    expect(out).toEqual({
      kind: "reassign",
      appointment_id: 555,
      new_technician_id: 5,
    });
  });

  it("escalates to a reschedule payload when date or time changed", () => {
    const intent = intentWith({
      kind: "reassign",
      new_technician_id: 4,
    });
    const out = buildModifyIntentPayloadForGhostDrag(
      intent,
      DEST_TECH_5_AT_11_TO_12,
      SOURCE_APPT_TECH_3_AT_9_TO_10,
    );
    expect(out).toEqual({
      kind: "reschedule",
      appointment_id: 555,
      new_scheduled_date: "2026-04-25",
      new_start_time: "11:00:00",
      new_end_time: "12:00:00",
      new_technician_id: 5,
    });
  });

  it("returns null when no source appointment is available (cannot decide same-time-vs-escalate)", () => {
    const intent = intentWith({
      kind: "reassign",
      new_technician_id: 4,
    });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const out = buildModifyIntentPayloadForGhostDrag(
      intent,
      DEST_TECH_5_AT_11_TO_12,
      null,
    );
    warn.mockRestore();
    expect(out).toBeNull();
  });
});

// 2026-05-05: regression — the on-device 422 from session 370 / intent 501
// was caused by `appointment_id` being absent from the modify-intent
// wire payload. The BE's `reschedulePayloadSchema` /
// `reassignPayloadSchema` require it inside the payload object. Lock
// in the stitch so a future refactor that drops the field re-fires
// the same alert ("The change didn't save: Request failed with status
// code 422").
describe("buildModifyIntentPayloadForGhostDrag — appointment_id stitch (BE-422 regression)", () => {
  it("includes appointment_id on a reschedule payload (matches BE zod schema)", () => {
    const intent = intentWith(
      {
        kind: "reschedule",
        appointment_id: 42524,
        new_scheduled_date: "2026-05-05",
        new_start_time: "06:55:00",
        new_end_time: "07:40:00",
        new_technician_id: 2054,
      },
      { appointment_id: 42524 },
    );
    const out = buildModifyIntentPayloadForGhostDrag(
      intent,
      {
        date: "2026-05-05",
        startMinutes: 8 * 60 + 15,
        endMinutes: 9 * 60,
        technicianId: 2054,
      },
      {
        technician_id: 2054,
        scheduled_date: "2026-05-05",
        scheduled_start_time: "06:55:00",
        scheduled_end_time: "07:40:00",
      },
    );
    expect(out).toEqual({
      kind: "reschedule",
      appointment_id: 42524,
      new_scheduled_date: "2026-05-05",
      new_start_time: "08:15:00",
      new_end_time: "09:00:00",
    });
  });

  it("includes appointment_id on a reassign payload", () => {
    const intent = intentWith(
      { kind: "reassign", appointment_id: 42524, new_technician_id: 4 },
      { appointment_id: 42524 },
    );
    const out = buildModifyIntentPayloadForGhostDrag(
      intent,
      {
        date: "2026-04-24",
        startMinutes: 9 * 60,
        endMinutes: 10 * 60,
        technicianId: 5,
      },
      SOURCE_APPT_TECH_3_AT_9_TO_10,
    );
    expect(out).toEqual({
      kind: "reassign",
      appointment_id: 42524,
      new_technician_id: 5,
    });
  });

  it("falls back to personal_event_id when the intent has no appointment_id", () => {
    const intent = intentWith(
      {
        kind: "reschedule",
        appointment_id: 0,
        new_scheduled_date: "2026-04-24",
        new_start_time: "09:00:00",
        new_end_time: "10:00:00",
      } as ReorganizationIntentPayload,
      { appointment_id: null, personal_event_id: "pe-uuid-9" },
    );
    const out = buildModifyIntentPayloadForGhostDrag(
      intent,
      DEST_TECH_5_AT_11_TO_12,
      null,
    );
    expect(out).toMatchObject({ personal_event_id: "pe-uuid-9" });
    expect((out as Record<string, unknown>).appointment_id).toBeUndefined();
  });

  it("does NOT add appointment_id to a create payload (BE schema rejects it)", () => {
    const intent = intentWith(
      {
        kind: "create",
        customer_id: 12,
        technician_id: 3,
        scheduled_date: "2026-04-24",
        scheduled_start_time: "09:00:00",
        scheduled_end_time: "10:00:00",
        service_ids: [1],
      },
      { appointment_id: null },
    );
    const out = buildModifyIntentPayloadForGhostDrag(
      intent,
      DEST_TECH_5_AT_11_TO_12,
      null,
    );
    expect((out as Record<string, unknown>).appointment_id).toBeUndefined();
  });
});

describe("buildModifyIntentPayloadForGhostDrag — create", () => {
  it("replaces date / start / end / technician on the create payload", () => {
    const intent = intentWith({
      kind: "create",
      customer_id: 12,
      technician_id: 3,
      scheduled_date: "2026-04-24",
      scheduled_start_time: "09:00:00",
      scheduled_end_time: "10:00:00",
      service_ids: [1, 2],
      notes: "kept",
    });
    const out = buildModifyIntentPayloadForGhostDrag(
      intent,
      DEST_TECH_5_AT_11_TO_12,
      null,
    );
    expect(out).toEqual({
      kind: "create",
      customer_id: 12,
      technician_id: 5,
      scheduled_date: "2026-04-25",
      scheduled_start_time: "11:00:00",
      scheduled_end_time: "12:00:00",
      service_ids: [1, 2],
      notes: "kept",
    });
  });
});

describe("buildModifyIntentPayloadForGhostDrag — kinds without a destination", () => {
  it.each([
    {
      kind: "cancel",
      payload: {
        kind: "cancel",
        cancellation_reason: "customer_request",
      } as ReorganizationIntentPayload,
    },
    {
      kind: "personal_event_create",
      payload: {
        kind: "personal_event_create",
        technician_id: 3,
        scheduled_date: "2026-04-24",
        start_time: "09:00:00",
        end_time: "10:00:00",
        title: "lunch",
        category: "personal",
      } as ReorganizationIntentPayload,
    },
    {
      kind: "personal_event_update",
      payload: {
        kind: "personal_event_update",
        version: 1,
        patch: {},
      } as ReorganizationIntentPayload,
    },
    {
      kind: "personal_event_delete",
      payload: {
        kind: "personal_event_delete",
        version: 1,
      } as ReorganizationIntentPayload,
    },
  ])("returns null for $kind", ({ payload }) => {
    const intent = intentWith(payload);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const out = buildModifyIntentPayloadForGhostDrag(
      intent,
      DEST_TECH_5_AT_11_TO_12,
      null,
    );
    warn.mockRestore();
    expect(out).toBeNull();
  });
});

describe("buildModifyIntentPayloadForGhostDrag — guards", () => {
  it("returns null when the destination has no technicianId", () => {
    const intent = intentWith({
      kind: "reschedule",
      new_scheduled_date: "2026-04-24",
      new_start_time: "09:00:00",
      new_end_time: "10:00:00",
    });
    const dropOffCanvas: GhostDragDestination = {
      date: "2026-04-25",
      startMinutes: 11 * 60,
      endMinutes: 12 * 60,
      technicianId: null,
    };
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const out = buildModifyIntentPayloadForGhostDrag(
      intent,
      dropOffCanvas,
      null,
    );
    warn.mockRestore();
    expect(out).toBeNull();
  });
});
