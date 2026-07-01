/**
 * Tests for `useCalendarWorldSnapshot` (D2P-FE-13) — the consumer-side
 * snapshot assembly that resolves the
 * `2026-04-23-pending-reality-trim` deviation's deferred follow-up.
 *
 * The five cases here are the exact set required by the Pending
 * Reality demo bundle PRD §4.5.1:
 *
 *   1. Returns `EMPTY_WORLD_SNAPSHOT` when the day-view query is
 *      pending (`data: undefined`).
 *   2. Returns a snapshot containing every committed appointment
 *      from the day-view response when the query has resolved.
 *   3. Excludes appointments whose ids appear in
 *      `usePendingRealityStore.intents` (so a staged intent doesn't
 *      double-count its own committed predecessor).
 *   4. Memoization regression guard — same returned reference
 *      across two renders when `dayData` reference is unchanged.
 *   5. Memoization invalidation guard — new returned reference
 *      across two renders when `dayData` reference changes (no
 *      over-memoization that would mask real cache updates).
 *
 * NOTE: this repo does not currently run jest end-to-end (see the
 * sibling test files for the same caveat). The shape mirrors the
 * canonical jest-expo + `@testing-library/react-native` layout — every
 * assertion below should pass once the runner lands.
 */

import { act, renderHook } from "@testing-library/react-native";
import React from "react";

import { EMPTY_WORLD_SNAPSHOT, useCalendarWorldSnapshot } from "../use-calendar-world-snapshot";
import {
  __resetPendingRealityStoreForTests,
  usePendingRealityStore,
} from "@technician/stores/pending-reality";
import { makeIntent, makeSession } from "@technician/stores/__fixtures__/pending-reality";
import type { CalendarDayResponse } from "@technician/types/calendar";

// ── Module mocks ────────────────────────────────────────────────────

let mockDayResponse: CalendarDayResponse | undefined = undefined;
let mockWeekResponse: CalendarDayResponse[] | undefined = undefined;
jest.mock("@technician/hooks/schedule/use-calendar", () => ({
  __esModule: true,
  useFranchiseDayView: () => ({ data: mockDayResponse, isLoading: false }),
  useTechnicianDayView: () => ({ data: mockDayResponse, isLoading: false }),
  useFranchiseWeekView: () => ({ data: mockWeekResponse, isLoading: false }),
  useTechnicianWeekView: () => ({ data: mockWeekResponse, isLoading: false }),
}));

// Default to franchise_owner so the hook reads `useFranchiseDayView`
// (the day-view branch of the role split). Tests that need to flip
// the role can mutate `mockAuthRole` before rendering.
let mockAuthRole: "franchise_owner" | "technician" | null = "franchise_owner";
jest.mock("@/src/stores/auth", () => ({
  __esModule: true,
  useAuthStore: <T,>(
    selector: (state: { user: { role: string } | null }) => T,
  ): T =>
    selector({
      user: mockAuthRole != null ? { role: mockAuthRole } : null,
    }),
}));

let mockSelectedDate = "2026-04-25";
let mockViewMode: "day" | "week" | "month" = "day";
jest.mock("@technician/stores/calendar", () => ({
  __esModule: true,
  useCalendarStore: <T,>(
    selector: (state: {
      selectedDate: string;
      viewMode: "day" | "week" | "month";
    }) => T,
  ): T =>
    selector({
      selectedDate: mockSelectedDate,
      viewMode: mockViewMode,
    }),
}));

// PR-UX-12 — `useCalendarWorldSnapshot` now branches on
// `viewMode === "week" || isLandscape`. Mock the orientation hook so
// tests can exercise both portrait + landscape paths without reaching
// for the real `useWindowDimensions` (which pulls in the TurboModule
// trap, see the comment in `PendingRealityFAB.test.tsx`).
let mockOrientation: "portrait" | "landscape" = "portrait";
jest.mock("@technician/hooks/ui/use-wide-canvas", () => ({
  __esModule: true,
  useWideCanvas: () => ({
    isWide: false,
    orientation: mockOrientation,
    canvasKind:
      mockOrientation === "portrait" ? "phone-portrait" : "phone-landscape",
  }),
}));

// ── Fixture helpers ────────────────────────────────────────────────

