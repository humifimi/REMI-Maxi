/**
 * Phase 7b — unit tests for the chip-bar's snap-zone classifier.
 *
 * Locks in the off-end (drag-to-front / drag-to-back) behavior the
 * Phase 7b plan called out:
 *
 *   - Drop before the FIRST chip → INSERT landing slot 0.
 *   - Drop after the LAST chip → INSERT landing slot N - 1.
 *   - Drop the LAST chip onto the FRONT, or the FIRST chip onto the
 *     BACK → same shape, with the active chip on the far side of
 *     the gap.
 *   - Drop a chip past its own edge with no other chip on that side
 *     (chip 0 further left, or chip N-1 further right) → NOOP, not
 *     a spurious INSERT.
 *
 * Pairs with `computeInsertWindow`'s "front insert" /
 * "back insert" tests (`route-reschedule-windows.test.ts` lines
 * 288-308), which lock the WINDOW that the sheet receives once
 * the classifier produces an off-end landing slot.
 */

import {
  CHIP_CELL_FALLBACK,
  SWAP_ZONE_HALF_WIDTH_PX,
} from "@technician/utils/chip-bar-snap-zone-constants";
import { classifySnapZone } from "@technician/utils/chip-bar-snap-zone";

// All tests use the production cell size (54) so the SWAP /
// INSERT band math matches the chip bar at run time. The
// classifier accepts other sizes; coverage for that lives in
// the "tuning knobs" describe at the bottom.
const CELL_SIZE = CHIP_CELL_FALLBACK; // 54

/**
 * Convert a target slot index + within-slot offset (in pixels) to
 * the `slotApprox` value the classifier expects. Makes the tests
 * read like "the dragged chip is centered on slot 2" rather than
 * "the dragged chip's slotApprox is 2.0".
 */
function slotApproxAt(slot: number, offsetPx: number = 0): number {
  return slot + offsetPx / CELL_SIZE;
}

describe("classifySnapZone — degenerate inputs", () => {
  it("returns noop when no drag is in progress (activeIdx < 0)", () => {
    expect(
      classifySnapZone({
        slotApprox: 0.5,
        cellSize: CELL_SIZE,
        activeIdx: -1,
        N: 3,
      }),
    ).toEqual({ kind: "noop" });
  });

  it("returns noop when the bar is empty (N === 0)", () => {
    expect(
      classifySnapZone({
        slotApprox: 0,
        cellSize: CELL_SIZE,
        activeIdx: 0,
        N: 0,
      }),
    ).toEqual({ kind: "noop" });
  });

  it("uses the fallback cell size when DFL hasn't measured yet", () => {
    // cellSize = 0 → classifier swaps in CHIP_CELL_FALLBACK so the
    // SWAP / INSERT band math still works. Without the fallback the
    // distance-from-center calc would divide by zero / always be 0.
    // Active = slot 1 in a 3-chip bar; drag JUST past slot 0's
    // center (slotApprox = 0 + small) → SWAP zone with chip 0.
    const decision = classifySnapZone({
      slotApprox: 0,
      cellSize: 0,
      activeIdx: 1,
      N: 3,
    });
    expect(decision).toEqual({ kind: "swap", targetIdx: 0 });
  });
});

describe("classifySnapZone — SWAP zone", () => {
  // Standard 3-chip bar, active = slot 0 (drag chip A).
  const params = { cellSize: CELL_SIZE, activeIdx: 0, N: 3 };

  it("fires SWAP when dragged center is EXACTLY on another chip's center", () => {
    expect(classifySnapZone({ ...params, slotApprox: 1.0 })).toEqual({
      kind: "swap",
      targetIdx: 1,
    });
  });

  it("fires SWAP within ±SWAP_ZONE_HALF_WIDTH_PX of another chip's center", () => {
    const inside = (SWAP_ZONE_HALF_WIDTH_PX - 1) / CELL_SIZE;
    expect(
      classifySnapZone({ ...params, slotApprox: 1 + inside }),
    ).toEqual({ kind: "swap", targetIdx: 1 });
    expect(
      classifySnapZone({ ...params, slotApprox: 1 - inside }),
    ).toEqual({ kind: "swap", targetIdx: 1 });
  });

  it("falls through to INSERT outside the SWAP zone", () => {
    // Just outside the SWAP zone toward slot 2.
    const outside = (SWAP_ZONE_HALF_WIDTH_PX + 1) / CELL_SIZE;
    const decision = classifySnapZone({
      ...params,
      slotApprox: 1 + outside,
    });
    expect(decision.kind).toBe("insert");
  });

  it("never fires SWAP against the active chip's own slot (noop band)", () => {
    expect(classifySnapZone({ ...params, slotApprox: 0 })).toEqual({
      kind: "noop",
    });
  });

  it("respects a custom swapZoneHalfWidthPx override", () => {
    // Half-cell-wide SWAP zone — drag halfway between slot 0 and 1
    // still counts as SWAP with chip 1 (the nearer slot).
    const wide = CELL_SIZE / 2;
    expect(
      classifySnapZone({
        ...params,
        slotApprox: 0.75,
        swapZoneHalfWidthPx: wide,
      }),
    ).toEqual({ kind: "swap", targetIdx: 1 });
  });
});

