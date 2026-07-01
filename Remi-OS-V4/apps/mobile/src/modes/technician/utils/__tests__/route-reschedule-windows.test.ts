/**
 * Phase 4 — unit tests for the pure window-derivation helpers
 * used by the franchise route map to open `<DragRescheduleSheet>`
 * in swap mode. Co-located with the helper (see
 * `src/utils/route-reschedule-windows.ts`).
 */

import type { MapStop } from "@technician/types/api";
import {
  DEFAULT_FALLBACK_DURATION_MIN,
  DISPATCH_DAY_END_HHMM,
  DISPATCH_DAY_START_HHMM,
  computeInsertWindow,
  computeSwapWindows,
  deriveDurationMinutes,
} from "@technician/utils/route-reschedule-windows";

function stop(
  partial: Partial<MapStop> & { stopId: number; appointmentId: number },
): MapStop {
  return {
    stopId: partial.stopId,
    appointmentId: partial.appointmentId,
    stopOrder: partial.stopOrder ?? 0,
    lat: partial.lat ?? 40,
    lng: partial.lng ?? -74,
    customerName: partial.customerName ?? `Customer ${partial.stopId}`,
    addressLine: partial.addressLine ?? "123 Main St",
    city: partial.city ?? "Anywhere",
    scheduledTime: partial.scheduledTime ?? null,
    scheduledEndTime: partial.scheduledEndTime ?? null,
    serviceNames: partial.serviceNames ?? null,
    status: partial.status ?? "scheduled",
    estimatedArrival: partial.estimatedArrival ?? null,
    actualArrival: partial.actualArrival ?? null,
  };
}

describe("deriveDurationMinutes", () => {
  it("derives duration from scheduledTime/scheduledEndTime", () => {
    const s = stop({
      stopId: 1,
      appointmentId: 10,
      scheduledTime: "09:00:00",
      scheduledEndTime: "10:30:00",
    });
    expect(deriveDurationMinutes(s)).toBe(90);
  });

  it("falls back when start is null", () => {
    const s = stop({
      stopId: 1,
      appointmentId: 10,
      scheduledTime: null,
      scheduledEndTime: "10:30:00",
    });
    expect(deriveDurationMinutes(s)).toBe(DEFAULT_FALLBACK_DURATION_MIN);
  });

  it("falls back when end is null", () => {
    const s = stop({
      stopId: 1,
      appointmentId: 10,
      scheduledTime: "09:00:00",
      scheduledEndTime: null,
    });
    expect(deriveDurationMinutes(s)).toBe(DEFAULT_FALLBACK_DURATION_MIN);
  });

  it("falls back when end <= start", () => {
    const s = stop({
      stopId: 1,
      appointmentId: 10,
      scheduledTime: "10:00:00",
      scheduledEndTime: "10:00:00",
    });
    expect(deriveDurationMinutes(s)).toBe(DEFAULT_FALLBACK_DURATION_MIN);
  });

  it("falls back when either side is unparseable", () => {
    const s = stop({
      stopId: 1,
      appointmentId: 10,
      scheduledTime: "bad",
      scheduledEndTime: "10:00:00",
    });
    expect(deriveDurationMinutes(s)).toBe(DEFAULT_FALLBACK_DURATION_MIN);
  });

  it("accepts HH:MM (no seconds)", () => {
    const s = stop({
      stopId: 1,
      appointmentId: 10,
      scheduledTime: "09:00",
      scheduledEndTime: "10:00",
    });
    expect(deriveDurationMinutes(s)).toBe(60);
  });
});

