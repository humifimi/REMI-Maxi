/**
 * Tests for `useWideCanvas` (P0-FE-7).
 *
 * Three viewport sizes are exercised, one per row of the
 * `canvasKind` truth table from `src/hooks/ui/use-wide-canvas.ts`:
 *
 *   - iPhone 15 Pro portrait  (393 × 852)   → "phone-portrait"
 *   - iPhone 15 Pro landscape (852 × 393)   → "phone-landscape"
 *   - iPad landscape          (1366 × 1024) → "tablet"
 *
 * `isWide` is computed as `Math.min(width, height) >= 720` — the
 * device's **short edge** is what matters, not the live `width`. So
 * an iPhone Pro Max in landscape (932 × 430) classifies as
 * `phone-landscape` (short edge 430 < 720), and an iPad in either
 * orientation classifies as `tablet`. A separate test below pins
 * this rotation-stable behavior so any future regression to the
 * earlier `width >= 720` form (which mis-classified Pro Max
 * landscape as tablet) fails loud.
 *
 * Plus boundary specs around the 720pt cutoff applied to the short
 * edge so a future accidental ±1 nudge also fails loud.
 *
 * ── Mocking strategy (P3-FE-11 rewrite) ──────────────────────────
 *
 * The original P0-FE-7 version of this file mocked `react-native`
 * with `jest.mock("react-native", () => ({ ...jest.requireActual(
 * "react-native"), useWindowDimensions: jest.fn() }))`. That has
 * NEVER run green: `requireActual` bypasses jest-expo's automock
 * scaffolding and loads the real `react-native`, which resolves the
 * `DevMenu` TurboModule and throws "could not be found" outside a
 * real RN runtime. Every orientation-aware test that shipped after
 * (P3-FE-2 / P3-FE-3 / P3-FE-4) had to mock the consumer hook
 * (`useWideCanvas`) directly to dodge the same trap.
 *
 * For the hook UNDER test we obviously can't mock the hook itself.
 * Two reasonable options exist; we pick option (a) per the chunk
 * prompt:
 *
 *   (a) Mock `react-native` with a tiny factory that exports ONLY
 *       what the hook needs (`useWindowDimensions`). No
 *       `requireActual`, so DevMenu never loads. `useWideCanvas` is
 *       loaded after the mock and binds to the stub.
 *       `@testing-library/react-native`'s `renderHook` does not
 *       need any other RN export at runtime for hook-only tests, so
 *       a minimal mock is enough.
 *
 *   (b) Use a wrapper component that injects window dimensions via
 *       context. More robust if a future hook reads multiple RN
 *       APIs, but unnecessary today.
 *
 * `jest.spyOn(RN, "useWindowDimensions")` is NOT viable here: babel
 * compiles the named import inside `use-wide-canvas.ts` to a local
 * binding captured at module load, so a runtime spy on the module
 * namespace never reaches the call site (verified during this
 * chunk's investigation).
 *
 * Future orientation-dependent tests can copy this minimal-mock
 * pattern OR keep mocking `useWideCanvas` directly (the
 * P3-FE-2/3/4 pattern); both avoid the DevMenu workaround.
 */

import { renderHook } from "@testing-library/react-native";
import { useWindowDimensions } from "react-native";

import { useWideCanvas } from "../use-wide-canvas";

jest.mock("react-native", () => ({
  __esModule: true,
  useWindowDimensions: jest.fn(),
}));

const mockedUseWindowDimensions = useWindowDimensions as jest.MockedFunction<
  typeof useWindowDimensions
>;

function setViewport(width: number, height: number): void {
  mockedUseWindowDimensions.mockReturnValue({
    width,
    height,
    scale: 2,
    fontScale: 1,
  });
}

describe("useWideCanvas — phone portrait", () => {
  it("classifies an iPhone 15 Pro in portrait as phone-portrait", () => {
    setViewport(393, 852);
    const { result } = renderHook(() => useWideCanvas());

    expect(result.current.isWide).toBe(false);
    expect(result.current.orientation).toBe("portrait");
    expect(result.current.canvasKind).toBe("phone-portrait");
  });
});

