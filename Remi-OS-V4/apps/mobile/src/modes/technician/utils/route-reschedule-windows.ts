/**
 * `route-reschedule-windows` (Phase 4 + Phase 6, 2026-05-21 to
 * 2026-05-22) — pure helpers that translate a chip-bar drag drop
 * into the per-side time windows and defaults that
 * `<DragRescheduleSheet>` consumes.
 *
 * Extracted from `franchise-route-map.tsx` so the math is unit-
 * testable without standing up the whole map view, its React
 * Query providers, or a mocked MapKit native bridge.
 *
 * INSERT-mode contract (matches the plan, § Phase 6):
 *
 *   - The dragged chip is being dropped between two OTHER chips at
 *     0-indexed position `insertAtIndex` in `pendingOrder` (with the
 *     dragged chip removed from `pendingOrder` first to simulate the
 *     insertion). The picker is bounded by
 *     `[newLeft.endTime, newRight.startTime]`, substituting the
 *     dispatcher-day bounds when a neighbor is missing (front/back of
 *     route).
 *   - The picker's DEFAULT start is computed by the sheet itself via
 *     `defaultInsertStartHHMM(window, durationMinutes)` (midpoint of
 *     `[window.start, window.end - duration]`, snapped to nearest
 *     15-min slot). The parent does NOT pre-pick a default; it just
 *     supplies the window + duration and lets the sheet derive.
 *   - DURATION is derived from the DRAGGED stop's own appointment via
 *     `deriveDurationMinutes` — same helper SWAP mode uses. The BE's
 *     `repositionStop` then preserves that duration server-side via
 *     `computeNewEndTime`.
 *   - 1-indexed `newStopOrder` for the BE = `insertAtIndex + 1`. The
 *     helper returns it alongside the window so callers don't have to
 *     repeat the off-by-one logic at every wire-call site.
 *
 * Adjacency / self-position edge cases:
 *
 *   - If the dragged chip is dropped back into the slot it came from
 *     (same `insertAtIndex` as its current index after removal),
 *     `computeInsertWindow` still returns a valid window — the chip
 *     bar's `handleDragEnd` is responsible for short-circuiting the
 *     no-op case (`from === to && snapTargetStopId == null`) before
 *     it ever calls this helper.
 *   - If `insertAtIndex` is out of range (< 0 or > pendingOrder
 *     length after removing the dragged chip), the helper returns
 *     null. The caller bails rather than opening the sheet on a
 *     stale gesture.
 *
 * SWAP-mode contract (matches the plan, § Phase 4):
 *
 *   - A is moving to where B WAS. A's window = B's pre-swap
 *     neighborhood: `[pendingOrder[bIdx-1].endTime, pendingOrder[bIdx+1].startTime]`,
 *     substituting the dispatcher-day bounds at the ends.
 *   - B is symmetric — moving to where A WAS, with the analogous
 *     neighborhood read off A's old position.
 *   - Each side's DEFAULT start = the OTHER side's pre-swap
 *     `scheduledTime`. Hitting Save immediately on open is then
 *     wire-equivalent to the pre-Phase-4 auto-trade swap — the
 *     critical "Save with no changes = no behavior regression"
 *     regression check.
 *   - Each side's DURATION is derived from its OWN appointment's
 *     `scheduledTime`/`scheduledEndTime`. Falls back to
 *     `DEFAULT_FALLBACK_DURATION_MIN` (60) when either end is null
 *     or unparseable. Matches the BE service's own duration
 *     fallback semantics (see REMIBackend route-reorder.service.ts).
 *
 * Adjacency edge case (documented limitation): when A and B sit
 * directly next to each other in `pendingOrder`, the "neighbor"
 * one slot past B (or A) is the OTHER swapped chip — meaning the
 * window bound for A ends up using A's own pre-swap times. This
 * matches the plan's spec literally and produces a usable window
 * in practice (the picker is bounded by where A's old slot
 * ended, which is a reasonable upper bound for someone landing
 * at B's old position when B was immediately to A's right). The
 * dispatcher-day bounds catch the truly-edge cases (front or back
 * of the route).
 */