describe("classifySnapZone — INSERT (between-chips)", () => {
  // 4-chip bar, active = slot 0 (drag chip A).
  const params = { cellSize: CELL_SIZE, activeIdx: 0, N: 4 };

  it("inserts into the gap between two middle chips", () => {
    // Drag chip 0 to between chips 1 and 2 (slotApprox ≈ 1.6 —
    // outside both swap zones, in the gap nearest to slot 2's
    // left edge). After removing active, landing slot is 1.
    const decision = classifySnapZone({ ...params, slotApprox: 1.6 });
    expect(decision).toEqual({
      kind: "insert",
      landingSlot: 1,
      leftCellIdx: 1,
      rightCellIdx: 2,
      dramaticShift: "none",
    });
  });

  it("inserts into the gap between the last two chips", () => {
    const decision = classifySnapZone({ ...params, slotApprox: 2.6 });
    expect(decision).toEqual({
      kind: "insert",
      landingSlot: 2,
      leftCellIdx: 2,
      rightCellIdx: 3,
      dramaticShift: "none",
    });
  });
});

describe("classifySnapZone — INSERT off-end (Phase 7b)", () => {
  // Phase 7b focus area: dragging past the FIRST or LAST chip
  // should reliably produce landing slot 0 or N-1 so the
  // dispatcher can drop "at the front of the route" / "at the
  // back of the route" without having to fight the geometry.

  describe("drag a middle chip past the FIRST chip → landing slot 0", () => {
    // 4-chip bar, drag chip at slot 2.
    const params = { cellSize: CELL_SIZE, activeIdx: 2, N: 4 };

    it("just past the first chip's left edge (slotApprox negative)", () => {
      // Drag the active chip's top-left past the bar's left edge.
      const decision = classifySnapZone({ ...params, slotApprox: -0.5 });
      expect(decision.kind).toBe("insert");
      if (decision.kind !== "insert") return;
      expect(decision.landingSlot).toBe(0);
      // Phase 7c (2026-05-22): off-end drops at the front fire
      // dramaticShift = "front" and force both half-cell split-
      // shift indices to -1. The DFL fork's shiftAllBeforeIdx
      // (FORK Phase 3) owns the visual instead.
      expect(decision.dramaticShift).toBe("front");
      expect(decision.leftCellIdx).toBe(-1);
      expect(decision.rightCellIdx).toBe(-1);
    });

    it("way past the first chip (slotApprox very negative)", () => {
      const decision = classifySnapZone({ ...params, slotApprox: -3.5 });
      expect(decision.kind).toBe("insert");
      if (decision.kind !== "insert") return;
      expect(decision.landingSlot).toBe(0);
    });
  });

  describe("drag a middle chip past the LAST chip → landing slot N-1", () => {
    // 4-chip bar, drag chip at slot 1.
    const params = { cellSize: CELL_SIZE, activeIdx: 1, N: 4 };

    it("just past the last chip's right edge (slotApprox > N - 0.5)", () => {
      const decision = classifySnapZone({ ...params, slotApprox: 3.6 });
      expect(decision.kind).toBe("insert");
      if (decision.kind !== "insert") return;
      // After removing active from a 4-chip bar, valid landing
      // slots are [0..3]; the back-of-route slot is 3 = N - 1.
      expect(decision.landingSlot).toBe(3);
      // Phase 7c (2026-05-22): symmetric off-end drop at the back
      // → dramaticShift = "back" + both split-shift indices -1.
      // shiftAllAfterIdx owns the visual.
      expect(decision.dramaticShift).toBe("back");
      expect(decision.leftCellIdx).toBe(-1);
      expect(decision.rightCellIdx).toBe(-1);
    });

    it("way past the last chip (slotApprox very high)", () => {
      const decision = classifySnapZone({ ...params, slotApprox: 7.5 });
      expect(decision.kind).toBe("insert");
      if (decision.kind !== "insert") return;
      expect(decision.landingSlot).toBe(3);
    });
  });

  describe("drag the LAST chip onto the FRONT", () => {
    // 4-chip bar, active = slot 3 (chip D), drag onto slot 0.
    const params = { cellSize: CELL_SIZE, activeIdx: 3, N: 4 };

    it("produces landing slot 0", () => {
      const decision = classifySnapZone({ ...params, slotApprox: -0.5 });
      expect(decision.kind).toBe("insert");
      if (decision.kind !== "insert") return;
      expect(decision.landingSlot).toBe(0);
    });
  });

  describe("drag the FIRST chip onto the BACK", () => {
    // 4-chip bar, active = slot 0 (chip A), drag past slot 3.
    const params = { cellSize: CELL_SIZE, activeIdx: 0, N: 4 };

    it("produces landing slot N - 1", () => {
      const decision = classifySnapZone({ ...params, slotApprox: 3.6 });
      expect(decision.kind).toBe("insert");
      if (decision.kind !== "insert") return;
      expect(decision.landingSlot).toBe(3);
    });
  });

  describe("noop when active chip can't move further in its own direction", () => {
    it("FIRST chip dragged further LEFT → noop", () => {
      // Active = slot 0; drag past the bar's left edge. With no
      // other chip on the left, landing collapses onto activeIdx
      // (= 0) → noop. The chip can't move "further left than the
      // front" — it's already there.
      const decision = classifySnapZone({
        slotApprox: -1.5,
        cellSize: CELL_SIZE,
        activeIdx: 0,
        N: 4,
      });
      expect(decision).toEqual({ kind: "noop" });
    });

    it("LAST chip dragged further RIGHT → noop", () => {
      // Symmetric case. Active = slot N-1; drag past the bar's
      // right edge. Landing collapses onto activeIdx (= 3) → noop.
      const decision = classifySnapZone({
        slotApprox: 5.5,
        cellSize: CELL_SIZE,
        activeIdx: 3,
        N: 4,
      });
      expect(decision).toEqual({ kind: "noop" });
    });
  });
});

