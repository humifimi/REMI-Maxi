/**
 * PLAN-DEVIATION: 2026-05-21-chip-bar-snap-mini-sheet — Phase 3
 * extended `swapStops` to accept two explicit times (one per side) +
 * a notify-customer flag, replacing the pre-existing auto-trade
 * shape. This hook is the FE-side caller of that extended contract.
 * See docs/PLAN-DEVIATIONS.md#2026-05-21-chip-bar-snap-mini-sheet.
 *
 * `useRouteStopSwap` (map-based reschedule, 2026-05-20 chunk 1 BE + chunk 4 FE)
 * — TanStack Query mutation hook that wraps the franchise route
 * pairwise stop-swap endpoint:
 *
 *   POST /api/v1/franchise/routes/:routeId/stops/swap
 *
 * Atomically exchanges `route_stops.stop_order` AND
 * `appointments.scheduled_time` for two named stops on the same route.
 * Used by the chip bar's drag-to-swap gesture: drop chip A onto chip
 * B → they trade positions and times.
 *
 * The endpoint body is `{ aStopId, bStopId }`. Naming is commutative —
 * the BE doesn't treat A and B asymmetrically (it just swaps the two)
 * and the audit log labels them "before/after" purely for human
 * readability. We pass `from` (the chip the user picked up) as
 * `aStopId` and `to` (the chip they dropped on) as `bStopId` because
 * that order reads naturally in the Sentry breadcrumbs.
 *
 * Optimistic update: on `mutate`, we patch the franchise route map
 * query cache so the polyline redraws immediately with the swapped
 * positions. On error we restore the snapshot; on success we
 * invalidate so the BE's canonical post-swap state takes over.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { franchiseApi } from "@technician/api/client";
import { addDurationToHHMM } from "@technician/components/route/drag-reschedule-sheet";
import type { FranchiseRouteMapData, RouteWithStops } from "@technician/types/api";
import { traceMap } from "@technician/utils/sentry-map-diagnostics";

export interface UseRouteStopSwapInput {
  route_id: number;
  /** First stop to swap. By convention, the picked-up chip. */
  aStopId: number;
  /** Second stop to swap. By convention, the dropped-on chip. */
  bStopId: number;
  /**
   * Phase 4 (2026-05-21) — dispatcher-picked explicit start times
   * from `<DragRescheduleSheet>`. Wire format is `HH:MM` or
   * `HH:MM:SS` (BE normalizes). Both must be provided together or
   * both omitted — BE rejects mixed mode with 400.
   *
   * When omitted (legacy chip-bar commit chain), the BE's
   * auto-trade behavior runs (each side inherits the other's
   * pre-swap start). The optimistic onMutate patch below also
   * picks the auto-trade times so the cache reflects the BE's
   * behavior; when explicit times are provided, the patch picks
   * the explicit times instead so chip-bar tooltips show the
   * new times immediately without waiting for the natural
   * refetch interval.
   */
  aNewTime?: string;
  bNewTime?: string;
  /**
   * Phase 4 (2026-05-21) — dispatcher's "notify customer of new
   * time" intent. Default `false` keeps the chip-bar commit chain
   * silent (matches today's behavior). Per-appointment opt-out
   * (`notification_preference: "none"`) is honored at the BE's
   * debounce-service layer regardless.
   */
  notifyCustomer?: boolean;
  /**
   * B2-7 (2026-05-22) — dispatcher-set per-side duration override
   * (in minutes). Integer in `[1, 480]`. When omitted (the legacy
   * case), the BE leaves each appointment's `scheduled_duration_min`
   * untouched and derives the new end time from the stored
   * duration. When set, the BE writes the new duration AND derives
   * end time as `newStart + override`. Each side is independently
   * overridable — provide one, both, or neither.
   *
   * Source: per-side chevron stepper in `<DragRescheduleSheet>`
   * (one-shot drop) or `<ReviewPlanSheet>` (plan-mode batch).
   */
  aNewDurationMin?: number;
  bNewDurationMin?: number;
  /**
   * 2026-05-25 — Plan Mode batch hint. When true, the success
   * handler skips the franchise-route-map invalidate + the
   * delayed second invalidate, leaving the cache churn to the
   * parent's batch finalizer (one big invalidate + one delayed
   * invalidate AFTER all moves commit). Saves N × refetch
   * round-trips during a Plan Mode commit; the optimistic
   * patches already paint each step so the user sees live
   * progress without the network thrash.
   *
   * Default `false` — non-batched callers (chip-bar one-shot
   * drag) keep the existing per-call invalidate + delayed
   * invalidate pair so a single swap still reconciles in <3s.
   */
  __batchMode?: boolean;
}

export interface SwapStopsResponse {
  /** Refreshed route + stops (typed as `RouteWithStops` at the consumer). */
  route: unknown;
}

/**
 * Build the wire URL for the swap endpoint. Exported for tests.
 *
 * The `franchiseClient` axios instance is configured with
 * `baseURL: ${API_BASE_URL}${FRANCHISE_API_PREFIX}` (= `/api/v1/franchise`),
 * so the relative path below resolves to
 * `/api/v1/franchise/routes/:routeId/stops/swap`.
 */
