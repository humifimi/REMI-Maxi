/**
 * Tests for `useSheetDraftRead` / `useSheetDraftWrite` /
 * `clearSheetDraft` (P3-FE-6).
 *
 * NOTE: this repo does not currently ship a Jest runner end-to-end
 * (see `src/hooks/ui/__tests__/use-wide-canvas.test.ts`). The file
 * follows the canonical jest-expo + `@testing-library/react-native`
 * shape — every assertion below should pass once the runner lands.
 *
 * Coverage:
 *   - useSheetDraftRead: returns undefined for null/undefined cacheKey
 *     and disabled mode; returns cached value when entry exists; the
 *     read snapshot is stable across writes during the same mount.
 *   - useSheetDraftWrite: debounces writes (~300ms); flushes on
 *     unmount even when the timer would otherwise be cancelled; no-op
 *     when cacheKey is null/undefined or disabled.
 *   - clearSheetDraft: clears the targeted (cacheKey, sheetKind);
 *     no-op when cacheKey is null/undefined.
 */

import { act, renderHook } from "@testing-library/react-native";

import {
  clearSheetDraft,
  useSheetDraftRead,
  useSheetDraftWrite,
} from "../use-sheet-draft-cache";
import {
  __resetSheetDraftStoreForTests,
  useSheetDraftStore,
} from "@technician/stores/use-sheet-draft-store";

// ---------------------------------------------------------------------------
// Setup.
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.useFakeTimers();
  __resetSheetDraftStoreForTests();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// useSheetDraftRead.
// ---------------------------------------------------------------------------

describe("useSheetDraftRead", () => {
  it("returns undefined when cacheKey is null", () => {
    const { result } = renderHook(() =>
      useSheetDraftRead<{ note: string }>({
        cacheKey: null,
        sheetKind: "appointment",
      }),
    );
    expect(result.current).toBeUndefined();
  });

  it("returns undefined when cacheKey is undefined", () => {
    const { result } = renderHook(() =>
      useSheetDraftRead<{ note: string }>({
        cacheKey: undefined,
        sheetKind: "appointment",
      }),
    );
    expect(result.current).toBeUndefined();
  });

  it("returns undefined when enabled is false even for a populated cacheKey", () => {
    useSheetDraftStore
      .getState()
      .setDraft("appt:5", "appointment", { note: "wip" });

    const { result } = renderHook(() =>
      useSheetDraftRead<{ note: string }>({
        cacheKey: "appt:5",
        sheetKind: "appointment",
        enabled: false,
      }),
    );
    expect(result.current).toBeUndefined();
  });

  it("returns the cached value when an entry exists", () => {
    useSheetDraftStore
      .getState()
      .setDraft("appt:5", "appointment", { note: "wip" });

    const { result } = renderHook(() =>
      useSheetDraftRead<{ note: string }>({
        cacheKey: "appt:5",
        sheetKind: "appointment",
      }),
    );
    expect(result.current).toEqual({ note: "wip" });
  });

  it("snapshots the cached value at mount time and does NOT update on subsequent writes", () => {
    useSheetDraftStore
      .getState()
      .setDraft("appt:5", "appointment", { note: "v1" });

    const { result, rerender } = renderHook(() =>
      useSheetDraftRead<{ note: string }>({
        cacheKey: "appt:5",
        sheetKind: "appointment",
      }),
    );
    expect(result.current).toEqual({ note: "v1" });

    // External write to the same key after the read has snapshotted.
    act(() => {
      useSheetDraftStore
        .getState()
        .setDraft("appt:5", "appointment", { note: "v2" });
    });
    rerender({});

    // Snapshot is intentionally stable so consumers can pass it
    // straight into useForm({ defaultValues }) without races.
    expect(result.current).toEqual({ note: "v1" });
  });
});

// ---------------------------------------------------------------------------
// useSheetDraftWrite.
// ---------------------------------------------------------------------------

describe("useSheetDraftWrite", () => {
  it("debounces writes by ~300ms", () => {
    const { rerender } = renderHook(
      ({ values }: { values: { note: string } }) =>
        useSheetDraftWrite<{ note: string }>({
          cacheKey: "appt:5",
          sheetKind: "appointment",
          values,
        }),
      { initialProps: { values: { note: "a" } } },
    );

    // Advance halfway through the debounce window — write should
    // not have landed yet.
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(
      useSheetDraftStore.getState().getDraft("appt:5", "appointment"),
    ).toBeUndefined();

    // Push a new value before the timer fires; the previous timer
    // is cancelled and a new one starts.
    rerender({ values: { note: "b" } });
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(
      useSheetDraftStore.getState().getDraft("appt:5", "appointment"),
    ).toBeUndefined();

    // Now let the second debounce window elapse — only the latest
    // value should land in the cache.
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(
      useSheetDraftStore.getState().getDraft<{ note: string }>(
        "appt:5",
        "appointment",
      ),
    ).toEqual({ note: "b" });
  });

  it("flushes one final write on unmount even if the debounce timer hasn't fired", () => {
    const { rerender, unmount } = renderHook(
      ({ values }: { values: { note: string } }) =>
        useSheetDraftWrite<{ note: string }>({
          cacheKey: "appt:5",
          sheetKind: "appointment",
          values,
        }),
      { initialProps: { values: { note: "a" } } },
    );

    rerender({ values: { note: "latest" } });

    // No time has passed — the debounce setTimeout is pending.
    expect(
      useSheetDraftStore.getState().getDraft("appt:5", "appointment"),
    ).toBeUndefined();

    // Unmount fires the cleanup which writes the latest value
    // synchronously, covering "user typed and immediately tapped
    // outside" scenarios.
    unmount();
    expect(
      useSheetDraftStore.getState().getDraft<{ note: string }>(
        "appt:5",
        "appointment",
      ),
    ).toEqual({ note: "latest" });
  });

  it("never writes when cacheKey is null", () => {
    const { rerender, unmount } = renderHook(
      ({ values }: { values: { note: string } }) =>
        useSheetDraftWrite<{ note: string }>({
          cacheKey: null,
          sheetKind: "appointment",
          values,
        }),
      { initialProps: { values: { note: "a" } } },
    );

    rerender({ values: { note: "b" } });
    act(() => {
      jest.advanceTimersByTime(500);
    });
    unmount();

    expect(useSheetDraftStore.getState().drafts).toEqual({});
  });

  it("never writes when enabled is false", () => {
    const { unmount } = renderHook(() =>
      useSheetDraftWrite<{ note: string }>({
        cacheKey: "appt:5",
        sheetKind: "appointment",
        values: { note: "wip" },
        enabled: false,
      }),
    );
    act(() => {
      jest.advanceTimersByTime(500);
    });
    unmount();

    expect(useSheetDraftStore.getState().drafts).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// clearSheetDraft.
// ---------------------------------------------------------------------------

describe("clearSheetDraft", () => {
  it("clears the targeted (cacheKey, sheetKind)", () => {
    useSheetDraftStore.getState().setDraft("appt:5", "appointment", { x: 1 });
    clearSheetDraft("appt:5", "appointment");

    expect(
      useSheetDraftStore.getState().getDraft("appt:5", "appointment"),
    ).toBeUndefined();
  });

  it("is a no-op when cacheKey is null/undefined", () => {
    useSheetDraftStore.getState().setDraft("appt:5", "appointment", { x: 1 });

    clearSheetDraft(null, "appointment");
    clearSheetDraft(undefined, "appointment");

    expect(
      useSheetDraftStore.getState().getDraft("appt:5", "appointment"),
    ).toEqual({ x: 1 });
  });
});