function makeCalendarAppointment(
  overrides: Partial<{
    id: number;
    technician_id: number | null;
    scheduled_date: string | null;
    scheduled_time: string | null;
    scheduled_end_time: string | null;
    customer_id: number;
    franchise_id: number | null;
    status: string;
    fleet_account_id: number | null;
    recurrence_series_id: string | null;
  }> = {},
) {
  return {
    id: 9001,
    customer_id: 401,
    customer_name: "Test Customer",
    customer_phone: null,
    has_card_on_file: false,
    technician_id: 5,
    technician_name: "Tech 5",
    franchise_id: 1,
    status: "confirmed",
    scheduled_date: "2026-04-25",
    scheduled_time: "09:00",
    scheduled_end_time: "10:00",
    started_at: null,
    completed_at: null,
    slot_type: "standard",
    booking_method: "manual",
    location_type: "shop",
    location_address: null,
    notification_preference: "sms_only",
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
    created_at: "2026-04-25T00:00:00Z",
    updated_at: "2026-04-25T00:00:00Z",
    ...overrides,
  };
}

function makeDayResponse(
  appointments: ReturnType<typeof makeCalendarAppointment>[],
  date: string = "2026-04-25",
): CalendarDayResponse {
  // Project the flat appointment list onto a single tech column.
  // Exact column shape doesn't matter for the snapshot (the hook
  // flattens all techs anyway) — this keeps fixture noise low.
  return {
    date,
    technicians: [
      {
        technician_id: 5,
        technician_name: "Tech 5",
        profile_image_url: null,
        job_count: appointments.length,
        completed_count: 0,
        appointments,
        personal_events: [],
      },
    ],
  } as CalendarDayResponse;
}

beforeEach(() => {
  __resetPendingRealityStoreForTests();
  mockDayResponse = undefined;
  mockWeekResponse = undefined;
  mockAuthRole = "franchise_owner";
  mockSelectedDate = "2026-04-25";
  mockViewMode = "day";
  mockOrientation = "portrait";
});

// ── Wrapper (no providers needed; the hook is store-only) ──────────

function Wrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// ──────────────────────────────────────────────────────────────────
// 1. Pending day-view query → empty snapshot
// ──────────────────────────────────────────────────────────────────

describe("useCalendarWorldSnapshot — pre-load fallback", () => {
  it("returns EMPTY_WORLD_SNAPSHOT when the day-view query is pending", () => {
    mockDayResponse = undefined;

    const { result } = renderHook(() => useCalendarWorldSnapshot(), {
      wrapper: Wrapper,
    });

    expect(result.current).toBe(EMPTY_WORLD_SNAPSHOT);
    expect(result.current.appointments).toEqual([]);
    expect(result.current.routes).toEqual([]);
    expect(result.current.customerSlas).toEqual([]);
    expect(result.current.fleet).toEqual({ accounts: [] });
  });
});

// ──────────────────────────────────────────────────────────────────
// 2. Loaded day-view → every appointment projected
// ──────────────────────────────────────────────────────────────────

describe("useCalendarWorldSnapshot — loaded day-view", () => {
  it("projects every appointment from the day-view response into LinterAppointments", () => {
    const a = makeCalendarAppointment({ id: 100, scheduled_time: "09:00", scheduled_end_time: "10:00" });
    const b = makeCalendarAppointment({ id: 200, scheduled_time: "11:00", scheduled_end_time: "12:00" });
    mockDayResponse = makeDayResponse([a, b]);

    const { result } = renderHook(() => useCalendarWorldSnapshot(), {
      wrapper: Wrapper,
    });

    expect(result.current.appointments.map((x) => x.id).sort()).toEqual([100, 200]);
    const projected = result.current.appointments.find((x) => x.id === 100)!;
    expect(projected).toMatchObject({
      id: 100,
      customer_id: 401,
      technician_id: 5,
      franchise_id: 1,
      status: "confirmed",
      scheduled_date: "2026-04-25",
      scheduled_start_time: "09:00",
      scheduled_end_time: "10:00",
      recurrence_series_id: null,
    });
  });

  it("filters out appointments missing required scheduled_* fields", () => {
    const ok = makeCalendarAppointment({ id: 100 });
    const noEnd = makeCalendarAppointment({ id: 101, scheduled_end_time: null });
    const noStart = makeCalendarAppointment({ id: 102, scheduled_time: null });
    const noDate = makeCalendarAppointment({ id: 103, scheduled_date: null });
    mockDayResponse = makeDayResponse([ok, noEnd, noStart, noDate]);

    const { result } = renderHook(() => useCalendarWorldSnapshot(), {
      wrapper: Wrapper,
    });

    expect(result.current.appointments.map((x) => x.id)).toEqual([100]);
  });
});

