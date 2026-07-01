/**
 * Unit tests for `advanceLink` (PR-UX-3 Phase 2 — 2026-05-07; revised 2026-05-08).
 *
 * Pure helper, exhaustively tested across the matrix:
 *   - Direction × initial state shape × wrap edge cases
 *   - Tech-run grouping (the 2026-05-08 generalization that lights
 *     a contiguous same-tech BLOCK per side-arrow press, not just
 *     a single dot).
 *
 * Companion to `move-chain-step-cycle.test.ts` (the dot-tap cycle).
 * The two helpers cover orthogonal navigation primitives:
 *   - dot-tap: jump to index, optionally extend to prefix.
 *   - side-arrow: walk one tech-run forward/back, wrap around.
 */

import {
  advanceLink,
  canAdvanceLink,
  computeTechRuns,
} from "@technician/components/calendar/move-chain-link-advance";

describe("advanceLink — legacy shape (no techIdByStep)", () => {
  // Every step is its own 1-step run. Mirrors the locked PR-UX-3
  // Phase 2 7-step interleaved demo, where every consecutive step
  // is on a different tech anyway → same result either way.

  it("returns the same reference when totalSteps is 0", () => {
    const current: readonly number[] = [];
    expect(advanceLink({ direction: "right", current, totalSteps: 0 })).toBe(
      current,
    );
  });

  it("restarts at [0] from an empty highlight set (right arrow)", () => {
    expect(
      advanceLink({ direction: "right", current: [], totalSteps: 5 }),
    ).toEqual([0]);
  });

  it("restarts at [0] from an empty highlight set (left arrow)", () => {
    expect(
      advanceLink({ direction: "left", current: [], totalSteps: 5 }),
    ).toEqual([0]);
  });

  it("right-advances [0] → [1] in a 7-step chain", () => {
    expect(
      advanceLink({ direction: "right", current: [0], totalSteps: 7 }),
    ).toEqual([1]);
  });

  it("left-advances [3] → [2] in a 7-step chain", () => {
    expect(
      advanceLink({ direction: "left", current: [3], totalSteps: 7 }),
    ).toEqual([2]);
  });

  it("right-arrow at the LAST step wraps to [0]", () => {
    expect(
      advanceLink({ direction: "right", current: [6], totalSteps: 7 }),
    ).toEqual([0]);
  });

  it("left-arrow at the FIRST step wraps to [totalSteps - 1]", () => {
    expect(
      advanceLink({ direction: "left", current: [0], totalSteps: 7 }),
    ).toEqual([6]);
  });

  // Prefix highlight — the PR-UX-2 cycle's expand state. The number
  // of dots selected is irrelevant to the side-arrow rule; only
  // max(current) matters for resolving the active run.
  it("right-advances [0,1,2] (prefix mode) → [3]", () => {
    expect(
      advanceLink({ direction: "right", current: [0, 1, 2], totalSteps: 7 }),
    ).toEqual([3]);
  });

  it("left-advances [0,1,2] (prefix mode) → [1]", () => {
    expect(
      advanceLink({ direction: "left", current: [0, 1, 2], totalSteps: 7 }),
    ).toEqual([1]);
  });

  it("right-advances full prefix [0..6] → wraps to [0]", () => {
    expect(
      advanceLink({
        direction: "right",
        current: [0, 1, 2, 3, 4, 5, 6],
        totalSteps: 7,
      }),
    ).toEqual([0]);
  });

  it("left-advances full prefix [0..6] → [5]", () => {
    expect(
      advanceLink({
        direction: "left",
        current: [0, 1, 2, 3, 4, 5, 6],
        totalSteps: 7,
      }),
    ).toEqual([5]);
  });

  it("treats non-prefix multi-entry inputs as 'highest index is active'", () => {
    expect(
      advanceLink({ direction: "right", current: [0, 5], totalSteps: 7 }),
    ).toEqual([6]);
  });

  it("clamps negative active indices to 0", () => {
    expect(
      advanceLink({ direction: "right", current: [-3], totalSteps: 7 }),
    ).toEqual([1]);
  });

  it("clamps over-totalSteps active indices to (totalSteps - 1)", () => {
    expect(
      advanceLink({ direction: "right", current: [99], totalSteps: 7 }),
    ).toEqual([0]); // clamped to 6, +1 = 7 → wraps to 0
  });

  // 1-run chain (totalSteps === 1, no tech metadata): the side
  // arrow is a no-op because there's only one run. Returns the
  // SAME reference so the store setter short-circuits.
  it("right-advances [0] in a 1-step chain → no-op (same reference)", () => {
    const current: readonly number[] = [0];
    expect(advanceLink({ direction: "right", current, totalSteps: 1 })).toBe(
      current,
    );
  });

  it("left-advances [0] in a 1-step chain → no-op (same reference)", () => {
    const current: readonly number[] = [0];
    expect(advanceLink({ direction: "left", current, totalSteps: 1 })).toBe(
      current,
    );
  });

  it("walks forward through a 7-step chain in 7 right-arrow presses", () => {
    let state: readonly number[] = [0];
    const sequence: number[][] = [Array.from(state)];
    for (let i = 0; i < 7; i++) {
      state = advanceLink({ direction: "right", current: state, totalSteps: 7 });
      sequence.push(Array.from(state));
    }
    expect(sequence).toEqual([
      [0],
      [1],
      [2],
      [3],
      [4],
      [5],
      [6],
      [0], // wrap
    ]);
  });

  it("walks backward through a 7-step chain in 7 left-arrow presses", () => {
    let state: readonly number[] = [0];
    const sequence: number[][] = [Array.from(state)];
    for (let i = 0; i < 7; i++) {
      state = advanceLink({ direction: "left", current: state, totalSteps: 7 });
      sequence.push(Array.from(state));
    }
    expect(sequence).toEqual([
      [0],
      [6], // wrap immediately
      [5],
      [4],
      [3],
      [2],
      [1],
      [0],
    ]);
  });
});

