/**
 * PLAN-DEVIATION: 2026-05-22-chip-bar-plan-mode-batch — this module
 * owns the `PlannedMove` queue + the pure reducer that derives the
 * chip-bar order + polyline from it. The snap-zone plan had no notion
 * of a planned-move queue. See
 * docs/PLAN-DEVIATIONS.md#2026-05-22-chip-bar-plan-mode-batch.
 *
 * Route plan-mode helpers (chunks B2-2 and B2-3 of the chip-bar
 * plan-mode batch reorganization feature; see
 * `docs/implementation-plans/chip-bar-plan-mode-batch.md`).
 *
 * Module owns:
 *   - `PlannedMove` type + dedupe rule (B2-2)
 *   - `applyPlannedMoves(stops, moves) → stops[]` (B2-3) — pure
 *     reducer that returns the stops as they would look after the
 *     plan commits. The franchise map uses this to drive both the
 *     polyline shape AND the chip-bar order while plan mode is
 *     active, so the dispatcher sees the route reshape in real
 *     time without firing any BE calls.
 *
 * Kept as a tiny pure module (no React, no hooks) so each helper
 * has direct unit-test coverage independent of the parent
 * franchise-route-map component (whose existing Jest file is
 * blocked on an unrelated QueryClient setup gap).
 *
 * The HHMM helpers (`parseHHMMToMinutes`, `addDurationToHHMM`)
 * are imported from `drag-reschedule-sheet.tsx` to match the
 * existing precedent set by `route-reschedule-windows.ts`. They
 * are pure functions; importing the named exports does not pull
 * React into this module's runtime evaluation path.
 */

import type { MapStop } from "@technician/types/api";
import {
  addDurationToHHMM,
} from "@technician/components/route/drag-reschedule-sheet";

export interface TimeWindow {
  startHHMM: string;
  endHHMM: string;
}

/**
 * A single drop staged by the user while plan mode is active.
 * Carries the BE-shaped fields (stop ids, new ordering, new times)
 * AND the window/duration context captured at plan time, so the
 * B2-4 review sheet can re-render the picker without re-deriving
 * from a possibly-stale chip order.
 *
 * Times are the dispatcher's editable proposal — they default to
 * the same values the mini-sheet would have prefilled (literal
 * time-trade for swap, midpoint-of-gap for insert) so the staged
 * state matches what the dispatcher would have seen.
 */
export type PlannedMove =
  | {
      kind: "swap";
      aStopId: number;
      bStopId: number;
      aNewStartHHMM: string;
      bNewStartHHMM: string;
      aWindow: TimeWindow;
      bWindow: TimeWindow;
      aDurationMinutes: number;
      bDurationMinutes: number;
      /**
       * B2-7 (2026-05-22) — dispatcher-set duration overrides from
       * the per-side chevron stepper in `<DragRescheduleSheet>` or
       * `<ReviewPlanSheet>`. When `undefined`, the BE call omits
       * the override and the appointment keeps its existing
       * `scheduled_duration_min`. When set, the value passes to
       * the BE as `aNewDurationMin` / `bNewDurationMin` (1..480
       * integer minutes, validated FE-side via the stepper's
       * clamp; BE also validates and rejects out-of-range as
       * `bad_input`). End-time math in `applyPlannedMoves` reads
       * `override ?? base` so the polyline + chip bar reflect the
       * stretched/shrunk duration immediately.
       *
       * The base `aDurationMinutes` / `bDurationMinutes` stays
       * pinned at the original duration so the sheet's "X min →
       * Y min" dirty hint has a fixed reference point. The
       * commit closure spreads only the override into the
       * mutation input — never the base — so a row with no
       * dispatcher edit produces the byte-identical legacy
       * payload it would have without B2-7.
       */
      aDurationOverrideMin?: number;
      bDurationOverrideMin?: number;
    }
  | {
      kind: "insert";
      stopId: number;
      newStopOrder: number;
      newStartHHMM: string;
      window: TimeWindow;
      durationMinutes: number;
      /**
       * B2-7 (2026-05-22) — see swap variant above. Maps 1:1 to
       * the BE's `newDurationMin` on the reposition endpoint.
       * Undefined for legacy / un-edited rows so the wire body
       * stays minimal.
       */
      durationOverrideMin?: number;
    };

/**
 * B2-7 (2026-05-22) — Effective duration for one side of a move
 * (or the only side of an insert). Returns the override when set,
 * the base duration otherwise. The single tiny helper avoids
 * `(a.override ?? a.base)` repeated at every call site (math,
 * tests, commit closure, optimistic patches) and gives the
 * "override or base" rule one greppable name.
 */
export function effectiveDurationForSwapSide(
  move: Extract<PlannedMove, { kind: "swap" }>,
  side: "a" | "b",
): number {
  if (side === "a") {
    return move.aDurationOverrideMin ?? move.aDurationMinutes;
  }
  return move.bDurationOverrideMin ?? move.bDurationMinutes;
}

export function effectiveDurationForInsert(
  move: Extract<PlannedMove, { kind: "insert" }>,
): number {
  return move.durationOverrideMin ?? move.durationMinutes;
}

/**
 * Return all `stopId`s a planned move touches. Swap touches two,
 * insert touches one. Caller uses the set for the "drop any
 * existing move that overlaps" dedupe rule.
 */
export function planMoveStopIds(move: PlannedMove): Set<number> {
  if (move.kind === "swap") {
    return new Set<number>([move.aStopId, move.bStopId]);
  }
  return new Set<number>([move.stopId]);
}