// ──────────────────────────────────────────────────────────────────
// 3. Active intents filter committed predecessors
// ──────────────────────────────────────────────────────────────────

describe("useCalendarWorldSnapshot — staged intent filter", () => {
  it("excludes appointments whose ids appear in usePendingRealityStore.intents", () => {
    const a = makeCalendarAppointment({ id: 100 });
    const b = makeCalendarAppointment({ id: 200 });
    const c = makeCalendarAppointment({ id: 300 });
    mockDayResponse = makeDayResponse([a, b, c]);

    // Stage an intent against appointment 200 — it should drop out
    // of the snapshot so the linter doesn't double-count it against
    // its own proposed reschedule.
    usePendingRealityStore.setState({
      session: makeSession({ id: 7001 }),
      sessionId: 7001,
      status: "draft",
      intents: [makeIntent(1, { appointment_id: 200 })],
      linterIssues: [],
    });

    const { result } = renderHook(() => useCalendarWorldSnapshot(), {
      wrapper: Wrapper,
    });

    expect(result.current.appointments.map((x) => x.id).sort()).toEqual([100, 300]);
  });
});

// ──────────────────────────────────────────────────────────────────
// 4. Memoization — stable reference when dayData unchanged
// ──────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────
// 5. Week mode — full 7-day × all-tech projection (P3-FE-WEEK-SNAPSHOT)
// ──────────────────────────────────────────────────────────────────

