import {
  type PlannedMove,
  applyPlannedMoves,
  dedupePlannedMoves,
  effectiveDurationForInsert,
  effectiveDurationForSwapSide,
  planMoveStopIds,
} from "@technician/utils/route-plan-moves";

// B2-2 (2026-05-22) — Unit coverage for the chip-bar plan-mode
// dedupe rule. The parent `<FranchiseRouteMap>` calls
// `dedupePlannedMoves` from `stagePlannedMove`; testing the helper
// in isolation sidesteps the parent's component-level test setup
// gap (QueryClient missing) so the staging behavior has a real
// guardrail.

const stdSwapWindow = { startHHMM: "09:00", endHHMM: "12:00" };
const stdInsertWindow = { startHHMM: "10:00", endHHMM: "14:00" };

function swap(
  aStopId: number,
  bStopId: number,
  overrides: Partial<Extract<PlannedMove, { kind: "swap" }>> = {},
): PlannedMove {
  return {
    kind: "swap",
    aStopId,
    bStopId,
    aNewStartHHMM: "10:00",
    bNewStartHHMM: "10:30",
    aWindow: stdSwapWindow,
    bWindow: stdSwapWindow,
    aDurationMinutes: 30,
    bDurationMinutes: 30,
    ...overrides,
  };
}

function insert(
  stopId: number,
  newStopOrder: number,
  overrides: Partial<Extract<PlannedMove, { kind: "insert" }>> = {},
): PlannedMove {
  return {
    kind: "insert",
    stopId,
    newStopOrder,
    newStartHHMM: "11:00",
    window: stdInsertWindow,
    durationMinutes: 45,
    ...overrides,
  };
}

describe("planMoveStopIds", () => {
  it("returns both ids for swap", () => {
    expect(Array.from(planMoveStopIds(swap(1, 2))).sort()).toEqual([1, 2]);
  });

  it("returns one id for insert", () => {
    expect(Array.from(planMoveStopIds(insert(7, 3)))).toEqual([7]);
  });
});

describe("dedupePlannedMoves", () => {
  it("appends a move when nothing overlaps", () => {
    const existing: PlannedMove[] = [insert(1, 2)];
    const next = insert(5, 4);
    const out = dedupePlannedMoves(existing, next);
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(existing[0]);
    expect(out[1]).toBe(next);
  });

  it("drops a prior insert for the same stop (last write wins)", () => {
    const existing: PlannedMove[] = [insert(1, 2)];
    const next = insert(1, 4, { newStartHHMM: "12:00" });
    const out = dedupePlannedMoves(existing, next);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(next);
  });

  it("drops a prior swap if either side overlaps the new insert's stop", () => {
    const existing: PlannedMove[] = [swap(1, 2)];
    const next = insert(2, 3);
    const out = dedupePlannedMoves(existing, next);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(next);
  });

  it("drops a prior insert if a new swap references that stop", () => {
    const existing: PlannedMove[] = [insert(5, 1)];
    const next = swap(5, 6);
    const out = dedupePlannedMoves(existing, next);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(next);
  });

  it("drops multiple prior moves if a new swap touches each of them", () => {
    const existing: PlannedMove[] = [insert(1, 4), insert(2, 5), insert(9, 6)];
    const next = swap(1, 2);
    const out = dedupePlannedMoves(existing, next);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(existing[2]);
    expect(out[1]).toEqual(next);
  });

  it("does not mutate the existing array", () => {
    const existing: PlannedMove[] = [insert(1, 2)];
    const snapshot = [...existing];
    dedupePlannedMoves(existing, insert(1, 4));
    expect(existing).toEqual(snapshot);
  });

  it("preserves relative order of un-touched moves", () => {
    const a = insert(1, 2);
    const b = insert(2, 3);
    const c = insert(3, 4);
    const next = insert(2, 5);
    const out = dedupePlannedMoves([a, b, c], next);
    // b is dropped (overlaps `next.stopId === 2`); a and c keep
    // their relative order; next is appended at the tail.
    expect(out).toEqual([a, c, next]);
  });
});

// B2-3 (2026-05-22) — applyPlannedMoves: reducer over staged plan.

interface TestStop {
  stopId: number;
  stopOrder: number;
  scheduledTime: string | null;
  scheduledEndTime: string | null;
}

function s(
  stopId: number,
  stopOrder: number,
  scheduledTime: string | null = null,
  scheduledEndTime: string | null = null,
): TestStop {
  return { stopId, stopOrder, scheduledTime, scheduledEndTime };
}