describe("classifySnapZone — landing slot maps 1:1 onto computeInsertWindow", () => {
  // Documenting the wire contract: the classifier's `landingSlot`
  // is exactly the `insertAtIndex` arg `computeInsertWindow` (and
  // the BE's `repositionStop`'s `newStopOrder = landingSlot + 1`)
  // expect. Tests below validate the boundary slots specifically.

  it("returns landingSlot 0 for the front-of-route gap → window left bound becomes DISPATCH_DAY_START", () => {
    // Drag chip from slot 2 past the front of a 4-chip bar.
    const decision = classifySnapZone({
      slotApprox: -0.5,
      cellSize: CELL_SIZE,
      activeIdx: 2,
      N: 4,
    });
    expect(decision.kind).toBe("insert");
    if (decision.kind !== "insert") return;
    expect(decision.landingSlot).toBe(0);
    // The companion test `computeInsertWindow > front insert` in
    // `route-reschedule-windows.test.ts` covers the window math:
    // landingSlot 0 → newLeft = null → DISPATCH_DAY_START_HHMM.
  });

  it("returns landingSlot N-1 for the back-of-route gap → window right bound becomes DISPATCH_DAY_END", () => {
    // Drag chip from slot 1 past the back of a 4-chip bar.
    const decision = classifySnapZone({
      slotApprox: 3.6,
      cellSize: CELL_SIZE,
      activeIdx: 1,
      N: 4,
    });
    expect(decision.kind).toBe("insert");
    if (decision.kind !== "insert") return;
    // landingSlot N-1 = 3; in the "without-dragged" sequence
    // [chip0, chip2, chip3], index 3 is past the last → newRight =
    // null → DISPATCH_DAY_END_HHMM (see companion test in
    // route-reschedule-windows.test.ts > back insert).
    expect(decision.landingSlot).toBe(3);
  });
});

