/**
 * Tests for `useCalendarDisplayLookups` (D2P-FE-13 follow-up,
 * 2026-04-26).
 *
 * Coverage:
 *   1. Pre-load → returns the stable `EMPTY_DISPLAY_LOOKUPS` constant
 *      (`===` referential identity, so consumers can short-circuit
 *      with `Object.is`).
 *   2. Loaded → maps every technician's `technician_id` →
 *      `technician_name` and every appointment's `id` →
 *      `customer_name`.
 *   3. Memoization — same returned reference across two renders if
 *      the underlying `dayData` reference is unchanged.
 */

import { renderHook } from "@testing-library/react-native";
import React from "react";

import {
  EMPTY_DISPLAY_LOOKUPS,
  useCalendarDisplayLookups,
} from "../use-calendar-display-lookups";
import type { CalendarDayResponse } from "@technician/types/calendar";

let mockDayResponse: CalendarDayResponse | undefined = undefined;
jest.mock("@technician/hooks/schedule/use-calendar", () => ({
  __esModule: true,
  useFranchiseDayView: () => ({ data: mockDayResponse, isLoading: false }),
  useTechnicianDayView: () => ({ data: mockDayResponse, isLoading: false }),
}));

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
jest.mock("@technician/stores/calendar", () => ({
  __esModule: true,
  useCalendarStore: <T,>(
    selector: (state: { selectedDate: string }) => T,
  ): T => selector({ selectedDate: mockSelectedDate }),
}));

function makeDayResponse(): CalendarDayResponse {
  return {
    date: "2026-04-25",
    technicians: [
      {
        technician_id: 5,
        technician_name: "Tech B",
        profile_image_url: null,
        job_count: 2,
        completed_count: 0,
        appointments: [
          {
            id: 100,
            customer_id: 401,
            customer_name: "Jane Doe",
          } as never,
          {
            id: 200,
            customer_id: 402,
            customer_name: "John Smith",
          } as never,
        ],
        personal_events: [
          { id: "pe-uuid-aaa", title: "Lunch break" } as never,
          { id: "pe-uuid-bbb", title: "Doctor appt" } as never,
        ],
      },
      {
        technician_id: 7,
        technician_name: "Tech G",
        profile_image_url: null,
        job_count: 0,
        completed_count: 0,
        appointments: [],
        personal_events: [
          { id: "pe-uuid-ccc", title: "" } as never, // empty title — must be skipped
          { id: "pe-uuid-ddd", title: null } as never, // null — must be skipped
        ],
      },
    ],
  } as CalendarDayResponse;
}

beforeEach(() => {
  mockDayResponse = undefined;
  mockAuthRole = "franchise_owner";
  mockSelectedDate = "2026-04-25";
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

describe("useCalendarDisplayLookups", () => {
  it("returns the stable EMPTY_DISPLAY_LOOKUPS constant pre-load", () => {
    mockDayResponse = undefined;
    const { result } = renderHook(() => useCalendarDisplayLookups(), {
      wrapper: Wrapper,
    });
    expect(result.current).toBe(EMPTY_DISPLAY_LOOKUPS);
    expect(result.current.appointmentLabels?.size ?? 0).toBe(0);
    expect(result.current.technicianNames?.size ?? 0).toBe(0);
  });

  it("projects every tech name and every customer label from the day-view response", () => {
    mockDayResponse = makeDayResponse();
    const { result } = renderHook(() => useCalendarDisplayLookups(), {
      wrapper: Wrapper,
    });

    expect(result.current.technicianNames?.get(5)).toBe("Tech B");
    expect(result.current.technicianNames?.get(7)).toBe("Tech G");

    expect(result.current.appointmentLabels?.get(100)).toBe("Jane Doe");
    expect(result.current.appointmentLabels?.get(200)).toBe("John Smith");
  });

  it("projects personal-event titles and skips empty / nullable titles", () => {
    mockDayResponse = makeDayResponse();
    const { result } = renderHook(() => useCalendarDisplayLookups(), {
      wrapper: Wrapper,
    });

    expect(result.current.personalEventTitles?.get("pe-uuid-aaa")).toBe(
      "Lunch break",
    );
    expect(result.current.personalEventTitles?.get("pe-uuid-bbb")).toBe(
      "Doctor appt",
    );
    // Empty + null titles are dropped rather than indexed with the
    // empty string — the consumer's "no entry → render bare
    // 'Personal event'" branch needs the absence to fire.
    expect(result.current.personalEventTitles?.has("pe-uuid-ccc")).toBe(false);
    expect(result.current.personalEventTitles?.has("pe-uuid-ddd")).toBe(false);
  });

  it("returns the same reference across re-renders when dayData is stable", () => {
    mockDayResponse = makeDayResponse();
    const { result, rerender } = renderHook(
      () => useCalendarDisplayLookups(),
      { wrapper: Wrapper },
    );
    const first = result.current;
    rerender({});
    expect(result.current).toBe(first);
  });
});
