/**
 * Tests for `useEventBoundsRegistry` (FORK Phase 26, 2026-05-10).
 *
 * Covers the registry's three pure-helper paths and the hook's
 * stable-callback contract:
 *
 *   1. `recordIntoMap` writes (and ignores invalid ids).
 *   2. `getFromMap` reads back (and returns null for invalid ids).
 *   3. The hook's `record` callback survives across renders with
 *      a stable identity (so the Calendar's `effectiveRenderer`
 *      memo doesn't re-fire EventBlock layout reports on every
 *      consumer re-render).
 *   4. `get` reads bounds written via `record`.
 *   5. `unregister` drops entries.
 *   6. Multi-event isolation: writing one id doesn't touch
 *      another id's entry.
 */

import { renderHook, act } from "@testing-library/react-native";
import type { Event } from "react-native-resource-calendar";

import {
  recordIntoMap,
  getFromMap,
  useEventBoundsRegistry,
  REGISTRY_TICK_DEBOUNCE_MS,
  type EventBoundsEntry,
} from "../use-event-bounds-registry";

function makeEvent(id: number): Event {
  return {
    id,
    resourceId: 1,
    date: "2026-05-10",
    from: 540, // 09:00
    to: 600, // 10:00
  } as Event;
}

const LAYOUT_A: EventBoundsEntry = { x: 4, y: 100, width: 200, height: 60 };
const LAYOUT_B: EventBoundsEntry = { x: 8, y: 200, width: 180, height: 120 };

describe("recordIntoMap", () => {
  it("writes a layout entry for a finite numeric id", () => {
    const map = new Map<number, EventBoundsEntry>();
    recordIntoMap(map, 42, LAYOUT_A);
    expect(map.get(42)).toEqual(LAYOUT_A);
  });

  it("ignores null / undefined / NaN ids", () => {
    const map = new Map<number, EventBoundsEntry>();
    recordIntoMap(map, null, LAYOUT_A);
    recordIntoMap(map, undefined, LAYOUT_A);
    recordIntoMap(map, Number.NaN, LAYOUT_A);
    expect(map.size).toBe(0);
  });

  it("overwrites a prior entry for the same id", () => {
    const map = new Map<number, EventBoundsEntry>();
    recordIntoMap(map, 7, LAYOUT_A);
    recordIntoMap(map, 7, LAYOUT_B);
    expect(map.get(7)).toEqual(LAYOUT_B);
  });
});

describe("getFromMap", () => {
  it("returns the entry for a known id", () => {
    const map = new Map<number, EventBoundsEntry>([[3, LAYOUT_A]]);
    expect(getFromMap(map, 3)).toEqual(LAYOUT_A);
  });

  it("returns null for an unknown id", () => {
    const map = new Map<number, EventBoundsEntry>();
    expect(getFromMap(map, 99)).toBeNull();
  });

  it("returns null for null / undefined / NaN ids", () => {
    const map = new Map<number, EventBoundsEntry>([[3, LAYOUT_A]]);
    expect(getFromMap(map, null)).toBeNull();
    expect(getFromMap(map, undefined)).toBeNull();
    expect(getFromMap(map, Number.NaN)).toBeNull();
  });
});