describe("classifySnapZone — adjacency edge cases", () => {
  // 3-chip bar; drag chip at slot 1 (the middle chip).
  const params = { cellSize: CELL_SIZE, activeIdx: 1, N: 3 };

  it("noop band centered on the active chip's own slot", () => {
    // slotApprox between 0.83 (= 1 - 9/54) and 1.17 (= 1 + 9/54)
    // is the active chip's own SWAP zone — a no-op.
    expect(classifySnapZone({ ...params, slotApprox: 1.0 })).toEqual({
      kind: "noop",
    });
    expect(classifySnapZone({ ...params, slotApprox: 1.15 })).toEqual({
      kind: "noop",
    });
  });

  it("INSERT toward the FRONT (active drifts left past chip 0's center)", () => {
    // slotApprox 0.3 puts the dragged center to the LEFT of chip
    // 0's center but past chip 0's swap zone — outside both swap
    // bands → INSERT landing 0 (front of route).
    //
    // Note: slotApprox = 0.5 would be ambiguous (`Math.round(0.5)
    // === 1` lands in active's own slot — noop). 0.3 disambiguates.
    const decision = classifySnapZone({ ...params, slotApprox: 0.3 });
    expect(decision.kind).toBe("insert");
    if (decision.kind !== "insert") return;
    expect(decision.landingSlot).toBe(0);
  });

  it("INSERT toward the BACK (active drifts right past chip 2's center)", () => {
    // Symmetric of the FRONT case. slotApprox 1.7 puts the dragged
    // center to the RIGHT of chip 2's center but past chip 2's swap
    // zone → INSERT at the back. Without-active sequence is
    // [chip0, chip2]; landing 2 means past chip2 = back of route.
    const decision = classifySnapZone({ ...params, slotApprox: 1.7 });
    expect(decision.kind).toBe("insert");
    if (decision.kind !== "insert") return;
    expect(decision.landingSlot).toBe(2);
  });
});

describe("classifySnapZone — Phase 7c bookend SWAP carve-out", () => {
  // Phase 7c (2026-05-22): the SWAP zones at slot 0 and slot N-1
  // are now ASYMMETRIC — they fire only on the INTERIOR side of
  // the bookend chip's center. The OFF-END side is reserved for
  // front/back-insert classification with the dramatic-shift
  // visual. The interior side is unchanged so a user who wants
  // to swap-with-bookend can still drag onto it from inside.
  //
  // Same 5-chip bar in every test: chips 0..4, dragging chip at
  // slot 2 unless otherwise stated.
  const N = 5;
  const params = { cellSize: CELL_SIZE, activeIdx: 2, N };

  it("SWAP with chip 0 still fires when approached from the INTERIOR side", () => {
    // Drag puts dragged chip 1px right of chip 0's center —
    // squarely inside the original SWAP zone, on the interior
    // side (slotApprox > 0). The carve-out should NOT fire here.
    const decision = classifySnapZone({
      ...params,
      slotApprox: slotApproxAt(0, 1),
    });
    expect(decision).toEqual({ kind: "swap", targetIdx: 0 });
  });

  it("SWAP with chip 0 is SUPPRESSED on the OFF-END side (slotApprox < 0)", () => {
    // Drag puts dragged chip 1px left of chip 0's center
    // (slotApprox < 0). Pre-Phase-7c this fired SWAP-with-chip-0;
    // Phase 7c routes it to front-INSERT instead so the user can
    // hit the front-insert zone without pixel precision.
    const decision = classifySnapZone({
      ...params,
      slotApprox: slotApproxAt(0, -1),
    });
    expect(decision.kind).toBe("insert");
    if (decision.kind !== "insert") return;
    expect(decision.landingSlot).toBe(0);
    expect(decision.dramaticShift).toBe("front");
  });

  it("SWAP with chip N-1 still fires when approached from the INTERIOR side", () => {
    // Mirror: dragged chip 1px LEFT of chip 4's center
    // (slotApprox < N-1). Interior side; SWAP unaffected.
    const decision = classifySnapZone({
      ...params,
      slotApprox: slotApproxAt(N - 1, -1),
    });
    expect(decision).toEqual({ kind: "swap", targetIdx: N - 1 });
  });

  it("SWAP with chip N-1 is SUPPRESSED on the OFF-END side (slotApprox > N-1)", () => {
    // Dragged chip 1px right of chip 4's center; slotApprox > N-1.
    // Routes to back-INSERT with dramatic shift.
    const decision = classifySnapZone({
      ...params,
      slotApprox: slotApproxAt(N - 1, 1),
    });
    expect(decision.kind).toBe("insert");
    if (decision.kind !== "insert") return;
    expect(decision.landingSlot).toBe(N - 1);
    expect(decision.dramaticShift).toBe("back");
  });

  it("carve-out does NOT affect interior chips (chip 1's SWAP zone is symmetric)", () => {
    // slotApprox just LEFT of chip 1's center — interior chip,
    // both sides of its SWAP zone should still fire.
    const decision = classifySnapZone({
      ...params,
      slotApprox: slotApproxAt(1, -1),
    });
    expect(decision).toEqual({ kind: "swap", targetIdx: 1 });
  });
});

