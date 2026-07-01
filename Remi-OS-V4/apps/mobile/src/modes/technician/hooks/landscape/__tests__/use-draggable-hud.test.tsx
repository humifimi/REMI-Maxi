/**
 * Tests for `useDraggableHud` (PR-UX-11, 2026-05-09).
 *
 * Covers:
 *   - The pure `pickHudCorner` snap helper across all 6 zones.
 *   - Default-corner initialization.
 *   - The `corner` prop value drives the anchor style emission.
 *   - The `isDragging` flag starts false (drag-state machine not yet
 *     run; we exercise the gesture path on-device because RNGH's
 *     gesture system can't be reliably faked through React Test
 *     Renderer's host tree).
 *   - The hook-returned style is an array.
 *   - AsyncStorage rehydration reads the stored corner on mount.
 */

import { renderHook, act, waitFor } from "@testing-library/react-native";
import type { LayoutChangeEvent } from "react-native";

import {
  pickHudCorner,
  useDraggableHud,
} from "@technician/hooks/landscape/use-draggable-hud";

// ── Mocks ────────────────────────────────────────────────────────

jest.mock("@technician/hooks/utility/use-haptics", () => ({
  haptic: { light: jest.fn(), medium: jest.fn(), heavy: jest.fn() },
}));

const mockGetItem = jest.fn();
const mockSetItem = jest.fn().mockResolvedValue(undefined);
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: (k: string) => mockGetItem(k),
    setItem: (k: string, v: string) => mockSetItem(k, v),
  },
}));

beforeEach(() => {
  mockGetItem.mockReset();
  mockSetItem.mockReset();
  mockGetItem.mockResolvedValue(null);
  mockSetItem.mockResolvedValue(undefined);
});

function fakeLayoutEvent(width: number, height: number): LayoutChangeEvent {
  return {
    nativeEvent: { layout: { x: 0, y: 0, width, height } },
  } as LayoutChangeEvent;
}

// ── pickHudCorner — pure helper coverage ─────────────────────────

describe("pickHudCorner", () => {
  // Standard landscape iPhone window: 852 x 393 (long edge x short edge).
  const WW = 852;
  const WH = 393;

  it.each<[number, number, string]>([
    [50, 50, "tl"],
    [WW / 2, 50, "tc"],
    [WW - 50, 50, "tr"],
    [50, WH - 50, "bl"],
    [WW / 2, WH - 50, "bc"],
    [WW - 50, WH - 50, "br"],
  ])(
    "snaps finger at (%d, %d) to corner '%s'",
    (fingerX, fingerY, expected) => {
      expect(pickHudCorner(fingerX, fingerY, WW, WH)).toBe(expected);
    },
  );

  it("uses third-of-width for horizontal partition", () => {
    // Just left of 1/3 → 'l'; just right of 1/3 → 'c'.
    expect(pickHudCorner(WW / 3 - 1, 10, WW, WH)).toBe("tl");
    expect(pickHudCorner(WW / 3 + 1, 10, WW, WH)).toBe("tc");
    expect(pickHudCorner((2 * WW) / 3 - 1, 10, WW, WH)).toBe("tc");
    expect(pickHudCorner((2 * WW) / 3 + 1, 10, WW, WH)).toBe("tr");
  });
});

// ── useDraggableHud — initialization + corner persistence ────────

describe("useDraggableHud", () => {
  it("starts at the default corner when AsyncStorage is empty", async () => {
    mockGetItem.mockResolvedValue(null);
    const { result } = renderHook(() =>
      useDraggableHud({
        defaultCorner: "tc",
        storageKey: "@test/corner-1",
      }),
    );
    expect(result.current.corner).toBe("tc");
    // Allow the rehydration promise to resolve and confirm no change.
    await waitFor(() => {
      expect(mockGetItem).toHaveBeenCalledWith("@test/corner-1");
    });
    expect(result.current.corner).toBe("tc");
  });

  it("rehydrates from AsyncStorage on mount", async () => {
    mockGetItem.mockResolvedValue("br");
    const { result } = renderHook(() =>
      useDraggableHud({
        defaultCorner: "tc",
        storageKey: "@test/corner-2",
      }),
    );
    // Default before rehydration completes.
    expect(result.current.corner).toBe("tc");
    await waitFor(() => {
      expect(result.current.corner).toBe("br");
    });
  });

  it("ignores invalid stored values and keeps the default", async () => {
    mockGetItem.mockResolvedValue("garbage");
    const { result } = renderHook(() =>
      useDraggableHud({
        defaultCorner: "tl",
        storageKey: "@test/corner-3",
      }),
    );
    await waitFor(() => {
      expect(mockGetItem).toHaveBeenCalledWith("@test/corner-3");
    });
    expect(result.current.corner).toBe("tl");
  });

  it("supports each of the six positions as a default", () => {
    const corners = ["tl", "tc", "tr", "bl", "bc", "br"] as const;
    for (const c of corners) {
      const { result } = renderHook(() =>
        useDraggableHud({
          defaultCorner: c,
          storageKey: `@test/corner-iter-${c}`,
        }),
      );
      expect(result.current.corner).toBe(c);
    }
  });

  it("returns a non-empty style array and a gesture object", () => {
    const { result } = renderHook(() =>
      useDraggableHud({
        defaultCorner: "tl",
        storageKey: "@test/corner-style",
      }),
    );
    expect(Array.isArray(result.current.style)).toBe(true);
    expect(result.current.style.length).toBeGreaterThanOrEqual(2);
    expect(result.current.gesture).toBeTruthy();
  });

  it("isDragging starts false", () => {
    const { result } = renderHook(() =>
      useDraggableHud({
        defaultCorner: "tl",
        storageKey: "@test/corner-drag",
      }),
    );
    expect(result.current.isDragging).toBe(false);
  });

  it("style anchor matches each corner", () => {
    const cases: Array<{ corner: "tl" | "tc" | "tr" | "bl" | "bc" | "br"; keys: string[] }> = [
      { corner: "tl", keys: ["top", "left"] },
      { corner: "tc", keys: ["top", "left", "right"] },
      { corner: "tr", keys: ["top", "right"] },
      { corner: "bl", keys: ["bottom", "left"] },
      { corner: "bc", keys: ["bottom", "left", "right"] },
      { corner: "br", keys: ["bottom", "right"] },
    ];
    for (const { corner, keys } of cases) {
      const { result } = renderHook(() =>
        useDraggableHud({
          defaultCorner: corner,
          storageKey: `@test/anchor-${corner}`,
          edgeInset: 8,
        }),
      );
      const anchor = result.current.style[0] as Record<string, unknown>;
      expect(anchor.position).toBe("absolute");
      for (const key of keys) {
        expect(key in anchor).toBe(true);
      }
    }
  });

  it("onLayout swallows valid + invalid size events without throwing", () => {
    const { result } = renderHook(() =>
      useDraggableHud({
        defaultCorner: "tl",
        storageKey: "@test/onlayout",
      }),
    );
    expect(() => {
      act(() => {
        result.current.onLayout(fakeLayoutEvent(120, 32));
      });
    }).not.toThrow();
    expect(() => {
      act(() => {
        result.current.onLayout(fakeLayoutEvent(0, 0));
      });
    }).not.toThrow();
  });
});
