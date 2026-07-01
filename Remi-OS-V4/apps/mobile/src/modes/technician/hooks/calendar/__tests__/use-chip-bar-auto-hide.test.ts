/**
 * Tests for `useChipBarAutoHide` (2026-05-10).
 *
 * Covers the four behaviors that landed with the drawer redesign of
 * the Move-Chain chip bar in landscape:
 *
 *   1. Mounts expanded (`collapsed: false`).
 *   2. After `delayMs` of idle the bar collapses on its own.
 *   3. `recordActivity()` restarts the idle timer and (when called
 *      from a collapsed state) re-expands the bar.
 *   4. Changing the `activityKey` between renders auto-expands the
 *      bar and restarts the timer; the FIRST pass of `activityKey`
 *      is treated as the baseline (no spurious re-expand on mount).
 *
 * Uses jest fake timers per the existing repo precedent
 * (clean-intent-promotion-toast.test.tsx, EventQuickActionToast.test.tsx).
 */

import { renderHook, act } from "@testing-library/react-native";

import {
  useChipBarAutoHide,
  DEFAULT_CHIP_BAR_IDLE_MS,
} from "../use-chip-bar-auto-hide";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useChipBarAutoHide", () => {
  it("starts expanded by default", () => {
    const { result } = renderHook(() =>
      useChipBarAutoHide({ delayMs: 1_000 }),
    );

    expect(result.current.collapsed).toBe(false);
  });

  it("collapses after the idle window elapses with no activity", () => {
    const { result } = renderHook(() =>
      useChipBarAutoHide({ delayMs: 1_000 }),
    );

    expect(result.current.collapsed).toBe(false);

    act(() => {
      jest.advanceTimersByTime(999);
    });
    expect(result.current.collapsed).toBe(false);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.collapsed).toBe(true);
  });

  it("uses the 15s default when no delayMs is supplied", () => {
    const { result } = renderHook(() => useChipBarAutoHide());

    act(() => {
      jest.advanceTimersByTime(DEFAULT_CHIP_BAR_IDLE_MS - 1);
    });
    expect(result.current.collapsed).toBe(false);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.collapsed).toBe(true);
  });

  it("recordActivity restarts the timer without changing expanded state", () => {
    const { result } = renderHook(() =>
      useChipBarAutoHide({ delayMs: 1_000 }),
    );

    // Advance most of the way to collapse, then ping activity.
    act(() => {
      jest.advanceTimersByTime(900);
    });
    expect(result.current.collapsed).toBe(false);

    act(() => {
      result.current.recordActivity();
    });

    // Original timer was reset — 900ms after the ping should still
    // be expanded.
    act(() => {
      jest.advanceTimersByTime(900);
    });
    expect(result.current.collapsed).toBe(false);

    // The new 1000ms window should fire 1000ms after the ping.
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current.collapsed).toBe(true);
  });

  it("recordActivity from collapsed state re-expands", () => {
    const { result } = renderHook(() =>
      useChipBarAutoHide({ delayMs: 1_000 }),
    );

    // Let it collapse.
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(result.current.collapsed).toBe(true);

    act(() => {
      result.current.recordActivity();
    });
    expect(result.current.collapsed).toBe(false);
  });

  it("expand() force-opens and restarts the timer", () => {
    const { result } = renderHook(() =>
      useChipBarAutoHide({ delayMs: 1_000 }),
    );

    // Let it collapse.
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(result.current.collapsed).toBe(true);

    act(() => {
      result.current.expand();
    });
    expect(result.current.collapsed).toBe(false);

    // A full new idle window is needed before re-collapse — no
    // "pinned open" behavior.
    act(() => {
      jest.advanceTimersByTime(999);
    });
    expect(result.current.collapsed).toBe(false);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.collapsed).toBe(true);
  });

  it("collapseNow() collapses immediately without waiting", () => {
    const { result } = renderHook(() =>
      useChipBarAutoHide({ delayMs: 60_000 }),
    );

    expect(result.current.collapsed).toBe(false);

    act(() => {
      result.current.collapseNow();
    });
    expect(result.current.collapsed).toBe(true);
  });

  it("does not auto-expand on the initial activityKey", () => {
    const { result } = renderHook(
      ({ key }: { key: number }) =>
        useChipBarAutoHide({ delayMs: 1_000, activityKey: key }),
      { initialProps: { key: 1 } },
    );

    expect(result.current.collapsed).toBe(false);

    // First render captured `key: 1` as baseline; advancing time
    // should let the idle timer fire normally.
    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(result.current.collapsed).toBe(true);
  });

  it("re-expands and restarts the timer when activityKey changes", () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: number }) =>
        useChipBarAutoHide({ delayMs: 1_000, activityKey: key }),
      { initialProps: { key: 1 } },
    );

    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(result.current.collapsed).toBe(true);

    act(() => {
      rerender({ key: 2 });
    });
    expect(result.current.collapsed).toBe(false);

    // Idle clock restarts — 999ms still expanded, 1000ms collapses.
    act(() => {
      jest.advanceTimersByTime(999);
    });
    expect(result.current.collapsed).toBe(false);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.collapsed).toBe(true);
  });

  it("does not re-expand when activityKey stays the same across renders", () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: number }) =>
        useChipBarAutoHide({ delayMs: 1_000, activityKey: key }),
      { initialProps: { key: 7 } },
    );

    act(() => {
      jest.advanceTimersByTime(1_000);
    });
    expect(result.current.collapsed).toBe(true);

    act(() => {
      rerender({ key: 7 });
    });
    expect(result.current.collapsed).toBe(true);
  });

  it("respects initialCollapsed override (test-only path)", () => {
    const { result } = renderHook(() =>
      useChipBarAutoHide({
        delayMs: 1_000,
        initialCollapsed: true,
      }),
    );

    expect(result.current.collapsed).toBe(true);
  });
});