describe("computeSwapWindows", () => {
  const route: MapStop[] = [
    stop({
      stopId: 1,
      appointmentId: 11,
      scheduledTime: "08:00:00",
      scheduledEndTime: "09:00:00",
    }),
    stop({
      stopId: 2,
      appointmentId: 12,
      scheduledTime: "10:00:00",
      scheduledEndTime: "11:00:00",
    }),
    stop({
      stopId: 3,
      appointmentId: 13,
      scheduledTime: "12:00:00",
      scheduledEndTime: "13:30:00",
    }),
    stop({
      stopId: 4,
      appointmentId: 14,
      scheduledTime: "14:00:00",
      scheduledEndTime: "15:00:00",
    }),
  ];

  it("returns null when dragged stop isn't in pendingOrder", () => {
    expect(computeSwapWindows(route, 999, 2)).toBeNull();
  });

  it("returns null when target stop isn't in pendingOrder", () => {
    expect(computeSwapWindows(route, 1, 999)).toBeNull();
  });

  it("returns null when dragged === target (defensive)", () => {
    expect(computeSwapWindows(route, 2, 2)).toBeNull();
  });

  it("middle-vs-middle swap: A's window = B's old neighborhood, B's = A's", () => {
    // Drag stop 2 onto stop 3. A=2 at idx 1, B=3 at idx 2.
    // A's window = B's neighborhood = [stops[1].endTime, stops[3].startTime]
    //   = [10:00:00 .. wait, idx 1 is A itself, idx 3 is "14:00:00"].
    // Per the documented adjacency edge case the plan says the
    // bound IS A's pre-swap endTime when they're adjacent.
    const result = computeSwapWindows(route, 2, 3);
    expect(result).not.toBeNull();
    expect(result!.aWindow).toEqual({
      startHHMM: "11:00:00", // stops[1].scheduledEndTime (A's own old end)
      endHHMM: "14:00:00", // stops[3].scheduledTime
    });
    expect(result!.bWindow).toEqual({
      startHHMM: "09:00:00", // stops[0].scheduledEndTime
      endHHMM: "12:00:00", // stops[2].scheduledTime (B's own old start)
    });
  });

  it("defaults equal the OTHER side's pre-swap scheduledTime (auto-trade parity)", () => {
    const result = computeSwapWindows(route, 2, 3);
    expect(result!.aDefaultStartHHMM).toBe("12:00:00"); // B's old start
    expect(result!.bDefaultStartHHMM).toBe("10:00:00"); // A's old start
  });

  it("derives each side's duration independently from its own appointment", () => {
    const result = computeSwapWindows(route, 2, 3);
    expect(result!.aDurationMinutes).toBe(60); // stop 2: 10-11
    expect(result!.bDurationMinutes).toBe(90); // stop 3: 12-13:30
  });

  it("front-of-route swap clamps window start to dispatcher day start", () => {
    // Drag stop 4 onto stop 1. B=1 at idx 0 → A's window left bound
    // falls off the front → DISPATCH_DAY_START_HHMM.
    const result = computeSwapWindows(route, 4, 1);
    expect(result!.aWindow.startHHMM).toBe(DISPATCH_DAY_START_HHMM);
    expect(result!.aWindow.endHHMM).toBe("10:00:00"); // stops[1].scheduledTime
  });

  it("back-of-route swap clamps window end to dispatcher day end", () => {
    // Drag stop 1 onto stop 4. B=4 at idx 3 → A's window right bound
    // falls off the back → DISPATCH_DAY_END_HHMM.
    const result = computeSwapWindows(route, 1, 4);
    expect(result!.aWindow.startHHMM).toBe("13:30:00"); // stops[2].scheduledEndTime
    expect(result!.aWindow.endHHMM).toBe(DISPATCH_DAY_END_HHMM);
  });

  it("falls back to dispatcher day bounds when a neighbor has null times", () => {
    const routeWithNullNeighbor: MapStop[] = [
      stop({
        stopId: 1,
        appointmentId: 11,
        scheduledTime: null, // pretend stop 1 is unrouted (no times yet)
        scheduledEndTime: null,
      }),
      stop({
        stopId: 2,
        appointmentId: 12,
        scheduledTime: "10:00:00",
        scheduledEndTime: "11:00:00",
      }),
      stop({
        stopId: 3,
        appointmentId: 13,
        scheduledTime: null, // also unrouted — exercises the default fallback
        scheduledEndTime: null,
      }),
    ];
    // Drag stop 3 onto stop 2 → A=3 (idx 2), B=2 (idx 1).
    // A's window = B's neighborhood = [stop1.endTime, stop3.startTime]
    //   = [null → DISPATCH_DAY_START_HHMM, null → DISPATCH_DAY_END_HHMM].
    const result = computeSwapWindows(routeWithNullNeighbor, 3, 2);
    expect(result!.aWindow.startHHMM).toBe(DISPATCH_DAY_START_HHMM);
    expect(result!.aWindow.endHHMM).toBe(DISPATCH_DAY_END_HHMM);
    // B's default = A's scheduledTime, which is null → fallback to
    // dispatcher day start. (The sheet will mark this an unusual
    // case but won't crash.)
    expect(result!.bDefaultStartHHMM).toBe(DISPATCH_DAY_START_HHMM);
    // A's duration falls back when its own scheduledTime is null.
    expect(result!.aDurationMinutes).toBe(DEFAULT_FALLBACK_DURATION_MIN);
  });
});