describe("advanceLink — tech-run grouping", () => {
  // The 8-step "mixed runs" demo seed: J J T J T T J J. Tech ids
  // 1 = Josh, 2 = Todd. Five tech-runs: [0,1], [2], [3], [4,5], [6,7].
  const MIXED_RUNS_TECHS: readonly (number | null)[] = [1, 1, 2, 1, 2, 2, 1, 1];

  it("groups contiguous same-tech steps into runs", () => {
    expect(computeTechRuns(8, MIXED_RUNS_TECHS)).toEqual([
      [0, 1],
      [2],
      [3],
      [4, 5],
      [6, 7],
    ]);
  });

  it("right-advance from run 0 [0,1] → run 1 [2] (whole run lights)", () => {
    expect(
      advanceLink({
        direction: "right",
        current: [0, 1],
        totalSteps: 8,
        techIdByStep: MIXED_RUNS_TECHS,
      }),
    ).toEqual([2]);
  });

  it("right-advance from run 3 [4,5] → run 4 [6,7]", () => {
    expect(
      advanceLink({
        direction: "right",
        current: [4, 5],
        totalSteps: 8,
        techIdByStep: MIXED_RUNS_TECHS,
      }),
    ).toEqual([6, 7]);
  });

  it("right-advance from the LAST run wraps to the first run", () => {
    expect(
      advanceLink({
        direction: "right",
        current: [6, 7],
        totalSteps: 8,
        techIdByStep: MIXED_RUNS_TECHS,
      }),
    ).toEqual([0, 1]);
  });

  it("left-advance from the FIRST run wraps to the last run", () => {
    expect(
      advanceLink({
        direction: "left",
        current: [0, 1],
        totalSteps: 8,
        techIdByStep: MIXED_RUNS_TECHS,
      }),
    ).toEqual([6, 7]);
  });

  it("left-advance from run 4 [6,7] → run 3 [4,5]", () => {
    expect(
      advanceLink({
        direction: "left",
        current: [6, 7],
        totalSteps: 8,
        techIdByStep: MIXED_RUNS_TECHS,
      }),
    ).toEqual([4, 5]);
  });

  it("walks the 8-step seed forward through every run with wrap", () => {
    let state: readonly number[] = [0, 1];
    const sequence: number[][] = [Array.from(state)];
    for (let i = 0; i < 5; i++) {
      state = advanceLink({
        direction: "right",
        current: state,
        totalSteps: 8,
        techIdByStep: MIXED_RUNS_TECHS,
      });
      sequence.push(Array.from(state));
    }
    expect(sequence).toEqual([
      [0, 1],
      [2],
      [3],
      [4, 5],
      [6, 7],
      [0, 1], // wrap
    ]);
  });

  it("ignores how many dots are currently selected — only max(current) matters", () => {
    // [0,1,2,3,4] is a non-canonical highlight (not a run, not a
    // single-step). The side arrow still resolves the active link
    // to max=4, which lives in run 3 [4,5], and advances to run
    // 4 [6,7].
    expect(
      advanceLink({
        direction: "right",
        current: [0, 1, 2, 3, 4],
        totalSteps: 8,
        techIdByStep: MIXED_RUNS_TECHS,
      }),
    ).toEqual([6, 7]);
  });

  it("starts at run 0 from an empty highlight set", () => {
    expect(
      advanceLink({
        direction: "right",
        current: [],
        totalSteps: 8,
        techIdByStep: MIXED_RUNS_TECHS,
      }),
    ).toEqual([0, 1]);
    expect(
      advanceLink({
        direction: "left",
        current: [],
        totalSteps: 8,
        techIdByStep: MIXED_RUNS_TECHS,
      }),
    ).toEqual([0, 1]);
  });

  it("treats null tech ids as their own run (adjacent nulls coalesce)", () => {
    // [A, A, null, A] → 3 runs: [0,1] A, [2] null, [3] A.
    const techs: readonly (number | null)[] = [1, 1, null, 1];
    expect(computeTechRuns(4, techs)).toEqual([[0, 1], [2], [3]]);

    // Walking right from [2] → [3].
    expect(
      advanceLink({
        direction: "right",
        current: [2],
        totalSteps: 4,
        techIdByStep: techs,
      }),
    ).toEqual([3]);
  });

  it("single-tech chain (1 run) is a no-op (same reference)", () => {
    const current: readonly number[] = [0, 1, 2];
    expect(
      advanceLink({
        direction: "right",
        current,
        totalSteps: 3,
        techIdByStep: [1, 1, 1],
      }),
    ).toBe(current);
    expect(
      advanceLink({
        direction: "left",
        current,
        totalSteps: 3,
        techIdByStep: [1, 1, 1],
      }),
    ).toBe(current);
  });
});

