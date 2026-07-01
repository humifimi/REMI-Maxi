/**
 * `useEventBoundsRegistry` — FORK Phase 26 consumer companion
 * (2026-05-10).
 *
 * Maintains a per-Calendar-mount map of `appointmentId →
 * column-local rendered rect`. The vendored library fires its new
 * `onEventLayout` prop (FORK Phase 26) for every EventBlock that
 * receives or revises a layout pass; this hook absorbs those
 * reports without triggering React re-renders for every write,
 * and exposes a read-only accessor for the move-chain arrow
 * geometry to consult.
 *
 * # Why this exists
 *
 * `tileRect()` in `compute-move-chain-arrows.ts` produces the
 * "logical grid cell" for a tile (column-X + time-slot-Y, width
 * = column width, height = `(toMin - fromMin) * hourHeight/60`).
 * That cell is inset on the screen by the EventBlock's own
 * `dynamicStyle` (`+1`px left, `+2`px top, `-3`px width, `-4`px
 * height) plus any `eventStyleOverrides.container` border /
 * padding. Anchoring arrow endpoints to the cell rect therefore
 * lands them a few pixels OUTSIDE the visible card edge.
 *
 * Phase 26 reports the EventBlock's actual post-style rect via
 * `onLayout`. The arrow overlay reads those rects (combined with
 * the consumer-known column offset) for an exact card-edge anchor.
 *
 * # API
 *
 *   - `record(event, layout)` — stable identity; pass to
 *     `<Calendar onEventLayout={record} />`. Safe to call on every
 *     render of the EventBlock (it writes into a ref-backed Map
 *     synchronously and additionally schedules a debounced
 *     `tick` bump — see below).
 *   - `get(appointmentId)` — returns the most recent bounds for
 *     the given appointment id, or `null` if none have been
 *     recorded yet (caller falls back to legacy `tileRect`
 *     geometry).
 *   - `unregister(appointmentId)` — drops the entry. Optional;
 *     stale entries are harmless because the arrow overlay only
 *     consults the registry for events it's painting arrows TO/FROM
 *     and those are filtered to the visible set upstream. Provided
 *     for future use (e.g. when a calendar mount unmounts and the
 *     map should be cleared between view-mode transitions).
 *   - `tick` — monotonically-increasing React state that bumps
 *     once after a quiet window (default 50ms) following the
 *     last `record` call. Designed for inclusion in downstream
 *     `useMemo` deps so consumers can re-derive geometry exactly
 *     when the registry has settled. See "Settling signal" below.
 *
 * # Settling signal (`tick`) — 2026-05-12
 *
 * The arrow-precision pass (`fix/move-chain-arrow-registry-
 * precision`) gates move-chain segment emission on BOTH endpoints
 * having a registry rect. To make that gate work, consumers need
 * a re-render trigger once the registry actually has the rects —
 * otherwise the first geometry pass after Calendar mount sees
 * an empty registry, emits zero segments (because every endpoint
 * resolves to `source: "grid"`), and the overlay stays blank
 * forever because nothing wakes it up after `onEventLayout`
 * populates the registry.
 *
 * `tick` solves that with a debounced state bump:
 *
 *   1. Every `record` call writes synchronously into the map.
 *   2. Every `record` call also (re-)schedules a `setTick(t+1)`
 *      after `REGISTRY_TICK_DEBOUNCE_MS` of quiet. Clustered
 *      writes — the typical case during initial layout, when N
 *      EventBlocks all fire `onLayout` within a few ms — collapse
 *      into a single tick bump after the cluster ends.
 *   3. Consumers include `eventBoundsRegistry.tick` in their
 *      geometry `useMemo` deps. The bump triggers exactly one
 *      re-derive once the registry has stabilized.
 *
 * The debounce constant (`REGISTRY_TICK_DEBOUNCE_MS`) is exported
 * for tests. 50ms is small enough that the user-perceived "wait
 * for arrows to appear" is < a single frame's perception, and
 * large enough to absorb the typical initial-layout storm.
 *
 * # Coordinate space
 *
 * Bounds are in COLUMN-LOCAL coordinates — exactly what
 * `View.onLayout` reports for an absolutely-positioned child of
 * the day-column View. The consumer combines with column-X
 * (computed by `tileRect` from `appointmentBlockWidth` × column
 * index) to produce grid-coordinate rects.
 *
 * # Multi-segment events
 *
 * If the vendored library ever splits a single event into
 * multiple visual segments (multi-day spans, etc.), each segment's
 * EventBlock fires its own `onEventLayout`. They all share the
 * same `appointmentId`, so this registry keeps the LAST
 * received rect per id. For move-chain arrows that's fine — the
 * arrow anchors to the most recent paint regardless of segment.
 * If a future feature needs per-segment bounds, this is the
 * obvious place to add a segment discriminator.
 *
 * # Why not Zustand
 *
 * The map writes are still ref-backed (no per-write React state
 * churn). Only the debounced `tick` bumps React state, and that
 * fires at most once per quiet-window — meaningfully less often
 * than per-write. Zustand-or-store machinery would add ceremony
 * without buying anything over a single `useState` counter.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { OnEventLayout } from "react-native-resource-calendar";

import { traceCalendar } from "@technician/utils/sentry-diagnostics";

/**
 * Debounce window for the settling-tick state bump. After the
 * last `record` call, we wait this many milliseconds of quiet
 * before incrementing `tick`. Tuned for the typical initial-
 * layout cluster (every EventBlock's `onLayout` fires within
 * 10-30ms of each other on a populated week view) plus a small
 * safety margin.
 *
 * Exported so tests can drive the debounce deterministically
 * with `jest.useFakeTimers()`.
 */