import type { MapStop } from "@technician/types/api";
import {
  type TimeWindow,
  parseHHMMToMinutes,
} from "@technician/components/route/drag-reschedule-sheet";

/**
 * Dispatcher-day bounds the picker windows clamp to when a stop
 * has no neighbor on one side. Mirrors the calendar's
 * `CALENDAR_CONFIG.DEFAULT_START_HOUR` / `DEFAULT_END_HOUR` so the
 * map's reschedule picker can't pick a time the dispatcher
 * calendar would refuse to render.
 *
 * Kept as `HH:MM:SS` strings (not hour numbers) so the
 * `<DragRescheduleSheet>`'s `TimeWindow` consumer can use them
 * verbatim without a parse pass.
 */
export const DISPATCH_DAY_START_HHMM = "06:00:00";
export const DISPATCH_DAY_END_HHMM = "20:00:00";

/** Used when an appointment's `scheduledEndTime - scheduledTime` is unknown. */
export const DEFAULT_FALLBACK_DURATION_MIN = 60;

export interface SwapWindowsResult {
  aWindow: TimeWindow;
  aDefaultStartHHMM: string;
  aDurationMinutes: number;
  bWindow: TimeWindow;
  bDefaultStartHHMM: string;
  bDurationMinutes: number;
}

/**
 * Compute the per-side picker windows + defaults + durations for
 * a SWAP-mode drop. Returns `null` when either stop isn't in
 * `pendingOrder` (defensive — the chip bar shouldn't fire a swap
 * for stops it doesn't track, but the caller may bail rather
 * than open the sheet on a stale gesture).
 */
export function computeSwapWindows(
  pendingOrder: MapStop[],
  draggedStopId: number,
  targetStopId: number,
): SwapWindowsResult | null {
  const aIdx = pendingOrder.findIndex((s) => s.stopId === draggedStopId);
  const bIdx = pendingOrder.findIndex((s) => s.stopId === targetStopId);
  if (aIdx < 0 || bIdx < 0 || aIdx === bIdx) return null;

  const a = pendingOrder[aIdx];
  const b = pendingOrder[bIdx];

  return {
    aWindow: neighborhoodWindow(pendingOrder, bIdx),
    aDefaultStartHHMM: b.scheduledTime ?? DISPATCH_DAY_START_HHMM,
    aDurationMinutes: deriveDurationMinutes(a),
    bWindow: neighborhoodWindow(pendingOrder, aIdx),
    bDefaultStartHHMM: a.scheduledTime ?? DISPATCH_DAY_START_HHMM,
    bDurationMinutes: deriveDurationMinutes(b),
  };
}

/**
 * Window centered on slot `idx` in `pendingOrder`: starts at the
 * previous neighbor's end (or `DISPATCH_DAY_START_HHMM` at the
 * front), ends at the next neighbor's start (or
 * `DISPATCH_DAY_END_HHMM` at the back).
 *
 * Falls back to the dispatcher-day bounds whenever a neighbor's
 * time is null — keeps the window valid (and the sheet usable)
 * for newly-created appointments that haven't been routed yet
 * and have null scheduled fields.
 */
function neighborhoodWindow(
  pendingOrder: MapStop[],
  idx: number,
): TimeWindow {
  const prev = idx > 0 ? pendingOrder[idx - 1] : null;
  const next =
    idx < pendingOrder.length - 1 ? pendingOrder[idx + 1] : null;
  const startHHMM =
    prev?.scheduledEndTime ?? DISPATCH_DAY_START_HHMM;
  const endHHMM = next?.scheduledTime ?? DISPATCH_DAY_END_HHMM;
  return { startHHMM, endHHMM };
}