describe("applyPlannedMoves", () => {
  it("returns the input identity-mapped (modulo re-index) when moves is empty", () => {
    const stops = [s(1, 1), s(2, 2), s(3, 3)];
    const out = applyPlannedMoves(stops, []);
    expect(out).toEqual(stops);
  });

  it("does not mutate the input arrays", () => {
    const stops = [s(1, 1, "09:00", "09:30"), s(2, 2, "10:00", "10:30")];
    const snapshot = stops.map((x) => ({ ...x }));
    const move: PlannedMove = {
      kind: "swap",
      aStopId: 1,
      bStopId: 2,
      aNewStartHHMM: "10:00",
      bNewStartHHMM: "09:00",
      aWindow: { startHHMM: "08:00", endHHMM: "12:00" },
      bWindow: { startHHMM: "08:00", endHHMM: "12:00" },
      aDurationMinutes: 30,
      bDurationMinutes: 30,
    };
    applyPlannedMoves(stops, [move]);
    expect(stops).toEqual(snapshot);
  });

  describe("swap", () => {
    it("swaps two adjacent stops' positions and times", () => {
      const stops = [
        s(1, 1, "09:00", "09:30"),
        s(2, 2, "10:00", "10:30"),
        s(3, 3, "11:00", "11:30"),
      ];
      const out = applyPlannedMoves(stops, [
        {
          kind: "swap",
          aStopId: 1,
          bStopId: 2,
          aNewStartHHMM: "10:00",
          bNewStartHHMM: "09:00",
          aWindow: { startHHMM: "08:00", endHHMM: "12:00" },
          bWindow: { startHHMM: "08:00", endHHMM: "12:00" },
          aDurationMinutes: 30,
          bDurationMinutes: 30,
        },
      ]);
      // Post-swap, the array is [stop2 (now at order 1, time 09:00),
      // stop1 (now at order 2, time 10:00), stop3 unchanged].
      expect(out.map((x) => x.stopId)).toEqual([2, 1, 3]);
      expect(out.map((x) => x.stopOrder)).toEqual([1, 2, 3]);
      expect(out[0]).toMatchObject({
        stopId: 2,
        scheduledTime: "09:00",
        scheduledEndTime: "09:30",
      });
      expect(out[1]).toMatchObject({
        stopId: 1,
        scheduledTime: "10:00",
        scheduledEndTime: "10:30",
      });
    });

    it("swaps non-adjacent stops", () => {
      const stops = [s(1, 1), s(2, 2), s(3, 3), s(4, 4)];
      const out = applyPlannedMoves(stops, [
        {
          kind: "swap",
          aStopId: 1,
          bStopId: 4,
          aNewStartHHMM: "15:00",
          bNewStartHHMM: "09:00",
          aWindow: { startHHMM: "08:00", endHHMM: "18:00" },
          bWindow: { startHHMM: "08:00", endHHMM: "18:00" },
          aDurationMinutes: 60,
          bDurationMinutes: 60,
        },
      ]);
      expect(out.map((x) => x.stopId)).toEqual([4, 2, 3, 1]);
      expect(out.map((x) => x.stopOrder)).toEqual([1, 2, 3, 4]);
    });

    it("silently skips a swap referencing a missing stop", () => {
      const stops = [s(1, 1), s(2, 2)];
      const out = applyPlannedMoves(stops, [
        {
          kind: "swap",
          aStopId: 1,
          bStopId: 99,
          aNewStartHHMM: "10:00",
          bNewStartHHMM: "09:00",
          aWindow: { startHHMM: "08:00", endHHMM: "12:00" },
          bWindow: { startHHMM: "08:00", endHHMM: "12:00" },
          aDurationMinutes: 30,
          bDurationMinutes: 30,
        },
      ]);
      // Stale move; nothing changes (modulo reindex, which is a
      // no-op here because the input was already 1-indexed).
      expect(out.map((x) => x.stopId)).toEqual([1, 2]);
      expect(out.map((x) => x.stopOrder)).toEqual([1, 2]);
    });
  });

  describe("insert", () => {
    it("moves a stop forward in the route", () => {
      const stops = [s(1, 1), s(2, 2), s(3, 3), s(4, 4)];
      const out = applyPlannedMoves(stops, [
        {
          kind: "insert",
          stopId: 4,
          newStopOrder: 2,
          newStartHHMM: "10:00",
          window: { startHHMM: "09:00", endHHMM: "12:00" },
          durationMinutes: 30,
        },
      ]);
      expect(out.map((x) => x.stopId)).toEqual([1, 4, 2, 3]);
      expect(out.map((x) => x.stopOrder)).toEqual([1, 2, 3, 4]);
      expect(out[1]).toMatchObject({
        stopId: 4,
        scheduledTime: "10:00",
        scheduledEndTime: "10:30",
      });
    });

    it("moves a stop backward in the route", () => {
      const stops = [s(1, 1), s(2, 2), s(3, 3), s(4, 4)];
      const out = applyPlannedMoves(stops, [
        {
          kind: "insert",
          stopId: 1,
          newStopOrder: 3,
          newStartHHMM: "14:00",
          window: { startHHMM: "13:00", endHHMM: "16:00" },
          durationMinutes: 45,
        },
      ]);
      expect(out.map((x) => x.stopId)).toEqual([2, 3, 1, 4]);
      expect(out.map((x) => x.stopOrder)).toEqual([1, 2, 3, 4]);
      expect(out[2]).toMatchObject({
        stopId: 1,
        scheduledTime: "14:00",
        scheduledEndTime: "14:45",
      });
    });

    it("clamps newStopOrder past the end to the last position", () => {
      const stops = [s(1, 1), s(2, 2), s(3, 3)];
      const out = applyPlannedMoves(stops, [
        {
          kind: "insert",
          stopId: 1,
          newStopOrder: 99,
          newStartHHMM: "15:00",
          window: { startHHMM: "14:00", endHHMM: "16:00" },
          durationMinutes: 30,
        },
      ]);
      expect(out.map((x) => x.stopId)).toEqual([2, 3, 1]);
    });

    it("silently skips an insert referencing a missing stop", () => {
      const stops = [s(1, 1), s(2, 2)];
      const out = applyPlannedMoves(stops, [
        {
          kind: "insert",
          stopId: 99,
          newStopOrder: 1,
          newStartHHMM: "10:00",
          window: { startHHMM: "09:00", endHHMM: "12:00" },
          durationMinutes: 30,
        },
      ]);
      expect(out.map((x) => x.stopId)).toEqual([1, 2]);
    });
  });

  // B2-7 (2026-05-22) — duration overrides drive end-time math.
  // The base `aDurationMinutes` / `bDurationMinutes` / `durationMinutes`
  // stays pinned at the original (so the sheet's dirty-hint has a
  // stable reference); the override (when set) is what
  // `applyPlannedMoves` actually uses for `scheduledEndTime`.
  describe("duration overrides (B2-7)", () => {
    it("uses aDurationOverrideMin for the A-side end time on a swap", () => {
      const stops = [s(1, 1, "09:00", "09:30"), s(2, 2, "10:00", "10:30")];
      const out = applyPlannedMoves(stops, [
        {
          kind: "swap",
          aStopId: 1,
          bStopId: 2,
          aNewStartHHMM: "10:00",
          bNewStartHHMM: "09:00",
          aWindow: { startHHMM: "08:00", endHHMM: "12:00" },
          bWindow: { startHHMM: "08:00", endHHMM: "12:00" },
          aDurationMinutes: 30,
          bDurationMinutes: 30,
          aDurationOverrideMin: 60,
        },
      ]);
      // Stop 1 lands at order 2 with the OVERRIDE-derived end time.
      // Stop 2 lands at order 1 with the BASE-derived end time
      // (no B-side override → falls through to bDurationMinutes).
      const movedAt2 = out.find((x) => x.stopId === 1);
      const movedAt1 = out.find((x) => x.stopId === 2);
      expect(movedAt2).toMatchObject({
        scheduledTime: "10:00",
        scheduledEndTime: "11:00",
      });
      expect(movedAt1).toMatchObject({
        scheduledTime: "09:00",
        scheduledEndTime: "09:30",
      });
    });

    it("uses bDurationOverrideMin for the B-side end time on a swap", () => {
      const stops = [s(1, 1, "09:00", "09:30"), s(2, 2, "10:00", "10:30")];
      const out = applyPlannedMoves(stops, [
        {
          kind: "swap",
          aStopId: 1,
          bStopId: 2,
          aNewStartHHMM: "10:00",
          bNewStartHHMM: "09:00",
          aWindow: { startHHMM: "08:00", endHHMM: "12:00" },
          bWindow: { startHHMM: "08:00", endHHMM: "12:00" },
          aDurationMinutes: 30,
          bDurationMinutes: 30,
          bDurationOverrideMin: 45,
        },
      ]);
      const movedAt1 = out.find((x) => x.stopId === 2);
      expect(movedAt1).toMatchObject({
        scheduledTime: "09:00",
        scheduledEndTime: "09:45",
      });
    });

    it("uses durationOverrideMin for an insert's end time", () => {
      const stops = [s(1, 1), s(2, 2), s(3, 3), s(4, 4)];
      const out = applyPlannedMoves(stops, [
        {
          kind: "insert",
          stopId: 4,
          newStopOrder: 2,
          newStartHHMM: "10:00",
          window: { startHHMM: "09:00", endHHMM: "13:00" },
          durationMinutes: 30,
          durationOverrideMin: 90,
        },
      ]);
      const moved = out.find((x) => x.stopId === 4);
      expect(moved).toMatchObject({
        scheduledTime: "10:00",
        scheduledEndTime: "11:30",
      });
    });

    it("falls back to the base duration when no override is set", () => {
      // Regression guard — undefined override MUST behave identically
      // to a pre-B2-7 move (which had no override field at all). The
      // earlier swap/insert specs above already exercise the base
      // path; this is an explicit check on the helper boundary.
      const baseSwap = {
        kind: "swap" as const,
        aStopId: 1,
        bStopId: 2,
        aNewStartHHMM: "10:00",
        bNewStartHHMM: "09:00",
        aWindow: { startHHMM: "08:00", endHHMM: "12:00" },
        bWindow: { startHHMM: "08:00", endHHMM: "12:00" },
        aDurationMinutes: 30,
        bDurationMinutes: 45,
      };
      expect(effectiveDurationForSwapSide(baseSwap, "a")).toBe(30);
      expect(effectiveDurationForSwapSide(baseSwap, "b")).toBe(45);
      const baseInsert = {
        kind: "insert" as const,
        stopId: 1,
        newStopOrder: 2,
        newStartHHMM: "10:00",
        window: { startHHMM: "09:00", endHHMM: "12:00" },
        durationMinutes: 30,
      };
      expect(effectiveDurationForInsert(baseInsert)).toBe(30);
    });

    it("override wins over base in the helpers", () => {
      expect(
        effectiveDurationForSwapSide(
          {
            kind: "swap",
            aStopId: 1,
            bStopId: 2,
            aNewStartHHMM: "10:00",
            bNewStartHHMM: "09:00",
            aWindow: { startHHMM: "08:00", endHHMM: "12:00" },
            bWindow: { startHHMM: "08:00", endHHMM: "12:00" },
            aDurationMinutes: 30,
            bDurationMinutes: 30,
            aDurationOverrideMin: 60,
          },
          "a",
        ),
      ).toBe(60);
      expect(
        effectiveDurationForInsert({
          kind: "insert",
          stopId: 1,
          newStopOrder: 2,
          newStartHHMM: "10:00",
          window: { startHHMM: "09:00", endHHMM: "12:00" },
          durationMinutes: 30,
          durationOverrideMin: 90,
        }),
      ).toBe(90);
    });
  });

  describe("multi-move replay", () => {
    it("applies moves in order; second move sees first move's effect", () => {
      const stops = [s(1, 1), s(2, 2), s(3, 3)];
      const out = applyPlannedMoves(stops, [
        // After swap: [2, 1, 3]
        {
          kind: "swap",
          aStopId: 1,
          bStopId: 2,
          aNewStartHHMM: "10:00",
          bNewStartHHMM: "09:00",
          aWindow: { startHHMM: "08:00", endHHMM: "12:00" },
          bWindow: { startHHMM: "08:00", endHHMM: "12:00" },
          aDurationMinutes: 30,
          bDurationMinutes: 30,
        },
        // Now insert stop 3 at position 1: [3, 2, 1]
        {
          kind: "insert",
          stopId: 3,
          newStopOrder: 1,
          newStartHHMM: "08:30",
          window: { startHHMM: "08:00", endHHMM: "12:00" },
          durationMinutes: 30,
        },
      ]);
      expect(out.map((x) => x.stopId)).toEqual([3, 2, 1]);
      expect(out.map((x) => x.stopOrder)).toEqual([1, 2, 3]);
    });
  });
});