describe("useCalendarWorldSnapshot — week mode (2026-05-08 P3-FE-WEEK-SNAPSHOT)", () => {
  function makeMultiTechDay(
    date: string,
    perTech: { techId: number; appointmentIds: number[] }[],
  ): CalendarDayResponse {
    return {
      date,
      technicians: perTech.map(({ techId, appointmentIds }) => ({
        technician_id: techId,
        technician_name: `Tech ${techId}`,
        profile_image_url: null,
        job_count: appointmentIds.length,
        completed_count: 0,
        appointments: appointmentIds.map((id) =>
          makeCalendarAppointment({
            id,
            technician_id: techId,
            scheduled_date: date,
          }),
        ),
        personal_events: [],
      })) as CalendarDayResponse["technicians"],
    } as CalendarDayResponse;
  }

  it("week mode → snapshot covers all 7 days × all techs (NOT scoped to workweekTechId)", () => {
    mockViewMode = "week";
    mockSelectedDate = "2026-05-06"; // a Wednesday
    mockWeekResponse = [
      makeMultiTechDay("2026-05-04", [
        { techId: 2054, appointmentIds: [1001] },
        { techId: 2055, appointmentIds: [1002] },
      ]),
      makeMultiTechDay("2026-05-05", [
        { techId: 2054, appointmentIds: [1003] },
      ]),
      makeMultiTechDay("2026-05-06", [
        { techId: 2055, appointmentIds: [1004, 1005] },
      ]),
      makeMultiTechDay("2026-05-07", [
        { techId: 2054, appointmentIds: [1006] },
        { techId: 2056, appointmentIds: [1007] },
      ]),
      makeMultiTechDay("2026-05-08", [
        { techId: 2055, appointmentIds: [1008] },
      ]),
      makeMultiTechDay("2026-05-09", []),
      makeMultiTechDay("2026-05-10", [
        { techId: 2054, appointmentIds: [1009] },
      ]),
    ];

    const { result } = renderHook(() => useCalendarWorldSnapshot(), {
      wrapper: Wrapper,
    });

    const ids = result.current.appointments.map((a) => a.id).sort();
    expect(ids).toEqual([1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009]);

    // Date coverage spans the full week (the days without
    // appointments don't appear in `dateCount` since the projection
    // is appointment-driven, but every day that HAS appointments
    // must surface).
    const datesPresent = new Set(
      result.current.appointments.map((a) => a.scheduled_date),
    );
    expect(datesPresent).toEqual(
      new Set([
        "2026-05-04",
        "2026-05-05",
        "2026-05-06",
        "2026-05-07",
        "2026-05-08",
        "2026-05-10",
      ]),
    );

    // Cross-tech coverage — three distinct techs surface even
    // though portrait-week mode visually shows one. The linter
    // needs all of them so cross-tech drops via avatar hover-dwell
    // can detect overlaps on the destination tech.
    const techsPresent = new Set(
      result.current.appointments.map((a) => a.technician_id),
    );
    expect(techsPresent).toEqual(new Set([2054, 2055, 2056]));
  });

  it("week mode + drag target on day other than selectedDate → linter sees target-day appointments", () => {
    // Reproduces the user's bug: selectedDate = 2026-05-08, drag
    // target = 2026-05-06. Pre-fix the snapshot only had 2026-05-08
    // appointments, so no overlap check on 2026-05-06 was possible.
    mockViewMode = "week";
    mockSelectedDate = "2026-05-08";
    mockWeekResponse = [
      makeMultiTechDay("2026-05-04", []),
      makeMultiTechDay("2026-05-05", []),
      makeMultiTechDay("2026-05-06", [
        // The conflict-on-target-day appointment.
        { techId: 2055, appointmentIds: [4040] },
      ]),
      makeMultiTechDay("2026-05-07", []),
      makeMultiTechDay("2026-05-08", [
        // The selected-date appointment (irrelevant to the target).
        { techId: 2055, appointmentIds: [5050] },
      ]),
      makeMultiTechDay("2026-05-09", []),
      makeMultiTechDay("2026-05-10", []),
    ];

    const { result } = renderHook(() => useCalendarWorldSnapshot(), {
      wrapper: Wrapper,
    });

    // Both days are visible to the linter — overlap detection on
    // the target day (2026-05-06) is now possible.
    expect(result.current.appointments.map((a) => a.id).sort()).toEqual([
      4040, 5050,
    ]);
    expect(
      result.current.appointments.find((a) => a.id === 4040)?.scheduled_date,
    ).toBe("2026-05-06");
  });

  it("week mode + week query pending → empty snapshot (does NOT fall back to day query)", () => {
    mockViewMode = "week";
    mockSelectedDate = "2026-05-06";
    mockWeekResponse = undefined;
    // Day data is populated but should NOT leak into the week-mode
    // path — the branch is on viewMode, not on data presence.
    mockDayResponse = makeDayResponse([
      makeCalendarAppointment({ id: 9999 }),
    ]);

    const { result } = renderHook(() => useCalendarWorldSnapshot(), {
      wrapper: Wrapper,
    });

    expect(result.current).toBe(EMPTY_WORLD_SNAPSHOT);
    expect(result.current.appointments).toEqual([]);
  });

  it("day mode → snapshot covers only the selected day (regression pin for unchanged behavior)", () => {
    // Pin the day-mode contract so the week-mode fix doesn't
    // accidentally widen day-mode coverage.
    mockViewMode = "day";
    mockSelectedDate = "2026-04-25";
    mockDayResponse = makeDayResponse(
      [
        makeCalendarAppointment({ id: 100 }),
        makeCalendarAppointment({ id: 200 }),
      ],
      "2026-04-25",
    );
    // Week data is populated but should NOT leak into day mode.
    mockWeekResponse = [
      makeMultiTechDay("2026-04-25", [
        { techId: 99, appointmentIds: [9999] },
      ]),
    ];

    const { result } = renderHook(() => useCalendarWorldSnapshot(), {
      wrapper: Wrapper,
    });

    expect(result.current.appointments.map((a) => a.id).sort()).toEqual([
      100, 200,
    ]);
    // No week leakage — id 9999 is week-only.
    expect(
      result.current.appointments.find((a) => a.id === 9999),
    ).toBeUndefined();
  });

  // PR-UX-12 (2026-05-09): landscape canvas → world-snapshot uses week
  // query even when `viewMode === "day"`. Pre-fix the user rotated from
  // portrait day → landscape, dragged a card across days, and the
  // linter saw `dateCount === 1` (selectedDate only) → 0 conflicts on
  // every cross-day drop. Pin the contract: landscape always sources
  // from the week query, regardless of `viewMode`.
  it("landscape + viewMode === 'day' → snapshot still sources from week query", () => {
    mockViewMode = "day";
    mockOrientation = "landscape";
    mockSelectedDate = "2026-05-11"; // a Monday in the user's repro
    // Day data is populated and would have been the source pre-fix —
    // the test pins that landscape ignores it in favor of weekData.
    mockDayResponse = makeDayResponse(
      [makeCalendarAppointment({ id: 9999, scheduled_date: "2026-05-11" })],
      "2026-05-11",
    );
    mockWeekResponse = [
      makeMultiTechDay("2026-05-11", [
        { techId: 2054, appointmentIds: [1100, 1101] },
      ]),
      makeMultiTechDay("2026-05-12", [
        { techId: 2055, appointmentIds: [1200] },
      ]),
      makeMultiTechDay("2026-05-13", [
        // The conflict-on-target-day appointment in the user's repro.
        { techId: 2055, appointmentIds: [1300] },
      ]),
      makeMultiTechDay("2026-05-14", [
        { techId: 2056, appointmentIds: [1400] },
      ]),
      makeMultiTechDay("2026-05-15", []),
      makeMultiTechDay("2026-05-16", []),
      makeMultiTechDay("2026-05-17", []),
    ];

    const { result } = renderHook(() => useCalendarWorldSnapshot(), {
      wrapper: Wrapper,
    });

    // Cross-day appointments surface — the linter can now detect
    // overlaps when a card is dragged from May 11 onto May 13/14.
    expect(result.current.appointments.map((a) => a.id).sort()).toEqual([
      1100, 1101, 1200, 1300, 1400,
    ]);
    // Day data did NOT leak in — id 9999 is day-only.
    expect(
      result.current.appointments.find((a) => a.id === 9999),
    ).toBeUndefined();
  });

  it("week mode + staged intent filter → staged appointments excluded across all days", () => {
    mockViewMode = "week";
    mockSelectedDate = "2026-05-06";
    mockWeekResponse = [
      makeMultiTechDay("2026-05-04", [
        { techId: 2054, appointmentIds: [1001] },
      ]),
      makeMultiTechDay("2026-05-06", [
        { techId: 2055, appointmentIds: [1002, 1003] },
      ]),
      makeMultiTechDay("2026-05-07", []),
      makeMultiTechDay("2026-05-08", []),
      makeMultiTechDay("2026-05-09", []),
      makeMultiTechDay("2026-05-10", []),
      makeMultiTechDay("2026-05-05", []),
    ];

    // Stage an intent against 1002 — a different day from
    // selectedDate. Pre-fix the day-mode filter would have missed
    // this because 1002 lived on 2026-05-06 not the selected day.
    usePendingRealityStore.setState({
      session: makeSession({ id: 7001 }),
      sessionId: 7001,
      status: "draft",
      intents: [makeIntent(1, { appointment_id: 1002 })],
      linterIssues: [],
    });

    const { result } = renderHook(() => useCalendarWorldSnapshot(), {
      wrapper: Wrapper,
    });

    expect(result.current.appointments.map((a) => a.id).sort()).toEqual([
      1001, 1003,
    ]);
  });
});

