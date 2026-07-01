/**
 * Tests for `computePopupSide` (PR-UX-19).
 *
 * The hook layer (`useDynamicPopupSide`) wraps the pure helper with
 * `useWindowDimensions` + `useSafeAreaInsets`; mocking either
 * cleanly is fragile in this repo (see the comment block in
 * `use-wide-canvas.test.ts` for the DevMenu / namespace-spy
 * issues). The behaviour worth pinning lives in the pure function,
 * so we test that directly and leave the React-layer wiring to
 * smoke checks at the consumer (`ChainToChainConflictToast`).
 *
 * Edge cases pinned per the PR-UX-19 spec:
 *
 *   - x exactly at midpoint               → "left"  (tie → favour reading-flow exit)
 *   - x = 0 (left edge)                   → "right"
 *   - x = viewportWidth (right edge)      → "left"
 *   - x in left half                      → "right"
 *   - x in right half                     → "left"
 *   - degenerate (viewportWidth <= 0)     → "right" (safe default)
 *   - non-finite x or width               → "right" (safe default)
 */

import { computePopupSide } from "../use-dynamic-popup-side";

describe("computePopupSide — half-split mapping", () => {
  const viewportWidth = 1000;

  it("maps left-half x to a right-side popup", () => {
    expect(computePopupSide({ x: 100, viewportWidth })).toBe("right");
    expect(computePopupSide({ x: 250, viewportWidth })).toBe("right");
    expect(computePopupSide({ x: 499, viewportWidth })).toBe("right");
  });

  it("maps right-half x to a left-side popup", () => {
    expect(computePopupSide({ x: 600, viewportWidth })).toBe("left");
    expect(computePopupSide({ x: 750, viewportWidth })).toBe("left");
    expect(computePopupSide({ x: 999, viewportWidth })).toBe("left");
  });
});

describe("computePopupSide — boundary tie-breaks", () => {
  it("treats x exactly at the midpoint as a left-side popup (tie default)", () => {
    expect(computePopupSide({ x: 500, viewportWidth: 1000 })).toBe("left");
  });

  it("treats odd-width midpoints consistently (>= rule)", () => {
    // Midpoint of 999 is 499.5; x = 500 is past midpoint → left.
    expect(computePopupSide({ x: 500, viewportWidth: 999 })).toBe("left");
    // x = 499 sits before midpoint → right.
    expect(computePopupSide({ x: 499, viewportWidth: 999 })).toBe("right");
  });

  it("maps x = 0 (left edge) to a right-side popup", () => {
    expect(computePopupSide({ x: 0, viewportWidth: 1000 })).toBe("right");
  });

  it("maps x = viewportWidth (right edge) to a left-side popup", () => {
    expect(computePopupSide({ x: 1000, viewportWidth: 1000 })).toBe("left");
  });
});

describe("computePopupSide — degenerate inputs fall back safely", () => {
  it("returns 'right' (reading-flow default) when viewportWidth <= 0", () => {
    expect(computePopupSide({ x: 100, viewportWidth: 0 })).toBe("right");
    expect(computePopupSide({ x: 100, viewportWidth: -50 })).toBe("right");
  });

  it("returns 'right' when viewportWidth is non-finite (NaN or Infinity)", () => {
    expect(computePopupSide({ x: 100, viewportWidth: NaN })).toBe("right");
    // POSITIVE_INFINITY makes midpoint comparison meaningless; the
    // helper treats this the same as "no usable viewport" and falls
    // back to the reading-flow default. Pinning here so a future
    // attempt to "open up" the validation gate (e.g. dropping
    // `Number.isFinite` for a bare `> 0` check) loud-fails.
    expect(
      computePopupSide({ x: 100, viewportWidth: Number.POSITIVE_INFINITY }),
    ).toBe("right");
  });

  it("returns 'right' when x is non-finite", () => {
    expect(computePopupSide({ x: NaN, viewportWidth: 1000 })).toBe("right");
  });
});

describe("computePopupSide — landscape vs portrait widths produce identical mapping", () => {
  // The pure function doesn't care about orientation; only the
  // hook layer adjusts the width fraction. This test pins that the
  // side selection itself is orientation-agnostic so the consumer's
  // mental model — "the side is purely a function of where the
  // activity is" — stays accurate even if a future caller passes a
  // portrait-shaped width to the helper directly.
  it("a landscape iPad (1366 wide) and a portrait phone (393 wide) at proportional x produce the same side", () => {
    expect(
      computePopupSide({ x: 1366 * 0.7, viewportWidth: 1366 }),
    ).toBe("left");
    expect(computePopupSide({ x: 393 * 0.7, viewportWidth: 393 })).toBe("left");

    expect(
      computePopupSide({ x: 1366 * 0.3, viewportWidth: 1366 }),
    ).toBe("right");
    expect(computePopupSide({ x: 393 * 0.3, viewportWidth: 393 })).toBe("right");
  });
});