export interface InsertWindowResult {
  /** Picker bounds; consumed verbatim by `<DragRescheduleSheet>`. */
  window: TimeWindow;
  /**
   * Duration of the dragged appointment in minutes. Derived from
   * its own `scheduledTime` + `scheduledEndTime`, falling back to
   * `DEFAULT_FALLBACK_DURATION_MIN`. Matches the BE's per-
   * appointment duration preservation contract.
   */
  durationMinutes: number;
  /**
   * 1-indexed `stop_order` the BE should write for the target.
   * Equals `insertAtIndex + 1`. Surfaced here so callers don't
   * repeat the off-by-one logic at every wire-call site.
   */
  newStopOrder: number;
}

/**
 * Compute the picker window + duration + 1-indexed newStopOrder
 * for an INSERT-mode drop. Returns `null` when:
 *   - the dragged stop isn't in `pendingOrder` (stale gesture), OR
 *   - `insertAtIndex` is outside `[0, pendingOrder.length - 1]`
 *     after removing the dragged stop (out-of-range drop). The
 *     `- 1` accounts for the dragged chip being removed from
 *     `pendingOrder` before the new-neighbor lookup.
 *
 * The default start time for the picker is NOT returned here — the
 * `<DragRescheduleSheet>` derives it internally via
 * `defaultInsertStartHHMM(window, durationMinutes)` so the midpoint
 * + 15-min snapping logic lives in one place.
 *
 * `insertAtIndex` is the position the chip will land at in the
 * "without the dragged chip" sequence:
 *   - 0 → before every other chip (front of route).
 *   - pendingOrder.length - 1 → after every other chip (back of route).
 *   - i → between the (i-1)th and ith remaining chips.
 *
 * This matches DFL's `to` index when the dragged chip is removed
 * from the source list before the parent computes the new order
 * (i.e. the chip bar's `handleDragEnd` passes DFL's `to` directly).
 */
export function computeInsertWindow(
  pendingOrder: MapStop[],
  draggedStopId: number,
  insertAtIndex: number,
): InsertWindowResult | null {
  const dragged = pendingOrder.find((s) => s.stopId === draggedStopId);
  if (!dragged) return null;

  const without = pendingOrder.filter((s) => s.stopId !== draggedStopId);
  if (insertAtIndex < 0 || insertAtIndex > without.length) return null;

  const newLeft = insertAtIndex > 0 ? without[insertAtIndex - 1] : null;
  const newRight =
    insertAtIndex < without.length ? without[insertAtIndex] : null;

  const startHHMM =
    newLeft?.scheduledEndTime ?? DISPATCH_DAY_START_HHMM;
  const endHHMM = newRight?.scheduledTime ?? DISPATCH_DAY_END_HHMM;

  return {
    window: { startHHMM, endHHMM },
    durationMinutes: deriveDurationMinutes(dragged),
    // 1-indexed for the BE. `insertAtIndex` is 0-indexed in the
    // "without the dragged chip" sequence; adding 1 gives the
    // final 1-indexed slot the chip lands in.
    newStopOrder: insertAtIndex + 1,
  };
}

/**
 * Per-appointment service duration in minutes. Computed from the
 * stop's own `scheduledTime` + `scheduledEndTime`; falls back to
 * `DEFAULT_FALLBACK_DURATION_MIN` when either end is missing or
 * unparseable. The BE's `swapStops` service uses the same fallback
 * shape so the sheet's "end = start + duration" preview matches
 * what the server will persist.
 */
export function deriveDurationMinutes(stop: MapStop): number {
  if (!stop.scheduledTime || !stop.scheduledEndTime) {
    return DEFAULT_FALLBACK_DURATION_MIN;
  }
  const start = parseHHMMToMinutes(stop.scheduledTime);
  const end = parseHHMMToMinutes(stop.scheduledEndTime);
  if (start == null || end == null) return DEFAULT_FALLBACK_DURATION_MIN;
  const diff = end - start;
  if (diff <= 0) return DEFAULT_FALLBACK_DURATION_MIN;
  return diff;
}