export const REGISTRY_TICK_DEBOUNCE_MS = 50;

export interface EventBoundsEntry {
  /** Column-local X position (intra-column, top-left corner). */
  x: number;
  /** Grid-Y position (column starts at Y=0, so column-local Y == grid Y). */
  y: number;
  /** Post-style rendered width in pixels. */
  width: number;
  /** Post-style rendered height in pixels. */
  height: number;
}

/**
 * Internal map shape — adds a monotonic record sequence number used
 * for the per-entry staleness check introduced 2026-05-13 by
 * PLAN-DEVIATION 2026-05-13-bounds-registry-per-entry-staleness.
 *
 * Each `record()` bumps `recordSeqRef` and stamps the new entry with
 * that value. Each `invalidate()` snapshots the current `recordSeqRef`
 * into `invalidatedAtSeqRef`. `get()` returns null for entries whose
 * `__recordSeq <= invalidatedAtSeqRef.current` — i.e., entries that
 * predate the most recent invalidate.
 *
 * The `__` prefix is internal — consumers never observe it. The
 * `EventBoundsEntry` returned from `get()` is a plain shape with
 * `{x, y, width, height}` only.
 */
interface InternalBoundsEntry extends EventBoundsEntry {
  __recordSeq: number;
}

export interface UseEventBoundsRegistryHandle {
  /**
   * Stable-identity onLayout reporter. Wire this directly into
   * `<Calendar onEventLayout={record} />`. Re-renders of the
   * consumer component do NOT change this callback's identity, so
   * downstream `effectiveRenderer` `useMemo` deps stay stable and
   * EventBlock doesn't get re-keyed.
   */
  record: OnEventLayout;
  /** Latest recorded bounds for an appointment id, or `null`. */
  get: (appointmentId: number) => EventBoundsEntry | null;
  /** Drop the stored entry for an appointment id. No-op when absent. */
  unregister: (appointmentId: number) => void;
  /**
   * Mark the registry as STALE. Used by the calendar views when the
   * canvas data source swaps wholesale (Now ↔ Future toggle).
   *
   * # 2026-05-13 contract update — PLAN-DEVIATION
   *   `2026-05-13-bounds-registry-per-entry-staleness`
   *
   * The original 2026-05-13 implementation flagged the registry as
   * globally stale (`isSettled` flips to `false`) but RETAINED the
   * map entries verbatim — the rationale being that events whose
   * layout didn't change across the projection swap (e.g., non-chain
   * appointments, ghost destinations identical across renders) would
   * never re-fire `onEventLayout`, so wiping their entries would
   * permanently drop the rects.
   *
   * That assumption failed in production: user-reported "bad arrows
   * after Future→Now toggle in portrait day view, always pointing at
   * the top corner of a same-color ghost." Diagnosis:
   *   1. In Future mode, the chain's SOURCE appointment is painted
   *      at its DESTINATION position. The registry recorded that
   *      Future-rect under the source's appointment id.
   *   2. On toggle to Now, `isSettled` flips false (good), but the
   *      stale Future-rect is retained.
   *   3. Some unrelated event fires `onLayout` (e.g., header reflow,
   *      a non-chain appt re-measuring) → debounce settles →
   *      `tick > staleTick` → `isSettled` flips back to `true`.
   *   4. The chain endpoint's `onLayout` either hasn't fired yet or
   *      got coalesced into the already-settled debounce. The arrow
   *      geometry helper reads the STALE Future-rect from the
   *      registry — which is exactly where the ghost destination
   *      now paints — producing a tiny, wrong-direction arrow
   *      anchored at the same-color ghost's corner.
   *
   * The fix: every entry now carries a monotonic `__recordSeq`
   * stamp, and `invalidate()` snapshots `recordSeqRef.current` into
   * `invalidatedAtSeqRef`. The `get()` accessor returns null for
   * entries whose `__recordSeq <= invalidatedAtSeqRef.current` —
   * i.e., entries that predate the most recent invalidate. Stale
   * reads fall through to the `"grid"` fallback in
   * `tileRect`, which is rejected by the
   * `requireRegistryRect: true` gate → segment is silently SKIPPED
   * until the new `onLayout` fires and refreshes the entry.
   *
   * Trade-off: for chain endpoints whose layout truly didn't change
   * between projections (an edge case — chain endpoints by
   * definition move), arrows now drop until the next forced layout
   * pass. The previous "retain everything" contract masked that
   * edge case AT THE COST of the much-more-common stale-rect leak.
   * We optimize for the common case and accept the rare drop.
   *
   * See `docs/PLAN-DEVIATIONS.md#2026-05-13-bounds-registry-per-
   * entry-staleness` for the full rationale + the path back to
   * the previous contract if it's needed.
   */
  invalidate: () => void;
  /**
   * Monotonically-increasing settling signal. Bumps once after
   * `REGISTRY_TICK_DEBOUNCE_MS` of quiet following the most
   * recent `record` call. Include this in downstream `useMemo`
   * deps that derive geometry from the registry so the derivation
   * re-runs exactly when the registry has populated. See the
   * file-header doc-block under "Settling signal".
   *
   * Starts at 0. Stable identity across re-renders (it's React
   * state, so the value changes but referential equality of the
   * handle's other fields is preserved separately).
   */
  tick: number;
  /**
   * 2026-05-13 — `true` when the registry has been re-populated
   * (via `record`) since the most recent `invalidate` call (or
   * has never been invalidated). `false` between an `invalidate`
   * call and the next record-cluster settle.
   *
   * Consumers gate arrow emission on this so a stale projection's
   * rects don't leak into the next geometry pass. Pairs with
   * `tick` in the same `useMemo` deps so the geometry re-derives
   * exactly when the gate flips.
   */
  isSettled: boolean;
}