describe("useWideCanvas — phone landscape", () => {
  it("classifies an iPhone 15 Pro rotated to landscape as phone-landscape", () => {
    setViewport(852, 393);
    const { result } = renderHook(() => useWideCanvas());

    expect(result.current.isWide).toBe(false);
    expect(result.current.orientation).toBe("landscape");
    expect(result.current.canvasKind).toBe("phone-landscape");
  });

  it("classifies a large iPhone (Pro Max, 932 × 430) in landscape as phone-landscape — short-edge rule keeps phones as phones in either rotation", () => {
    setViewport(932, 430);
    const { result } = renderHook(() => useWideCanvas());

    expect(result.current.isWide).toBe(false);
    expect(result.current.orientation).toBe("landscape");
    expect(result.current.canvasKind).toBe("phone-landscape");
  });

  it("classifies a small iPhone (SE, 667 × 375) in landscape as phone-landscape", () => {
    setViewport(667, 375);
    const { result } = renderHook(() => useWideCanvas());

    expect(result.current.isWide).toBe(false);
    expect(result.current.orientation).toBe("landscape");
    expect(result.current.canvasKind).toBe("phone-landscape");
  });
});

describe("useWideCanvas — tablet", () => {
  it("classifies an iPad in landscape as tablet", () => {
    setViewport(1366, 1024);
    const { result } = renderHook(() => useWideCanvas());

    expect(result.current.isWide).toBe(true);
    expect(result.current.orientation).toBe("landscape");
    expect(result.current.canvasKind).toBe("tablet");
  });

  it("classifies an iPad in portrait as tablet (still wide, portrait)", () => {
    setViewport(1024, 1366);
    const { result } = renderHook(() => useWideCanvas());

    expect(result.current.isWide).toBe(true);
    expect(result.current.orientation).toBe("portrait");
    expect(result.current.canvasKind).toBe("tablet");
  });
});

describe("useWideCanvas — breakpoint boundary (applied to short edge)", () => {
  it("treats min(width, height) === 720 as wide (>= cutoff)", () => {
    setViewport(720, 1000);
    const { result } = renderHook(() => useWideCanvas());

    expect(result.current.isWide).toBe(true);
    expect(result.current.canvasKind).toBe("tablet");
  });

  it("treats min(width, height) === 719 as not wide (just under cutoff)", () => {
    setViewport(719, 1000);
    const { result } = renderHook(() => useWideCanvas());

    expect(result.current.isWide).toBe(false);
    expect(result.current.canvasKind).toBe("phone-portrait");
  });

  it("rotation does not change isWide — a 720 × 1000 viewport is wide in either orientation", () => {
    setViewport(1000, 720);
    const { result } = renderHook(() => useWideCanvas());

    expect(result.current.isWide).toBe(true);
    expect(result.current.orientation).toBe("landscape");
    expect(result.current.canvasKind).toBe("tablet");
  });
});

describe("useWideCanvas — split-screen / foldable cases", () => {
  it("treats a narrow iPad split-screen pane (~507 × 1133) as phone-portrait, not tablet", () => {
    setViewport(507, 1133);
    const { result } = renderHook(() => useWideCanvas());

    expect(result.current.isWide).toBe(false);
    expect(result.current.canvasKind).toBe("phone-portrait");
  });

  it("treats a closed foldable (~374 × 819) as phone, an open foldable (~768 × 906) as tablet", () => {
    setViewport(374, 819);
    let r = renderHook(() => useWideCanvas());
    expect(r.result.current.isWide).toBe(false);
    expect(r.result.current.canvasKind).toBe("phone-portrait");

    setViewport(768, 906);
    r = renderHook(() => useWideCanvas());
    expect(r.result.current.isWide).toBe(true);
    expect(r.result.current.canvasKind).toBe("tablet");
  });
});

describe("useWideCanvas — square viewport tiebreaker", () => {
  it("treats width === height as portrait (matches `width > height` strict-greater rule)", () => {
    setViewport(500, 500);
    const { result } = renderHook(() => useWideCanvas());

    expect(result.current.orientation).toBe("portrait");
    expect(result.current.canvasKind).toBe("phone-portrait");
  });
});
