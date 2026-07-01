/**
 * Tests for `nextHighlightSet` (PR-UX-2 PASS 2.11 v2 / task `c8`).
 *
 * NOTE: this repo does not currently ship a Jest runner (see the
 * matching note at the top of `accessibility.test.ts`). Until
 * `jest-expo` lands, this file is excluded from `tsc --noEmit` via
 * the `**\/__tests__\/**` glob in `tsconfig.json` and is treated
 * as executable specification.
 *
 * The 3-state per-dot cycle under test (re-stated by the user
 * 2026-05-05 after dropping the earlier "tap = `[i, i+1]` pair" rule
 * and the timing-based double-tap detection):
 *
 *   - Tap dot `i` when `current !== [i]` and `current !== [0..i]`
 *                                          →  `[i]`.
 *   - Tap dot `i` when `current === [i]`   →  `[0..i]`.
 *   - Tap dot `i` when `current === [0..i]` →  `[]`.
 *
 * Out-of-range / invalid indices  →  no-op (return `current`).
 */

import {
  isStepHighlighted,
  nextHighlightSet,
} from "../move-chain-step-cycle";

// ---------------------------------------------------------------------------
// First tap from a non-cycle state lights only that step.
// ---------------------------------------------------------------------------

describe("nextHighlightSet — first tap on a dot lights just that step", () => {
  it("dot 0 from [] → [0] (one step, one arrow)", () => {
    expect(
      nextHighlightSet({ current: [], totalSteps: 6, dotIndex: 0 }),
    ).toEqual([0]);
  });

  it("dot 2 from [] → [2]", () => {
    expect(
      nextHighlightSet({ current: [], totalSteps: 6, dotIndex: 2 }),
    ).toEqual([2]);
  });

  it("dot 4 from [3] → [4] (different dot re-enters cycle)", () => {
    expect(
      nextHighlightSet({ current: [3], totalSteps: 6, dotIndex: 4 }),
    ).toEqual([4]);
  });

  it("dot 2 from [0, 1, 2, 3] → [2] (some other prefix → re-enters cycle)", () => {
    expect(
      nextHighlightSet({ current: [0, 1, 2, 3], totalSteps: 6, dotIndex: 2 }),
    ).toEqual([2]);
  });
});

// ---------------------------------------------------------------------------
// Second tap on the same dot expands to the prefix.
// ---------------------------------------------------------------------------

describe("nextHighlightSet — second tap on the same dot expands to prefix", () => {
  it("dot 0 from [0] → [0] (single-element prefix is itself; effectively no-op)", () => {
    // `prefixSet(0) === [0]`, which equals current → store will short-
    // circuit. The helper still returns a fresh `[0]` though; the
    // dedupe happens at the store layer.
    expect(
      nextHighlightSet({ current: [0], totalSteps: 6, dotIndex: 0 }),
    ).toEqual([0]);
  });

  it("dot 2 from [2] → [0, 1, 2]", () => {
    expect(
      nextHighlightSet({ current: [2], totalSteps: 6, dotIndex: 2 }),
    ).toEqual([0, 1, 2]);
  });

  it("dot 5 (last) from [5] → [0, 1, 2, 3, 4, 5] (full chain)", () => {
    expect(
      nextHighlightSet({ current: [5], totalSteps: 6, dotIndex: 5 }),
    ).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

// ---------------------------------------------------------------------------
// Third tap on the same dot clears.
// ---------------------------------------------------------------------------

describe("nextHighlightSet — third tap on the same dot clears", () => {
  it("dot 2 from [0, 1, 2] → []", () => {
    expect(
      nextHighlightSet({ current: [0, 1, 2], totalSteps: 6, dotIndex: 2 }),
    ).toEqual([]);
  });

  it("dot 5 (last) from full chain [0..5] → [] (preserves prior toggle behavior)", () => {
    expect(
      nextHighlightSet({
        current: [0, 1, 2, 3, 4, 5],
        totalSteps: 6,
        dotIndex: 5,
      }),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Cycle continuity — repeated taps on the same dot loop through all 3 states.
// ---------------------------------------------------------------------------

describe("nextHighlightSet — repeated same-dot taps loop [i] → [0..i] → [] → [i]", () => {
  it("dot 3 in a 6-step chain cycles correctly across 4 taps", () => {
    const totalSteps = 6;
    const dotIndex = 3;
    const tap1 = nextHighlightSet({ current: [], totalSteps, dotIndex });
    expect(tap1).toEqual([3]);
    const tap2 = nextHighlightSet({ current: tap1, totalSteps, dotIndex });
    expect(tap2).toEqual([0, 1, 2, 3]);
    const tap3 = nextHighlightSet({ current: tap2, totalSteps, dotIndex });
    expect(tap3).toEqual([]);
    const tap4 = nextHighlightSet({ current: tap3, totalSteps, dotIndex });
    expect(tap4).toEqual([3]);
  });
});

// ---------------------------------------------------------------------------
// Tapping a different dot mid-cycle re-enters at step 1.
// ---------------------------------------------------------------------------

describe("nextHighlightSet — tapping a different dot re-enters cycle at [j]", () => {
  it("from [2] (mid-cycle on dot 2), tapping dot 4 → [4]", () => {
    expect(
      nextHighlightSet({ current: [2], totalSteps: 6, dotIndex: 4 }),
    ).toEqual([4]);
  });

  it("from [0, 1, 2] (prefix-mode on dot 2), tapping dot 4 → [4]", () => {
    expect(
      nextHighlightSet({ current: [0, 1, 2], totalSteps: 6, dotIndex: 4 }),
    ).toEqual([4]);
  });
});

// ---------------------------------------------------------------------------
// Out-of-range and degenerate inputs are no-ops.
// ---------------------------------------------------------------------------

describe("nextHighlightSet — degenerate inputs are no-ops", () => {
  it("totalSteps === 0 returns current", () => {
    const current = [0, 1];
    expect(
      nextHighlightSet({ current, totalSteps: 0, dotIndex: 0 }),
    ).toBe(current);
  });

  it("negative dotIndex returns current", () => {
    const current = [0, 1];
    expect(
      nextHighlightSet({ current, totalSteps: 6, dotIndex: -1 }),
    ).toBe(current);
  });

  it("dotIndex >= totalSteps returns current", () => {
    const current = [0, 1];
    expect(
      nextHighlightSet({ current, totalSteps: 6, dotIndex: 6 }),
    ).toBe(current);
  });
});

// ---------------------------------------------------------------------------
// isStepHighlighted membership helper.
// ---------------------------------------------------------------------------

describe("isStepHighlighted", () => {
  it("returns true when the step is in the highlights array", () => {
    expect(isStepHighlighted([0, 2, 4], 2)).toBe(true);
  });

  it("returns false when the step is not in the highlights array", () => {
    expect(isStepHighlighted([0, 2, 4], 1)).toBe(false);
  });

  it("returns false on an empty highlights array", () => {
    expect(isStepHighlighted([], 0)).toBe(false);
  });
});
