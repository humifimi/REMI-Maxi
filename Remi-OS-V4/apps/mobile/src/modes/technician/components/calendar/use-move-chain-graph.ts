/**
 * `useMoveChainGraph` — single shared seam for chain-graph derivation.
 *
 * Used by every consumer of `MoveChainGraph` in the app:
 *
 *   1. `resource-calendar-day-view.tsx` (franchise + tech mounts)
 *   2. `resource-calendar-workweek-view.tsx`
 *   3. `landscape/LandscapeWorkweekView.tsx`
 *   4. `app/pending-reality/review.tsx` — per-card "Chain N" badge.
 *
 * No inline `detectMoveChains` call sites remain — every caller is
 * routed through this hook so the chain ids, global ordinals, and
 * per-step palette colors are byte-identical across the chip row,
 * the calendar overlays, and the review screen for any given
 * `(intents, dayData)` input.
 *
 * History (kept for context — these are the bugs the unification
 * closed, in order):
 *
 *   - 2026-05-08 (a): the day/workweek/landscape views computed the
 *     graph inline via `useMemo(() => detectMoveChains(intents,
 *     dayDataToLinterAppointments(...)))`. The Pending Reality
 *     review screen shipped a per-card "Chain N" badge running its
 *     OWN `detectMoveChains` call against a different appointment
 *     projection (`useIntentDisplayLookup`). The two projections
 *     populated on different cache schedules → same intent set,
 *     different graphs. Fix: extract THIS hook and route both paths
 *     through it.
 *
 *   - 2026-05-08 (b): with both paths on this hook, the chip row
 *     still rendered fewer chains than the review screen because
 *     the day-view mount fed `useFranchiseDayView` (single
 *     `CalendarDayResponse` for `selectedDate`) while the review
 *     screen fed `useFranchiseWeekView` (full `CalendarDayResponse[]`
 *     for the week). When a staged intent's underlying appointment
 *     lived on another day in the same week, the per-day response
 *     dropped its source-slot projection and the detector silently
 *     omitted that intent's chain. Fix: the franchise day-view
 *     mount passes `weekQuery.data` (gated on `hasStagedIntents`)
 *     into the day view's new `weekData` prop, which the day view
 *     forwards to this hook in lieu of `dayData`.
 *
 *   - 2026-05-08 (c): the (b) fix used `weekData ?? dayData` as a
 *     fallback to keep the chip row painting during the transient
 *     `weekQuery.data === undefined` window after staging the
 *     first intent. That fallback re-introduced the same divergence
 *     under a different timing: the chip row painted with the
 *     per-day projection during the loading window, the memoized
 *     `linterAppointments` ref pinned to that projection, and
 *     subsequent staged intents inherited the under-counted graph
 *     until something forced a full input-reference change. Fix:
 *     the day view now passes `weekData` ONLY (no fallback) and
 *     gates the chip row's render on
 *     `weekData != null || localIntents.length === 0`. While the
 *     week query is resolving, the chip row hides; the moment the
 *     query resolves, the chip row paints with the same projection
 *     the review screen consumes. The week is the natural unit of
 *     "what could be in a chain"; feeding the same week window to
 *     every consumer keeps the graphs in lockstep.
 *
 * Inputs:
 *
 *   - `intents` — staged intents (typically
 *     `usePendingRealityStore((s) => s.intents)`).
 *   - `dayData` — a `CalendarDayResponse` or `CalendarDayResponse[]`,
 *     usually fetched via `useFranchiseWeekView` (the only safe
 *     source for chain detection — see history note (c) above for
 *     why the per-day fallback was retired). Tech-side mounts can
 *     pass `undefined`; with no franchise reorganization intents
 *     the caller's intents array is also empty and the hook
 *     short-circuits to `EMPTY_MOVE_CHAIN_GRAPH`. Pass `undefined`
 *     while the query is pending and gate the visible chip row /
 *     ghost overlay on `dayData != null || intents.length === 0`
 *     so the user never sees a transient 1-step-per-intent paint
 *     during the loading window. (`useMoveChainGraph` itself does
 *     NOT short-circuit on `undefined` — it returns the
 *     detector's "no source slots" output, which is one
 *     1-step-seed chain per intent. The visible-render gate is
 *     the consumer's contract, not the hook's.)
 *
 * Output:
 *
 *   - `graph` — the `MoveChainGraph` from `detectMoveChains`. Stable
 *     by reference when neither input changed.
 *   - `linterAppointments` — the same `LinterAppointment[]`
 *     projection the detector consumed. Returned so callers that
 *     need to feed `getVisibleMoveChainDestSlots` or other
 *     overlay helpers don't have to re-project the data.
 */

import { useMemo } from "react";

import type { CalendarDayResponse } from "@technician/types/calendar";
import type { ReorganizationIntent } from "@technician/types/reorganization";
import type { LinterAppointment } from "@technician/utils/logistics-linter";
import {
  EMPTY_MOVE_CHAIN_GRAPH,
  dayDataToLinterAppointments,
  detectMoveChains,
  type MoveChainGraph,
} from "@technician/utils/detect-move-chains";

export interface UseMoveChainGraphResult {
  /** The chain graph for the current (intents, dayData) input. */
  graph: MoveChainGraph;
  /**
   * The `LinterAppointment[]` projection the detector consumed.
   * Re-exported so callers that need it for downstream helpers
   * (`getVisibleMoveChainDestSlots`, ghost injection, etc.) don't
   * recompute the same projection.
   */
  linterAppointments: LinterAppointment[];
}

export function useMoveChainGraph(
  intents: readonly ReorganizationIntent[],
  dayData: CalendarDayResponse | CalendarDayResponse[] | undefined,
): UseMoveChainGraphResult {
  const linterAppointments = useMemo(
    () => dayDataToLinterAppointments(dayData),
    [dayData],
  );
  const graph = useMemo(() => {
    if (intents.length === 0) return EMPTY_MOVE_CHAIN_GRAPH;
    const g = detectMoveChains(intents, linterAppointments);
    // 2026-05-08 follow-up #4 (chip-row staleness diagnostic) —
    // unconditional `__DEV__` log of every detector recompute so
    // the next on-device repro pins down whether the hook is
    // producing the right graph (and whether the consumer is
    // seeing the same one). Ungated by `VERBOSE_CALENDAR_LOGS`
    // because the gate has been masking the diagnostic the user
    // actually needs to capture: prior follow-ups #2 and #3
    // shipped without it and the divergence kept reproducing.
    // Stripped from production bundles via `__DEV__`. The match
    // line in MoveChainChipRow's render-body log (same prefix
    // shape) is what lets the next agent compare the hook's
    // output to the chip row's input on a per-frame basis.
    if (__DEV__) {
      console.log("[DEBUG:useMoveChainGraph] recompute", {
        intentCount: intents.length,
        intentIds: intents.map((i) => i.id),
        apptCount: linterAppointments.length,
        chainCount: g.chains.length,
        chainIds: g.chains.map((c) => c.id),
        ecosystemCount: g.ecosystems.length,
        ecosystemSizes: g.ecosystems.map((e) => e.chainIds.length),
      });
    }
    return g;
  }, [intents, linterAppointments]);
  return { graph, linterAppointments };
}