/**
 * Push `next` onto `existing` while dropping any prior move that
 * references one of `next`'s stops. "Last move per stop wins."
 *
 * Dedupe is per-stop, NOT per-kind: a stop that was previously
 * staged in a swap but is now part of an insert (or vice versa)
 * loses its prior entry. Without that rule, the commit pipeline
 * would either fire both mutations against the same stop (BE
 * race) or have to invent a merge semantic at commit time. Drop-
 * on-stage is the simpler model and matches the plan doc's
 * "collapse to final position" requirement.
 *
 * Pure function — returns a new array, never mutates `existing`.
 */
export function dedupePlannedMoves(
  existing: readonly PlannedMove[],
  next: PlannedMove,
): PlannedMove[] {
  const touchedIds = planMoveStopIds(next);
  const filtered = existing.filter((m) => {
    if (m.kind === "swap") {
      return !touchedIds.has(m.aStopId) && !touchedIds.has(m.bStopId);
    }
    return !touchedIds.has(m.stopId);
  });
  return [...filtered, next];
}

/**
 * Stricter `MapStop` subset this module touches. The full type
 * lives in `@technician/types/api`; the subset documents what callers
 * (and tests) actually need to fill in.
 */
type PlannedMoveTarget = Pick<
  MapStop,
  "stopId" | "stopOrder" | "scheduledTime" | "scheduledEndTime"
>;

/**
 * Replay `moves` against `stops` and return the resulting array as
 * it would look after the plan commits.
 *
 * Inputs:
 *   - `stops` — canonical stops, already sorted by `stopOrder`
 *     ascending. Caller is expected to have pre-sorted (the
 *     franchise map already does this for its chip-bar derive).
 *   - `moves` — staged plan in the order they were dropped. Order
 *     matters: each move is applied against the state produced by
 *     the previous one.
 *
 * Output:
 *   - A new array with the same elements but in the post-plan
 *     order. Each touched stop has its `stopOrder` rewritten to
 *     `index + 1` (1-indexed) and its `scheduledTime` /
 *     `scheduledEndTime` updated to the move's proposed times.
 *     Stale moves (referencing a stop that's no longer in the
 *     array) are silently skipped — the BE will reject them on
 *     commit anyway, and the review sheet (B2-4) will flag them.
 *
 * Why "splice + reindex" instead of "rewrite stopOrder in place":
 *   - Insert needs to shift sibling `stopOrder`s anyway (the BE
 *     reposition endpoint does exactly this). Splicing the array
 *     and re-deriving `stopOrder` as `index + 1` is the same
 *     observable result with much simpler code.
 *   - Swap could be a pure two-field exchange, but doing it
 *     through the same splice+reindex pipeline keeps the function
 *     uniform and lets us reason about the output from a single
 *     invariant ("the returned array IS the post-plan order").
 *
 * Pure function — never mutates `stops` or `moves`.
 */
export function applyPlannedMoves<T extends PlannedMoveTarget>(
  stops: readonly T[],
  moves: readonly PlannedMove[],
): T[] {
  let working: T[] = [...stops];

  for (const move of moves) {
    if (move.kind === "swap") {
      const aIdx = working.findIndex((s) => s.stopId === move.aStopId);
      const bIdx = working.findIndex((s) => s.stopId === move.bStopId);
      if (aIdx === -1 || bIdx === -1) continue;
      const a = working[aIdx];
      const b = working[bIdx];
      // The two stops trade positions in the ordered list; each
      // also takes on the other's new proposed time (which by
      // default is the other's pre-swap time — the literal
      // time-trade the mini-sheet would have done).
      // B2-7 (2026-05-22) — end-time math uses the per-side
      // effective duration (override || base) so a dispatcher
      // who stretched B from 30→45 min sees the polyline +
      // chip-bar render with the new length immediately, before
      // the commit lands.
      working[aIdx] = {
        ...b,
        scheduledTime: move.bNewStartHHMM,
        scheduledEndTime: addDurationToHHMM(
          move.bNewStartHHMM,
          effectiveDurationForSwapSide(move, "b"),
        ),
      };
      working[bIdx] = {
        ...a,
        scheduledTime: move.aNewStartHHMM,
        scheduledEndTime: addDurationToHHMM(
          move.aNewStartHHMM,
          effectiveDurationForSwapSide(move, "a"),
        ),
      };
    } else {
      const currentIdx = working.findIndex((s) => s.stopId === move.stopId);
      if (currentIdx === -1) continue;
      const stop = working[currentIdx];
      // Remove from current position, then insert at the staged
      // `newStopOrder` (1-indexed) clamped to the array bounds.
      // The BE's reposition endpoint uses the same semantics:
      // newStopOrder is the position the stop SHOULD HAVE AFTER
      // siblings have shifted to make room.
      working.splice(currentIdx, 1);
      const targetIdx = Math.max(
        0,
        Math.min(working.length, move.newStopOrder - 1),
      );
      // B2-7 (2026-05-22) — see swap branch above; insert
      // uses its own override-aware helper.
      working.splice(targetIdx, 0, {
        ...stop,
        scheduledTime: move.newStartHHMM,
        scheduledEndTime: addDurationToHHMM(
          move.newStartHHMM,
          effectiveDurationForInsert(move),
        ),
      });
    }
  }

  // Re-derive stopOrder as index + 1 so the returned array
  // satisfies the "sorted by stopOrder ascending" invariant the
  // map renderer and chip bar both rely on.
  return working.map((s, i) => ({ ...s, stopOrder: i + 1 }));
}