describe("canAdvanceLink", () => {
  it("disables both arrows when the chain is empty", () => {
    expect(
      canAdvanceLink({ direction: "right", current: [], totalSteps: 0 }),
    ).toBe(false);
    expect(
      canAdvanceLink({ direction: "left", current: [], totalSteps: 0 }),
    ).toBe(false);
  });

  it("disables both arrows for a 1-step chain", () => {
    expect(
      canAdvanceLink({ direction: "right", current: [0], totalSteps: 1 }),
    ).toBe(false);
    expect(
      canAdvanceLink({ direction: "left", current: [0], totalSteps: 1 }),
    ).toBe(false);
  });

  it("disables both arrows for a single-tech chain (1 run)", () => {
    expect(
      canAdvanceLink({
        direction: "right",
        current: [0],
        totalSteps: 3,
        techIdByStep: [1, 1, 1],
      }),
    ).toBe(false);
  });

  it("enables both arrows for a 2+ step chain (no tech metadata, every step its own run)", () => {
    expect(
      canAdvanceLink({ direction: "right", current: [0], totalSteps: 7 }),
    ).toBe(true);
    expect(
      canAdvanceLink({ direction: "left", current: [6], totalSteps: 7 }),
    ).toBe(true);
    expect(
      canAdvanceLink({ direction: "right", current: [], totalSteps: 7 }),
    ).toBe(true);
  });

  it("enables both arrows for the 8-step mixed-runs seed (5 runs)", () => {
    const techs: readonly (number | null)[] = [1, 1, 2, 1, 2, 2, 1, 1];
    expect(
      canAdvanceLink({
        direction: "right",
        current: [],
        totalSteps: 8,
        techIdByStep: techs,
      }),
    ).toBe(true);
  });
});