export function swapEndpointUrl(routeId: number): string {
  return `/routes/${routeId}/stops/swap`;
}

export function useRouteStopSwap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UseRouteStopSwapInput) => {
      const {
        route_id,
        aStopId,
        bStopId,
        aNewTime,
        bNewTime,
        notifyCustomer,
        aNewDurationMin,
        bNewDurationMin,
      } = input;
      // Forward Phase-4 / B2-7 fields only when present so the
      // legacy commit-chain payload stays minimal and the BE's
      // "both provided or both omitted" gate (for times) is
      // honored by construction. Duration overrides are
      // independently optional — provide one side, both, or
      // neither.
      const body: {
        aStopId: number;
        bStopId: number;
        aNewTime?: string;
        bNewTime?: string;
        notifyCustomer?: boolean;
        aNewDurationMin?: number;
        bNewDurationMin?: number;
      } = { aStopId, bStopId };
      if (aNewTime !== undefined) body.aNewTime = aNewTime;
      if (bNewTime !== undefined) body.bNewTime = bNewTime;
      if (notifyCustomer !== undefined) body.notifyCustomer = notifyCustomer;
      if (aNewDurationMin !== undefined) body.aNewDurationMin = aNewDurationMin;
      if (bNewDurationMin !== undefined) body.bNewDurationMin = bNewDurationMin;
      const result = await franchiseApi<SwapStopsResponse>(
        "post",
        swapEndpointUrl(route_id),
        body,
      );
      return result.route as RouteWithStops;
    },

    // Optimistic swap: trade the two stops' stopOrder values so the
    // polyline redraws on the next render without waiting for BE +
    // refetch. We also swap scheduledTime so the marker labels +
    // chip tooltip times stay consistent during the in-flight
    // mutation. Returns snapshots for onError rollback.
    //
    // Phase 4 (2026-05-21) — when explicit times are provided, the
    // optimistic patch uses THOSE times instead of the auto-trade
    // values. Otherwise the optimistic state would render the auto-
    // trade times for a brief window before the BE responds, then
    // jump to the user's picked times — a visible flash. Pre-Phase-4
    // callers (no times in payload) get the original auto-trade
    // optimistic patch.
    onMutate: async ({
      route_id,
      aStopId,
      bStopId,
      aNewTime,
      bNewTime,
      aNewDurationMin,
      bNewDurationMin,
    }) => {
      traceMap("route_swap_mutate", {
        route_id,
        aStopId,
        bStopId,
        explicitTimes: aNewTime != null && bNewTime != null,
        durationOverridden:
          aNewDurationMin != null || bNewDurationMin != null,
      });
      await queryClient.cancelQueries({ queryKey: ["franchise-route-map"] });

      const snapshots = queryClient.getQueriesData<FranchiseRouteMapData>({
        queryKey: ["franchise-route-map"],
      });

      queryClient.setQueriesData<FranchiseRouteMapData>(
        { queryKey: ["franchise-route-map"] },
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            routes: prev.routes.map((r) => {
              if (r.routeId !== route_id) return r;
              const a = r.stops.find((s) => s.stopId === aStopId);
              const b = r.stops.find((s) => s.stopId === bStopId);
              if (!a || !b) return r;
              const aOptimisticTime = aNewTime ?? b.scheduledTime;
              const bOptimisticTime = bNewTime ?? a.scheduledTime;
              // B2-7 (2026-05-22) — when a duration override is
              // provided, also patch the optimistic
              // `scheduledEndTime` so the chip-bar tooltip /
              // polyline don't briefly render the prior
              // duration's end before the BE's natural refetch
              // interval reconciles. The pre-B2-7 base behavior
              // of "leave scheduledEndTime to the natural
              // refetch" stays the default for un-overridden
              // sides — `aNewDurationMin === undefined` means
              // we have no signal about the new duration to
              // optimistically compute against.
              const aOptimisticEnd =
                aNewDurationMin != null && aOptimisticTime != null
                  ? addDurationToHHMM(aOptimisticTime, aNewDurationMin)
                  : undefined;
              const bOptimisticEnd =
                bNewDurationMin != null && bOptimisticTime != null
                  ? addDurationToHHMM(bOptimisticTime, bNewDurationMin)
                  : undefined;
              // 2026-05-25 — Clear `encodedPolyline` and
              // `driveTimeFromPreviousMin` on BOTH swapped stops
              // AND on the neighbors immediately after them in
              // the new order. The leg's geometry is keyed on
              // (prev, this) — a swap changes BOTH endpoints of
              // up to four legs (the one ending at A, the one
              // ending at B, and the legs ending at whatever
              // stops sit right after A or B in the new order).
              // Leaving stale polyline values on those stops
              // makes the map render the OLD leg shape under the
              // NEW marker positions until the BE polyline
              // refresh + refetch lands. Clearing forces the
              // straight-line fallback for the brief in-flight
              // window — cleaner than misaligned ghost legs.
              const newStopOrderOf = (stopId: number, fallback: number) => {
                if (stopId === aStopId) return b.stopOrder;
                if (stopId === bStopId) return a.stopOrder;
                return fallback;
              };
              // Compute which stops sit right AFTER A and B in
              // the new ordering — they're the destinations of
              // the legs that changed origin.
              const sortedAfterSwap = [...r.stops]
                .map((s) => ({
                  s,
                  order: newStopOrderOf(s.stopId, s.stopOrder),
                }))
                .sort((x, y) => x.order - y.order);
              const idxA = sortedAfterSwap.findIndex(
                (x) => x.s.stopId === aStopId,
              );
              const idxB = sortedAfterSwap.findIndex(
                (x) => x.s.stopId === bStopId,
              );
              const stopAfterA =
                idxA >= 0 && idxA + 1 < sortedAfterSwap.length
                  ? sortedAfterSwap[idxA + 1].s.stopId
                  : null;
              const stopAfterB =
                idxB >= 0 && idxB + 1 < sortedAfterSwap.length
                  ? sortedAfterSwap[idxB + 1].s.stopId
                  : null;
              const stopsWithStaleLegs = new Set<number>(
                [aStopId, bStopId, stopAfterA, stopAfterB].filter(
                  (id): id is number => id != null,
                ),
              );
              return {
                ...r,
                stops: r.stops.map((s) => {
                  const clearStaleLeg = stopsWithStaleLegs.has(s.stopId)
                    ? {
                        encodedPolyline: null,
                        driveTimeFromPreviousMin: null,
                      }
                    : {};
                  if (s.stopId === aStopId) {
                    return {
                      ...s,
                      stopOrder: b.stopOrder,
                      scheduledTime: aOptimisticTime,
                      ...(aOptimisticEnd !== undefined
                        ? { scheduledEndTime: aOptimisticEnd }
                        : {}),
                      ...clearStaleLeg,
                    };
                  }
                  if (s.stopId === bStopId) {
                    return {
                      ...s,
                      stopOrder: a.stopOrder,
                      scheduledTime: bOptimisticTime,
                      ...(bOptimisticEnd !== undefined
                        ? { scheduledEndTime: bOptimisticEnd }
                        : {}),
                      ...clearStaleLeg,
                    };
                  }
                  return { ...s, ...clearStaleLeg };
                }),
              };
            }),
          };
        },
      );

      return { snapshots };
    },

    // 2026-05-25 — Re-enable franchise-route-map invalidation on
    // success. The earlier r15.5 comment cited a render-storm
    // concern from rapid-swap activity, but the field-test smoke
    // test surfaced a concrete failure that the no-invalidate path
    // could NOT recover from for up to 30 seconds: when the
    // optimistic patch desyncs from the BE's authoritative
    // post-swap state (rare, but reproducible — e.g. an
    // intermediate stop got renumbered server-side via my new
    // time-ordered renumber pass), the map renders duplicate
    // stop_order labels ("two #6 markers") until the natural
    // refetch interval fires.
    //
    // Trade-off accepted: brief refetch flash on a single swap is
    // strictly better than "map shows two #6s for 30 seconds".
    // Rapid-swap activity already lands one mutation per drag (the
    // chip bar serializes commits), so the cascading-refetch worst
    // case the prior comment worried about is bounded.
    //
    // Keep `dispatch-overview` invalidation — the calendar / dispatch
    // surfaces NEED to see the swap's scheduledTime change reflected.
    onSuccess: (_data, input) => {
      traceMap("route_swap_success", {
        route_id: input.route_id,
        aStopId: input.aStopId,
        bStopId: input.bStopId,
        batchMode: input.__batchMode === true,
      });
      // Always invalidate dispatch-overview — the calendar /
      // dispatch surfaces NEED to see the swap's scheduledTime
      // change reflected, batch or not.
      queryClient.invalidateQueries({ queryKey: ["dispatch-overview"] });
      // 2026-05-25 — Batch mode (Plan Mode commit pipeline) skips
      // the franchise-route-map invalidates entirely. The parent
      // `handleCommitPlan` fires ONE final invalidate + ONE
      // delayed invalidate after the whole batch commits, which
      // avoids N × refetch round-trips + N × delayed setTimeout
      // pile-up that made Plan Mode commits feel sluggish.
      if (input.__batchMode === true) return;
      queryClient.invalidateQueries({ queryKey: ["franchise-route-map"] });
      // Delayed second invalidate picks up real polylines after
      // the BE's fire-and-forget Google Routes call finishes.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["franchise-route-map"] });
      }, 2500);
    },

    onError: (err, input, context) => {
      traceMap("route_swap_error", {
        route_id: input.route_id,
        aStopId: input.aStopId,
        bStopId: input.bStopId,
        message: String(err).slice(0, 200),
      });
      if (context?.snapshots) {
        for (const [key, data] of context.snapshots) {
          queryClient.setQueryData(key, data);
        }
      }
      // On error we DO want a refetch — the optimistic patch is now
      // known-wrong and we need the BE's truth back in the cache.
      queryClient.invalidateQueries({ queryKey: ["franchise-route-map"] });
    },
  });
}