describe("useEventBoundsRegistry", () => {
  it("records and retrieves bounds via the returned callbacks", () => {
    const { result } = renderHook(() => useEventBoundsRegistry());

    act(() => {
      result.current.record(makeEvent(5), LAYOUT_A);
    });

    expect(result.current.get(5)).toEqual(LAYOUT_A);
  });

  it("returns null for an event id that has not been recorded", () => {
    const { result } = renderHook(() => useEventBoundsRegistry());
    expect(result.current.get(999)).toBeNull();
  });

  it("keeps a stable identity for `record` across re-renders", () => {
    // The Calendar's `effectiveRenderer` `useMemo` lists
    // `onEventLayout` in its deps; if `record`'s identity changes
    // between consumer renders, every EventBlock re-mounts and we
    // get an infinite layout-report storm. Pin the contract.
    const { result, rerender } = renderHook(() => useEventBoundsRegistry());
    const firstRecord = result.current.record;
    const firstGet = result.current.get;
    rerender({});
    expect(result.current.record).toBe(firstRecord);
    expect(result.current.get).toBe(firstGet);
  });

  it("overwrites a prior bounds entry when the same event is reported again", () => {
    const { result } = renderHook(() => useEventBoundsRegistry());
    act(() => {
      result.current.record(makeEvent(11), LAYOUT_A);
    });
    act(() => {
      result.current.record(makeEvent(11), LAYOUT_B);
    });
    expect(result.current.get(11)).toEqual(LAYOUT_B);
  });

  it("isolates entries across multiple event ids", () => {
    const { result } = renderHook(() => useEventBoundsRegistry());
    act(() => {
      result.current.record(makeEvent(1), LAYOUT_A);
      result.current.record(makeEvent(2), LAYOUT_B);
    });
    expect(result.current.get(1)).toEqual(LAYOUT_A);
    expect(result.current.get(2)).toEqual(LAYOUT_B);
    expect(result.current.get(3)).toBeNull();
  });

  it("drops an entry when `unregister` is called", () => {
    const { result } = renderHook(() => useEventBoundsRegistry());
    act(() => {
      result.current.record(makeEvent(8), LAYOUT_A);
    });
    expect(result.current.get(8)).toEqual(LAYOUT_A);

    act(() => {
      result.current.unregister(8);
    });
    expect(result.current.get(8)).toBeNull();
  });

  it("treats `unregister` for an unknown id as a no-op", () => {
    const { result } = renderHook(() => useEventBoundsRegistry());
    act(() => {
      result.current.unregister(404);
    });
    expect(result.current.get(404)).toBeNull();
  });

  it("records bounds for negative ghost ids (matching `moveChainGhostEventIdFor`'s output)", () => {
    // Move-chain destination ghosts use ids like `-(1_000_000 +
    // intentId)`. The registry must accept them so destination-end
    // arrow anchors can pull post-style bounds.
    const ghostId = -1_000_042;
    const { result } = renderHook(() => useEventBoundsRegistry());
    act(() => {
      result.current.record(makeEvent(ghostId), LAYOUT_A);
    });
    expect(result.current.get(ghostId)).toEqual(LAYOUT_A);
  });
});

// ---------------------------------------------------------------
// Settling-tick — 2026-05-12 (fix/move-chain-arrow-registry-precision)
//
// The tick is a debounced React-state bump that fires once after
// REGISTRY_TICK_DEBOUNCE_MS of quiet following the last `record`.
// Consumers (the three calendar hosts) include `tick` in their
// arrow-geometry `useMemo` deps so the geometry re-derives exactly
// when the registry has populated and the gate-on-registry rule in
// `compute-move-chain-arrows.ts` will pass.
// ---------------------------------------------------------------