// ──────────────────────────────────────────────────────────────────
// 6. Memoization (existing — pinned)
// ──────────────────────────────────────────────────────────────────

describe("useCalendarWorldSnapshot — memoization", () => {
  it("returns the SAME snapshot reference across renders when dayData ref is unchanged", () => {
    const a = makeCalendarAppointment({ id: 100 });
    mockDayResponse = makeDayResponse([a]);

    const { result, rerender } = renderHook(() => useCalendarWorldSnapshot(), {
      wrapper: Wrapper,
    });

    const first = result.current;
    rerender({});
    const second = result.current;

    expect(second).toBe(first);
  });

  it("returns a NEW snapshot reference when dayData ref changes", () => {
    const a = makeCalendarAppointment({ id: 100 });
    mockDayResponse = makeDayResponse([a]);

    const { result, rerender } = renderHook(() => useCalendarWorldSnapshot(), {
      wrapper: Wrapper,
    });

    const first = result.current;

    // Replace the day-view response with a new object reference
    // (different appointment ids → guarantees the recompute).
    const b = makeCalendarAppointment({ id: 200 });
    act(() => {
      mockDayResponse = makeDayResponse([b]);
    });
    rerender({});

    const second = result.current;
    expect(second).not.toBe(first);
    expect(second.appointments.map((x) => x.id)).toEqual([200]);
  });
});
