/**
 * LDM-WAVE-2 CHUNK-2 (SHEETS-1) — Hermetic tests for the sheet-side
 * picker. Exercises `resolveSheetSide` (the pure deterministic
 * resolver) so the tests don't need to mock `useWindowDimensions`.
 *
 * Spec: REMIBackend/docs/implementation-plans/landscape-dispatch-map-wave-2.md
 *       §CHUNK-2 → "Side-picking math (locked down — portrait wins, unconditional)"
 */

import { resolveSheetSide } from "../use-sheet-side";

const PORTRAIT = { isLandscape: false, screenWidth: 390 };
const LANDSCAPE = { isLandscape: true, screenWidth: 844 };

describe("resolveSheetSide — portrait lock-down", () => {
  test("portrait always returns 'full' with no inputs", () => {
    expect(resolveSheetSide({ ...PORTRAIT })).toBe("full");
  });

  test("portrait + explicit forceSide:'left' STILL returns 'full' (locked invariant)", () => {
    expect(resolveSheetSide({ ...PORTRAIT, forceSide: "left" })).toBe("full");
  });

  test("portrait + explicit forceSide:'right' STILL returns 'full'", () => {
    expect(resolveSheetSide({ ...PORTRAIT, forceSide: "right" })).toBe("full");
  });

  test("portrait + tapX in right half STILL returns 'full' (no half-width portrait, ever)", () => {
    expect(resolveSheetSide({ ...PORTRAIT, tapX: 300 })).toBe("full");
  });

  test("portrait + dropX in right half STILL returns 'full'", () => {
    expect(resolveSheetSide({ ...PORTRAIT, dropX: 300 })).toBe("full");
  });

  test("portrait + forceSide:'full' returns 'full' without warning", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveSheetSide({ ...PORTRAIT, forceSide: "full" })).toBe("full");
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test("portrait + forceSide:'left' fires a __DEV__ warning", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    resolveSheetSide({ ...PORTRAIT, forceSide: "left" });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/forceSide ignored in portrait/);
    warnSpy.mockRestore();
  });
});

describe("resolveSheetSide — landscape side selection", () => {
  test("tapX > screenWidth/2 → 'left' (sheet on opposite side)", () => {
    expect(resolveSheetSide({ ...LANDSCAPE, tapX: 600 })).toBe("left");
  });

  test("tapX < screenWidth/2 → 'right'", () => {
    expect(resolveSheetSide({ ...LANDSCAPE, tapX: 100 })).toBe("right");
  });

  test("tapX === screenWidth/2 (boundary) → 'right'", () => {
    expect(resolveSheetSide({ ...LANDSCAPE, tapX: 422 })).toBe("right");
  });

  test("dropX wins over tapX when both are present", () => {
    expect(resolveSheetSide({ ...LANDSCAPE, tapX: 100, dropX: 700 })).toBe("left");
    expect(resolveSheetSide({ ...LANDSCAPE, tapX: 700, dropX: 100 })).toBe("right");
  });

  test("forceSide wins over tapX/dropX in landscape", () => {
    expect(
      resolveSheetSide({ ...LANDSCAPE, tapX: 100, forceSide: "left" })
    ).toBe("left");
    expect(
      resolveSheetSide({ ...LANDSCAPE, tapX: 700, forceSide: "right" })
    ).toBe("right");
  });

  test("no tapX/dropX/forceSide → defaultSide", () => {
    expect(resolveSheetSide({ ...LANDSCAPE, defaultSide: "left" })).toBe("left");
    expect(resolveSheetSide({ ...LANDSCAPE, defaultSide: "right" })).toBe("right");
  });

  test("no tapX/dropX/forceSide/defaultSide → 'right' (locked default)", () => {
    expect(resolveSheetSide({ ...LANDSCAPE })).toBe("right");
  });
});