describe("useEventBoundsRegistry — settling tick", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts at 0 before any record calls", () => {
    const { result } = renderHook(() => useEventBoundsRegistry());
    expect(result.current.tick).toBe(0);
  });

  it("bumps to 1 after a single record + the debounce window", () => {
    const { result } = renderHook(() => useEventBoundsRegistry());
    act(() => {
      result.current.record(makeEvent(1), LAYOUT_A);
    });
    // Before the debounce window elapses, tick has not yet bumped.
    expect(result.current.tick).toBe(0);

    act(() => {
      jest.advanceTimersByTime(REGISTRY_TICK_DEBOUNCE_MS);
    });
    expect(result.current.tick).toBe(1);
  });

  it("collapses a cluster of N record calls into a single tick bump", () => {
    // Mirrors the typical initial-layout case: every EventBlock
    // on a populated week view fires `onLayout` within a few ms
    // of each other. The settling tick should fire exactly once
    // for the entire cluster.
    const { result } = renderHook(() => useEventBoundsRegistry());
    act(() => {
      for (let i = 0; i < 10; i++) {
        result.current.record(makeEvent(i), LAYOUT_A);
        // Each record schedules a new timer; intermediate timers
        // are cleared by the next record. Simulate a 5ms gap
        // between records — well inside the debounce window.
        jest.advanceTimersByTime(5);
      }
    });
    // After the cluster: 10 records, 50ms of advanced time. The
    // last record's debounce still hasn't fully elapsed because
    // record #10 fired at t=45ms and the timer is set for
    // t=45ms + 50ms = 95ms.
    expect(result.current.tick).toBe(0);

    act(() => {
      jest.advanceTimersByTime(REGISTRY_TICK_DEBOUNCE_MS);
    });
    // Single tick bump for the entire 10-record cluster.
    expect(result.current.tick).toBe(1);
  });

  it("bumps a second time after a fresh cluster following the first settle", () => {
    // Layout pass 1, then a quiet gap, then layout pass 2 (e.g.
    // after a chip-row mount/unmount reflows the calendar height).
    // Each pass produces its own tick bump.
    const { result } = renderHook(() => useEventBoundsRegistry());
    act(() => {
      result.current.record(makeEvent(1), LAYOUT_A);
      jest.advanceTimersByTime(REGISTRY_TICK_DEBOUNCE_MS);
    });
    expect(result.current.tick).toBe(1);

    act(() => {
      result.current.record(makeEvent(2), LAYOUT_B);
      jest.advanceTimersByTime(REGISTRY_TICK_DEBOUNCE_MS);
    });
    expect(result.current.tick).toBe(2);
  });

  it("does not bump tick when no record calls occur", () => {
    const { result } = renderHook(() => useEventBoundsRegistry());
    act(() => {
      jest.advanceTimersByTime(REGISTRY_TICK_DEBOUNCE_MS * 10);
    });
    expect(result.current.tick).toBe(0);
  });

  it("keeps record/get/unregister identities stable across tick bumps", () => {
    // The hosts pass `record` as `onEventLayout` to the vendored
    // Calendar. If `record`'s identity changed on every tick bump,
    // the Calendar's `effectiveRenderer` memo would invalidate and
    // every EventBlock would re-layout — a feedback loop.
    const { result } = renderHook(() => useEventBoundsRegistry());
    const firstRecord = result.current.record;
    const firstGet = result.current.get;
    const firstUnregister = result.current.unregister;

    act(() => {
      result.current.record(makeEvent(1), LAYOUT_A);
      jest.advanceTimersByTime(REGISTRY_TICK_DEBOUNCE_MS);
    });
    expect(result.current.tick).toBe(1);
    expect(result.current.record).toBe(firstRecord);
    expect(result.current.get).toBe(firstGet);
    expect(result.current.unregister).toBe(firstUnregister);
  });

  it("does not bump tick after unmount", () => {
    // Belt-and-suspenders: the cleanup effect clears any in-flight
    // timer on unmount. This test fails if either the cleanup or
    // the mounted-ref guard regress.
    const { result, unmount } = renderHook(() => useEventBoundsRegistry());
    act(() => {
      result.current.record(makeEvent(1), LAYOUT_A);
    });
    unmount();
    // Spying on console.error catches React's warning for a
    // setState on an unmounted component, which is what we're
    // guarding against.
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    act(() => {
      jest.advanceTimersByTime(REGISTRY_TICK_DEBOUNCE_MS * 10);
    });
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------
// Invalidate / isSettled — 2026-05-13 (fix/move-chain-arrow-future-toggle)
//
// `invalidate()` flips `isSettled` to `false` until the next
// record-cluster settle re-bumps `tick` past `staleTick`. Used by
// the calendar views to gate arrow emission across futureMode
// toggles so stale rects from the prior projection don't paint
// wrong-direction arrows.
//
// Crucial property: `invalidate()` does NOT wipe the map. Entries
// for events whose position is unchanged across the projection
// swap retain their (still-correct) rects — the vendored library
// never re-fires `onEventLayout` for those events, so wiping
// would drop them permanently and arrows on those endpoints would
// silently disappear until a forced re-render (the user-reported
// "switch Show None then Show All to bring arrows back" symptom).
// ---------------------------------------------------------------

describe("useEventBoundsRegistry — invalidate / isSettled", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts settled before any invalidate calls", () => {
    const { result } = renderHook(() => useEventBoundsRegistry());
    expect(result.current.isSettled).toBe(true);
  });

  it("flips to unsettled after invalidate, even with prior tick bumps", () => {
    const { result } = renderHook(() => useEventBoundsRegistry());
    // Record cluster bumps tick to 1.
    act(() => {
      result.current.record(makeEvent(1), LAYOUT_A);
      jest.advanceTimersByTime(REGISTRY_TICK_DEBOUNCE_MS);
    });
    expect(result.current.tick).toBe(1);
    expect(result.current.isSettled).toBe(true);

    // Invalidate must flip isSettled to false even though tick is
    // already past 0 — staleTick must leapfrog tick, not just
    // increment by 1 from its previous value (which was 0).
    act(() => {
      result.current.invalidate();
    });
    expect(result.current.isSettled).toBe(false);
  });

  it("returns to settled after the next record-cluster settle", () => {
    const { result } = renderHook(() => useEventBoundsRegistry());
    act(() => {
      result.current.record(makeEvent(1), LAYOUT_A);
      jest.advanceTimersByTime(REGISTRY_TICK_DEBOUNCE_MS);
    });
    expect(result.current.isSettled).toBe(true);

    act(() => {
      result.current.invalidate();
    });
    expect(result.current.isSettled).toBe(false);

    act(() => {
      result.current.record(makeEvent(2), LAYOUT_B);
      jest.advanceTimersByTime(REGISTRY_TICK_DEBOUNCE_MS);
    });
    expect(result.current.isSettled).toBe(true);
  });

  it("returns null from get() for entries recorded BEFORE invalidate (per-entry staleness)", () => {
    // PLAN-DEVIATION: 2026-05-13-bounds-registry-per-entry-staleness.
    //
    // Pre-2026-05-13 contract: invalidate retained map entries so
    // an event whose layout didn't change across Future/Now would
    // continue reading its (correct) pre-invalidate rect. The
    // retention was a defense against the rare "layout unchanged"
    // edge case.
    //
    // Post-2026-05-13 contract: invalidate marks every existing
    // entry stale-on-read via a per-entry sequence cutoff. The
    // map itself is still NOT wiped (so a future `record()` for
    // the same id can detect the re-record correctly), but reads
    // for stale entries return null. This is the primary defense
    // against the user-reported "bad arrows after Future→Now
    // toggle" bug, which the previous retention contract masked
    // by letting Future-mode rects leak through.
    //
    // See `docs/PLAN-DEVIATIONS.md#2026-05-13-bounds-registry-per-
    // entry-staleness` for the full rationale.
    const { result } = renderHook(() => useEventBoundsRegistry());
    act(() => {
      result.current.record(makeEvent(42), LAYOUT_A);
      jest.advanceTimersByTime(REGISTRY_TICK_DEBOUNCE_MS);
    });
    expect(result.current.get(42)).toEqual(LAYOUT_A);

    act(() => {
      result.current.invalidate();
    });
    // Stale: pre-invalidate entry now reads as null.
    expect(result.current.get(42)).toBeNull();
    expect(result.current.isSettled).toBe(false);
  });

  it("returns fresh entries from get() after a post-invalidate record()", () => {
    // PLAN-DEVIATION: 2026-05-13-bounds-registry-per-entry-staleness
    // companion to the staleness test above. After an invalidate,
    // a subsequent `record()` for the SAME id stamps a fresh
    // sequence number on the entry, so `get()` returns the new
    // rect. This is the lifecycle the move-chain arrow geometry
    // helper relies on: stale endpoints read as null (segment is
    // skipped), and once `onEventLayout` re-fires post-toggle
    // the endpoint reads as fresh again (segment emits with the
    // correct rect).
    const { result } = renderHook(() => useEventBoundsRegistry());
    act(() => {
      result.current.record(makeEvent(42), LAYOUT_A);
      jest.advanceTimersByTime(REGISTRY_TICK_DEBOUNCE_MS);
    });
    act(() => {
      result.current.invalidate();
    });
    expect(result.current.get(42)).toBeNull();

    // Simulate the next `onEventLayout` cluster: record a fresh
    // rect for the same id.
    act(() => {
      result.current.record(makeEvent(42), LAYOUT_B);
      jest.advanceTimersByTime(REGISTRY_TICK_DEBOUNCE_MS);
    });
    expect(result.current.get(42)).toEqual(LAYOUT_B);
    expect(result.current.isSettled).toBe(true);
  });

  it("isolates staleness across entry ids (unrelated entries don't refresh each other)", () => {
    // PLAN-DEVIATION: 2026-05-13-bounds-registry-per-entry-staleness.
    //
    // The whole point of the per-entry sequence check: a `record`
    // call for one id should NOT magically refresh a different
    // id's stale entry. Each entry's freshness is decided by its
    // OWN `__recordSeq` against the invalidatedAt cutoff.
    //
    // This is the property that fixes the user-reported "wrong-
    // direction arrows" bug: an unrelated event's `onLayout` fires
    // post-invalidate, the global `isSettled` flips back to true,
    // but the chain endpoint's entry is STILL stale per its own
    // `__recordSeq` and `get()` returns null for it.
    const { result } = renderHook(() => useEventBoundsRegistry());
    act(() => {
      result.current.record(makeEvent(1), LAYOUT_A);
      result.current.record(makeEvent(2), LAYOUT_B);
      jest.advanceTimersByTime(REGISTRY_TICK_DEBOUNCE_MS);
    });
    act(() => {
      result.current.invalidate();
    });
    expect(result.current.get(1)).toBeNull();
    expect(result.current.get(2)).toBeNull();

    // Re-record ONLY id=1. id=2 stays stale.
    act(() => {
      result.current.record(makeEvent(1), LAYOUT_A);
      jest.advanceTimersByTime(REGISTRY_TICK_DEBOUNCE_MS);
    });
    expect(result.current.get(1)).toEqual(LAYOUT_A);
    expect(result.current.get(2)).toBeNull();
  });

  it("keeps invalidate identity stable across tick bumps", () => {
    const { result } = renderHook(() => useEventBoundsRegistry());
    const firstInvalidate = result.current.invalidate;
    act(() => {
      result.current.record(makeEvent(1), LAYOUT_A);
      jest.advanceTimersByTime(REGISTRY_TICK_DEBOUNCE_MS);
    });
    expect(result.current.invalidate).toBe(firstInvalidate);
  });

  it("handles invalidate before any record (initial-toggle race)", () => {
    // If the user toggles futureMode before any layout pass has
    // run (e.g. immediately on mount), invalidate fires with
    // tickRef = 0. `isSettled` should still flip to false, then
    // back to true after the first record cluster settles.
    const { result } = renderHook(() => useEventBoundsRegistry());
    act(() => {
      result.current.invalidate();
    });
    expect(result.current.isSettled).toBe(false);

    act(() => {
      result.current.record(makeEvent(1), LAYOUT_A);
      jest.advanceTimersByTime(REGISTRY_TICK_DEBOUNCE_MS);
    });
    expect(result.current.isSettled).toBe(true);
  });

  it("handles back-to-back invalidates (rapid toggle)", () => {
    // Pathological case: user double-taps futureMode toggle
    // before any layout has settled. Each invalidate must keep
    // isSettled false; only after a full record-cluster settle
    // does isSettled return to true.
    const { result } = renderHook(() => useEventBoundsRegistry());
    act(() => {
      result.current.record(makeEvent(1), LAYOUT_A);
      jest.advanceTimersByTime(REGISTRY_TICK_DEBOUNCE_MS);
    });
    expect(result.current.tick).toBe(1);

    act(() => {
      result.current.invalidate();
      result.current.invalidate();
      result.current.invalidate();
    });
    expect(result.current.isSettled).toBe(false);

    act(() => {
      result.current.record(makeEvent(2), LAYOUT_B);
      jest.advanceTimersByTime(REGISTRY_TICK_DEBOUNCE_MS);
    });
    expect(result.current.isSettled).toBe(true);
  });
});