describe("classifySnapZone — Phase 7c dramaticShift directive", () => {
  // The directive consumer needs to wire to the DFL fork's
  // shiftAllBeforeIdx / shiftAllAfterIdx (FORK Phase 3) so the
  // off-end visual reads as a chip-wide empty slot at the
  // front/back instead of an anemic half-cell nudge.

  describe("dramaticShift = \"front\"", () => {
    const params = { cellSize: CELL_SIZE, activeIdx: 2, N: 4 };

    it("fires when landingSlot === 0 AND drag is past the bar's left edge", () => {
      const decision = classifySnapZone({ ...params, slotApprox: -0.3 });
      expect(decision.kind).toBe("insert");
      if (decision.kind !== "insert") return;
      expect(decision.dramaticShift).toBe("front");
    });

    it("fires at the exact bookend boundary (slotApprox === 0)", () => {
      // SWAP-with-chip-0 is suppressed on the off-end side; the
      // exact boundary slotApprox === 0 is the off-end side under
      // the strict `slotApprox < 0` test for SWAP. Verify the
      // classifier routes it to INSERT + dramaticShift "front".
      //
      // Note: slotApprox === 0 with activeIdx=2 means the dragged
      // chip's top-left is at the bar's left edge — visually the
      // front-of-bar position. The Phase 7c contract is that this
      // counts as off-end (slotApprox <= 0) for the dramatic-shift
      // trigger.
      const decision = classifySnapZone({ ...params, slotApprox: 0 });
      // At exactly slotApprox=0, SWAP-with-0 would still fire under
      // the carve-out's `slotApprox < 0` test (strict less-than).
      // The carve-out goal is to grant front-insert access to
      // dragging PAST the edge; this exact-on-edge case is a
      // SWAP-with-0 (interior side wins by default). Verify the
      // SWAP fires here to lock the boundary semantics.
      expect(decision).toEqual({ kind: "swap", targetIdx: 0 });
    });

    it("does NOT fire for an interior insert that happens to land at slot 0", () => {
      // activeIdx=1: dragging chip 1 left to between chip 0 and
      // chip 1's old position. landingSlot collapses to 0 because
      // active is removed first, but the drag is interior, not
      // off-end. dramaticShift stays "none".
      const params2 = { cellSize: CELL_SIZE, activeIdx: 1, N: 4 };
      const decision = classifySnapZone({
        ...params2,
        slotApprox: 0.3,
      });
      expect(decision.kind).toBe("insert");
      if (decision.kind !== "insert") return;
      expect(decision.landingSlot).toBe(0);
      expect(decision.dramaticShift).toBe("none");
    });
  });

  describe("dramaticShift = \"back\"", () => {
    const params = { cellSize: CELL_SIZE, activeIdx: 1, N: 4 };

    it("fires when landingSlot === N-1 AND drag is past the bar's right edge", () => {
      const decision = classifySnapZone({ ...params, slotApprox: 3.4 });
      expect(decision.kind).toBe("insert");
      if (decision.kind !== "insert") return;
      expect(decision.dramaticShift).toBe("back");
    });

    it("does NOT fire for an interior insert that happens to land at slot N-1", () => {
      // 3-chip bar, activeIdx=1, drag right past chip 2's center
      // but not past the bar's right edge. landingSlot=2 (=N-1)
      // but it's an interior INSERT (the half-cell split-shift
      // can render it cleanly). dramaticShift stays "none".
      const params3 = { cellSize: CELL_SIZE, activeIdx: 1, N: 3 };
      const decision = classifySnapZone({
        ...params3,
        slotApprox: 1.7,
      });
      expect(decision.kind).toBe("insert");
      if (decision.kind !== "insert") return;
      expect(decision.landingSlot).toBe(2);
      expect(decision.dramaticShift).toBe("none");
    });
  });

  it("forces both leftCellIdx and rightCellIdx to -1 in front-dramatic case", () => {
    const decision = classifySnapZone({
      slotApprox: -0.3,
      cellSize: CELL_SIZE,
      activeIdx: 2,
      N: 4,
    });
    expect(decision.kind).toBe("insert");
    if (decision.kind !== "insert") return;
    expect(decision.leftCellIdx).toBe(-1);
    expect(decision.rightCellIdx).toBe(-1);
  });

  it("forces both leftCellIdx and rightCellIdx to -1 in back-dramatic case", () => {
    const decision = classifySnapZone({
      slotApprox: 3.4,
      cellSize: CELL_SIZE,
      activeIdx: 1,
      N: 4,
    });
    expect(decision.kind).toBe("insert");
    if (decision.kind !== "insert") return;
    expect(decision.leftCellIdx).toBe(-1);
    expect(decision.rightCellIdx).toBe(-1);
  });
});