/**
 * Pure helpers exported for unit testing. Operate on a Map you own.
 * The hook below is a thin React wrapper that gives you a ref-backed
 * Map with stable callbacks.
 *
 * Both helpers retain the original `EventBoundsEntry` shape (NO
 * sequence stamping) so existing tests against the pure helpers keep
 * working. The per-entry staleness behavior introduced 2026-05-13
 * lives ONLY in the React hook below; the pure helpers stay the
 * "naive Map" semantics they always had.
 */
export function recordIntoMap(
  map: Map<number, EventBoundsEntry>,
  appointmentId: number | null | undefined,
  layout: EventBoundsEntry,
): void {
  if (appointmentId == null || !Number.isFinite(appointmentId)) return;
  map.set(appointmentId, layout);
}

export function getFromMap(
  map: Map<number, EventBoundsEntry>,
  appointmentId: number | null | undefined,
): EventBoundsEntry | null {
  if (appointmentId == null || !Number.isFinite(appointmentId)) return null;
  return map.get(appointmentId) ?? null;
}

export function useEventBoundsRegistry(): UseEventBoundsRegistryHandle {
  // Ref-backed Map: mutations don't trigger re-renders, but the
  // identity stays stable across the consumer's render cycle.
  //
  // PLAN-DEVIATION: 2026-05-13-bounds-registry-per-entry-staleness —
  // entries carry a `__recordSeq` stamp now. See the `invalidate`
  // doc-block on the handle interface above for the full rationale.
  const mapRef = useRef<Map<number, InternalBoundsEntry>>(
    // Initialize lazily via `useRef`'s callback-free overload —
    // pass the Map instance directly. (The `new Map()` runs on
    // every render but the ref ignores subsequent inputs, so it
    // costs one allocation per mount, not per render.)
    new Map<number, InternalBoundsEntry>(),
  );

  // PLAN-DEVIATION: 2026-05-13-bounds-registry-per-entry-staleness.
  // Monotonic record sequence — bumps once per `record()` call. Each
  // entry stamps its `__recordSeq` field with the value AT WRITE
  // TIME. `invalidate()` snapshots `recordSeqRef.current` into
  // `invalidatedAtSeqRef`; `get()` returns null for entries whose
  // `__recordSeq <= invalidatedAtSeqRef.current`. This pushes the
  // staleness check from the previous global `isSettled` gate
  // (which let unrelated `onLayout` events flip the gate back to
  // `true` before chain endpoints had refreshed) down to a per-id
  // gate that catches stale rects regardless of which other events
  // refreshed first.
  const recordSeqRef = useRef(0);
  const invalidatedAtSeqRef = useRef(0);

  // 2026-05-12 settling signal — see file-header doc-block.
  // `tick` bumps once after REGISTRY_TICK_DEBOUNCE_MS of quiet
  // following the most recent `record` call. Consumers include
  // it in geometry `useMemo` deps to re-derive once the registry
  // has populated. The debounce timer is held in a ref so the
  // setter identity stays stable across renders; the setter is
  // also stable because it's the bare `setTick` from `useState`.
  const [tick, setTick] = useState(0);
  // 2026-05-13 invalidate-vs-settle counter. `staleTick` is set
  // by `invalidate()` to `currentTick + 1`, guaranteeing
  // `isSettled = staleTick <= tick` flips to `false` regardless
  // of how many `record()` cluster settles came before. The next
  // `record()` cluster bumps `tick` past `staleTick`, flipping
  // `isSettled` back to `true`. See the `invalidate` doc-block
  // on the handle interface for why we don't wipe the map on
  // invalidate.
  const [staleTick, setStaleTick] = useState(0);
  // Latest `tick` value, mirrored into a ref so `invalidate()`
  // can read it WITHOUT taking `tick` as a useCallback dep
  // (which would break the stable callback identity downstream
  // consumers depend on).
  const tickRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up any pending debounce on unmount. Without this, an
  // in-flight timer fires `setTick` after the consumer has
  // unmounted → React warns about state updates on unmounted
  // components. Belt-and-suspenders since the closure also
  // captures `mounted` below, but the explicit cleanup is the
  // documented contract.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceTimerRef.current != null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  const record = useCallback<OnEventLayout>((event, layout) => {
    const id = (event as { id?: number | string | null }).id;
    const numericId =
      typeof id === "number"
        ? id
        : typeof id === "string"
          ? Number.parseInt(id, 10)
          : NaN;
    // PLAN-DEVIATION: 2026-05-13-bounds-registry-per-entry-staleness.
    // Stamp the entry with the current record sequence number BEFORE
    // writing into the map. `get()` consults this stamp against the
    // most recent `invalidatedAtSeqRef.current` to decide whether to
    // treat the entry as fresh (`__recordSeq > invalidatedAtSeq`)
    // or stale (`<=`). Stamping first guarantees the entry written
    // here is always considered fresh by an immediately-subsequent
    // `get()` call, even if `record` and `get` race on a single
    // frame.
    if (numericId != null && Number.isFinite(numericId)) {
      recordSeqRef.current += 1;
      mapRef.current.set(numericId, {
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
        __recordSeq: recordSeqRef.current,
      });
    }
    // Debounced settling-tick bump. Reset the timer on every
    // record; the actual setState only fires after the cluster
    // ends. setTimeout's callback guards against post-unmount
    // updates via `mountedRef`.
    if (debounceTimerRef.current != null) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      if (!mountedRef.current) return;
      setTick((t) => {
        const next = t + 1;
        tickRef.current = next;
        // 2026-05-13 — registry settle breadcrumb. Fires once per
        // settle cluster (the debounce window collapses all
        // record() bursts into one bump). Captures the map's
        // size + a small sample of recorded ids so we can see
        // in Sentry what the registry knew at the moment the
        // downstream geometry pass consulted it. Use sample
        // strategy: first 3 + last 3 ids (negatives = ghosts,
        // positives = real appts) → enough to distinguish "real
        // appts only" vs "ghosts present" vs "stale projection
        // leftovers" without dumping the full map. Capped trace
        // sizes are documented in `sentry-diagnostics.ts`.
        const keys = Array.from(mapRef.current.keys());
        const sampleHead = keys.slice(0, 3);
        const sampleTail = keys.length > 6 ? keys.slice(-3) : [];
        // PLAN-DEVIATION: 2026-05-13-bounds-registry-per-entry-
        // staleness — count entries currently considered fresh per
        // the per-entry sequence cutoff so we can correlate the
        // settle with how many ids are actually readable. Stale
        // entries linger in the map until they're overwritten by
        // a future `record()`; the freshCount is the number the
        // geometry helper would actually consume.
        let freshCount = 0;
        for (const e of mapRef.current.values()) {
          if (e.__recordSeq > invalidatedAtSeqRef.current) freshCount += 1;
        }
        traceCalendar("EventBoundsRegistry settle", {
          newTick: next,
          mapSize: keys.length,
          freshCount,
          invalidatedAtSeq: invalidatedAtSeqRef.current,
          recordSeq: recordSeqRef.current,
          sampleIds: sampleTail.length > 0
            ? [...sampleHead, "...", ...sampleTail]
            : sampleHead,
          ghostCount: keys.filter((k) => k < 0).length,
          realCount: keys.filter((k) => k > 0).length,
        });
        return next;
      });
    }, REGISTRY_TICK_DEBOUNCE_MS);
  }, []);

  const get = useCallback((appointmentId: number) => {
    // PLAN-DEVIATION: 2026-05-13-bounds-registry-per-entry-staleness.
    // Per-entry staleness check. Returns null for:
    //   - Unknown id (no map entry)
    //   - Invalid id (null / undefined / NaN — same as the pure helper)
    //   - Stale entry (`__recordSeq <= invalidatedAtSeqRef.current`)
    //
    // The third case is the new behavior — pre-2026-05-13 this
    // accessor returned whatever was in the map regardless of when
    // it was written. See the `invalidate` doc-block on the handle
    // interface above for the rationale.
    if (appointmentId == null || !Number.isFinite(appointmentId)) return null;
    const entry = mapRef.current.get(appointmentId);
    if (!entry) return null;
    if (entry.__recordSeq <= invalidatedAtSeqRef.current) return null;
    // Strip the internal `__recordSeq` field — consumers see the
    // plain `EventBoundsEntry` shape only.
    const { __recordSeq: _s, ...bounds } = entry;
    void _s;
    return bounds;
  }, []);

  const unregister = useCallback((appointmentId: number) => {
    mapRef.current.delete(appointmentId);
  }, []);

  // PLAN-DEVIATION: 2026-05-13-bounds-registry-per-entry-staleness.
  // Snapshot `recordSeqRef.current` into `invalidatedAtSeqRef` so
  // every existing entry (whose `__recordSeq` is <= the snapshot)
  // is treated as stale by subsequent `get()` calls. The map itself
  // is NOT wiped — entries persist so a future `record()` for the
  // same id can be detected as "re-recorded after invalidate"
  // (its new `__recordSeq` > `invalidatedAtSeq` → fresh again).
  //
  // We ALSO keep the existing global `isSettled` gate in place via
  // `staleTick` for backward compatibility — both layers fire on
  // every invalidate. The per-entry check is the new primary
  // defense; `isSettled` remains as the secondary "no arrows yet"
  // gate that callers use to avoid emitting partial chain arrows
  // during the brief settling window.
  //
  // We set `staleTick` to `tickRef.current + 1` (rather than
  // `staleTick + 1`) so the invalidate ALWAYS leapfrogs the
  // current `tick`, even after many record-cluster settles have
  // pushed `tick` far ahead of `staleTick`. Without this, an
  // invalidate after multiple settles wouldn't actually flip
  // `isSettled` to `false` (since `staleTick` would still be
  // less than `tick`) and the gate wouldn't kick in.
  const invalidate = useCallback(() => {
    if (mountedRef.current) {
      // PLAN-DEVIATION: 2026-05-13-bounds-registry-per-entry-staleness.
      // Mark every existing entry stale-on-read via the per-entry
      // sequence-number cutoff. The map itself is NOT wiped — the
      // cutoff filters reads, not writes.
      invalidatedAtSeqRef.current = recordSeqRef.current;
      // 2026-05-13 — registry invalidate breadcrumb. Captures the
      // map state at the exact moment the canvas data swap fires
      // (Now ↔ Future toggle). The map's contents at this instant
      // are what the next geometry pass would see if the gate were
      // off — so this breadcrumb plus the next "settle" breadcrumb
      // bracket the transient stale window.
      const keys = Array.from(mapRef.current.keys());
      traceCalendar("EventBoundsRegistry invalidate", {
        prevTick: tickRef.current,
        newStaleTick: tickRef.current + 1,
        newInvalidatedAtSeq: invalidatedAtSeqRef.current,
        mapSize: keys.length,
        ghostCount: keys.filter((k) => k < 0).length,
        realCount: keys.filter((k) => k > 0).length,
      });
      const nextStale = tickRef.current + 1;
      setStaleTick(() => nextStale);
    }
  }, []);

  const isSettled = staleTick <= tick;

  return useMemo(
    () => ({
      record,
      get,
      unregister,
      invalidate,
      tick,
      isSettled,
    }),
    [record, get, unregister, invalidate, tick, isSettled],
  );
}