describe("computeInsertWindow", () => {
  // Same canonical 4-stop route used for SWAP tests, expanded so
  // INSERT-specific edge cases (front, back, middle, same-slot
  // no-op) all have well-defined neighbors.
  //   1: 09:00-09:30
  //   2: 10:00-11:00
  //   3: 12:00-13:30
  //   4: 14:00-15:00
  const route: MapStop[] = [
    stop({
      stopId: 1,
      appointmentId: 11,
      stopOrder: 1,
      scheduledTime: "09:00:00",
      scheduledEndTime: "09:30:00",
    }),
    stop({
      stopId: 2,
      appointmentId: 12,
      stopOrder: 2,
      scheduledTime: "10:00:00",
      scheduledEndTime: "11:00:00",
    }),
    stop({
      stopId: 3,
      appointmentId: 13,
      stopOrder: 3,
      scheduledTime: "12:00:00",
      scheduledEndTime: "13:30:00",
    }),
    stop({
      stopId: 4,
      appointmentId: 14,
      stopOrder: 4,
      scheduledTime: "14:00:00",
      scheduledEndTime: "15:00:00",
    }),
  ];

  it("returns null when draggedStopId is not in pendingOrder", () => {
    expect(computeInsertWindow(route, 999, 0)).toBeNull();
  });

  it("returns null when insertAtIndex is negative", () => {
    expect(computeInsertWindow(route, 2, -1)).toBeNull();
  });

  it("returns null when insertAtIndex is past the end of the without-dragged sequence", () => {
    // route has 4 stops; without dragged = 3 stops; valid indices = [0..3].
    expect(computeInsertWindow(route, 2, 4)).toBeNull();
  });

  it("middle insert: window is [prevEnd, nextStart] and newStopOrder = idx + 1", () => {
    // Drop stop 4 between stops 1 and 2 (at index 1 in [1,2,3]).
    // newLeft = stop 1, newRight = stop 2.
    const result = computeInsertWindow(route, 4, 1);
    expect(result).not.toBeNull();
    expect(result!.window).toEqual({
      startHHMM: "09:30:00",
      endHHMM: "10:00:00",
    });
    expect(result!.newStopOrder).toBe(2);
    expect(result!.durationMinutes).toBe(60); // stop 4: 14-15
  });

  it("front insert: window left bound falls back to dispatcher day start", () => {
    // Drop stop 4 at the very front (index 0 in [1,2,3]).
    // newLeft = null → DISPATCH_DAY_START_HHMM; newRight = stop 1.
    const result = computeInsertWindow(route, 4, 0);
    expect(result!.window).toEqual({
      startHHMM: DISPATCH_DAY_START_HHMM,
      endHHMM: "09:00:00",
    });
    expect(result!.newStopOrder).toBe(1);
  });

  it("back insert: window right bound falls back to dispatcher day end", () => {
    // Drop stop 1 at the very back (index 3 in [2,3,4]).
    // newLeft = stop 4, newRight = null → DISPATCH_DAY_END_HHMM.
    const result = computeInsertWindow(route, 1, 3);
    expect(result!.window).toEqual({
      startHHMM: "15:00:00",
      endHHMM: DISPATCH_DAY_END_HHMM,
    });
    expect(result!.newStopOrder).toBe(4);
  });

  it("self-position insert (dropping a chip back where it came from) still returns a valid window", () => {
    // Dragging stop 2 and dropping at index 1 in the without-2
    // sequence [1,3,4] puts it between stops 1 and 3 — i.e. the
    // slot it already occupies. The helper does NOT short-circuit
    // this; the caller (chip bar) is responsible for the no-op
    // guard before invoking this helper.
    const result = computeInsertWindow(route, 2, 1);
    expect(result).not.toBeNull();
    expect(result!.window).toEqual({
      startHHMM: "09:30:00", // stop 1 end
      endHHMM: "12:00:00", // stop 3 start
    });
    expect(result!.newStopOrder).toBe(2);
  });

  it("derives duration from the dragged stop's own appointment", () => {
    // Stop 3 spans 12:00-13:30 = 90 minutes.
    const result = computeInsertWindow(route, 3, 0);
    expect(result!.durationMinutes).toBe(90);
  });

  it("falls back to dispatcher day bounds when a neighbor has null times", () => {
    const routeWithNullNeighbor: MapStop[] = [
      stop({
        stopId: 1,
        appointmentId: 11,
        scheduledTime: null, // unrouted neighbor on the left
        scheduledEndTime: null,
      }),
      stop({
        stopId: 2,
        appointmentId: 12,
        scheduledTime: "10:00:00",
        scheduledEndTime: "11:00:00",
      }),
      stop({
        stopId: 3,
        appointmentId: 13,
        scheduledTime: null, // also unrouted — exercises the fallback
        scheduledEndTime: null,
      }),
    ];
    // Drop stop 3 at index 1 (between stops 1 and 2 in the
    // without-dragged sequence [1, 2]). newLeft = stop 1 (null
    // times → DISPATCH_DAY_START_HHMM); newRight = stop 2.
    const result = computeInsertWindow(routeWithNullNeighbor, 3, 1);
    expect(result!.window).toEqual({
      startHHMM: DISPATCH_DAY_START_HHMM,
      endHHMM: "10:00:00",
    });
    // Dragged stop 3 has null times → duration falls back.
    expect(result!.durationMinutes).toBe(DEFAULT_FALLBACK_DURATION_MIN);
  });
});
