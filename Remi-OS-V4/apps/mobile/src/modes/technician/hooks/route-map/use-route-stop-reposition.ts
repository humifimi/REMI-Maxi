/**
 * PLAN-DEVIATION: 2026-05-21-chip-bar-snap-mini-sheet — Phase 5 was
 * specced with Option 5a (extend `useRescheduleAppointment`) and
 * Option 5b (new endpoint) as alternatives. We shipped Option 5b; this
 * hook is the FE side of the new endpoint. See
 * docs/PLAN-DEVIATIONS.md#2026-05-21-chip-bar-snap-mini-sheet.
 *
 * `useRouteStopReposition` (chip-bar snap-zone rescheduler Phase 6,
 * 2026-05-22) — TanStack Query mutation hook that wraps the BE
 * single-stop reposition endpoint shipped in Phase 5:
 *
 *   PATCH /api/v1/franchise/routes/:routeId/stops/:stopId/reposition
 *
 * Atomically (a) updates ONE stop's `route_stops.stop_order` to a
 * new position, (b) writes the underlying appointment's
 * `scheduled_time` + derived `scheduled_end_time` to a dispatcher-
 * picked start, and (c) shifts every OTHER stop whose `stop_order`
 * falls between the old and new positions by ±1 to keep the route
 * sequence contiguous. Powers the chip-bar INSERT zone gesture —
 * dropping chip A between chips X and Y opens `<DragRescheduleSheet>`
 * in insert mode and a save from that sheet calls this mutation.
 *
 * Sibling to `useRouteStopSwap` (pairwise swap, Phase 3/4). Each FE
 * mutation maps 1:1 to a distinct BE primitive + audit event type so
 * postmortems can attribute a route-write back to the originating
 * chip-bar gesture.
 *
 * Snap-zone Phase 7h (2026-05-22) — the legacy `useRouteStopReorder`
 * (array-style reorder, originally LDM-WAVE-2 CHUNK-3's pin-drag
 * pathway) has been removed; this hook + `useRouteStopSwap` are the
 * only chip-bar mutations now.
 *
 * Optimistic update: on `mutate`, we patch the franchise route map
 * query cache so the polyline + chip-bar redraw immediately with
 * the new ordering and time. The cache patch mirrors what the BE
 * will write — the target stop gets the picked time + new
 * stopOrder, and every other stop whose stop_order falls inside
 * the shift range bumps ±1. On error we restore the snapshot; on
 * success we DO NOT broad-invalidate the map (same render-storm
 * concern that `useRouteStopSwap` documented in r15.5 — the
 * optimistic patch is already correct; the natural refetchInterval
 * reconciles with the BE).
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { franchiseApi } from "@technician/api/client";
import { addDurationToHHMM } from "@technician/components/route/drag-reschedule-sheet";
import type { FranchiseRouteMapData, RouteWithStops } from "@technician/types/api";
import { traceMap } from "@technician/utils/sentry-map-diagnostics";

export interface UseRouteStopRepositionInput {
  route_id: number;
  /** The stop the dispatcher is moving. */
  stopId: number;
  /**
   * 1-indexed new `stop_order`. Must be in `[1, count(stops on
   * route)]`; the BE returns 400 with "out of range" if not. The
   * chip bar derives this from the DFL `to` index by simulating
   * the insertion on `pendingOrder` and reading the resulting
   * position.
   */
  newStopOrder: number;
  /**
   * Dispatcher-picked new start time. `HH:MM` or `HH:MM:SS`. The
   * BE normalizes to `HH:MM:SS` and derives end time via
   * `computeNewEndTime` (preserves the target's own
   * `scheduled_duration_min`, falls back to the pre-write
   * end-start interval). End time is NOT passed by the caller.
   */
  newStartTime: string;
  /**
   * Dispatcher's "notify customer of new time" intent. Default
   * `false` (matches the chip-bar today). When `true`, the BE
   * enqueues a reschedule notification post-commit honoring the
   * appointment's stored `notification_preference` (customer
   * `"none"` opt-out wins).
   */
  notifyCustomer?: boolean;
  /**
   * B2-7 (2026-05-22) — dispatcher-set duration override (in
   * minutes). Integer in `[1, 480]`. When omitted (the legacy
   * case), the BE leaves the target appointment's
   * `scheduled_duration_min` untouched and derives the new end
   * time from the stored duration. When set, the BE writes the
   * new duration AND derives end time as `newStart + override`.
   *
   * Source: chevron stepper in `<DragRescheduleSheet>` (one-shot
   * drop) or `<ReviewPlanSheet>` (plan-mode batch).
   */
  newDurationMin?: number;
  /**
   * 2026-05-25 — Plan Mode batch hint. See `UseRouteStopSwapInput.__batchMode`
   * for the full rationale. When true, success skips the
   * franchise-route-map invalidate + delayed invalidate so the
   * parent's batch finalizer is the single source of refetch.
   */
  __batchMode?: boolean;
}

export interface RepositionStopResponse {
  /** Refreshed route + stops, typed as `RouteWithStops` at the consumer. */
  route: unknown;
}

/**
 * Build the wire URL for the reposition endpoint. Exported for tests.
 *
 * The `franchiseClient` axios instance is configured with
 * `baseURL: ${API_BASE_URL}${FRANCHISE_API_PREFIX}`
 * (= `/api/v1/franchise`), so the relative path below resolves to
 * `/api/v1/franchise/routes/:routeId/stops/:stopId/reposition`.
 */
export function repositionEndpointUrl(routeId: number, stopId: number): string {
  return `/routes/${routeId}/stops/${stopId}/reposition`;
}

export function useRouteStopReposition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UseRouteStopRepositionInput) => {
      const {
        route_id,
        stopId,
        newStopOrder,
        newStartTime,
        notifyCustomer,
        newDurationMin,
      } = input;
      // Forward optional fields only when explicitly set so the
      // wire body stays minimal in the default (no-notify, no-
      // duration-override) case and the audit row's defaults
      // are the BE's own rather than FE-asserted ones.
      const body: {
        newStopOrder: number;
        newStartTime: string;
        notifyCustomer?: boolean;
        newDurationMin?: number;
      } = { newStopOrder, newStartTime };
      if (notifyCustomer !== undefined) body.notifyCustomer = notifyCustomer;
      if (newDurationMin !== undefined) body.newDurationMin = newDurationMin;

      const result = await franchiseApi<RepositionStopResponse>(
        "patch",
        repositionEndpointUrl(route_id, stopId),
        body,
      );
      return result.route as RouteWithStops;
    },

    // Optimistic reposition: mirror the BE's shift+write so the
    // chip bar + polyline reflect the new state on the next
    // render. The target stop gets the picked time + newStopOrder;
    // every other stop whose stop_order falls in the shift range
    // bumps ±1. Returns snapshots for onError rollback.
    //
    // We don't recompute scheduledEndTime here — the BE derives it
    // server-side from scheduled_duration_min, and the post-success
    // map refetch (next 30s tick) will pick up the canonical value.
    // For the brief optimistic window the tooltip's "to" field may
    // show a stale end; that's preferable to duplicating the
    // duration-preservation ladder on the FE where a divergence
    // would silently mislead users.
    onMutate: async ({
      route_id,
      stopId,
      newStopOrder,
      newStartTime,
      newDurationMin,
    }) => {
      traceMap("route_reposition_mutate", {
        route_id,
        stopId,
        newStopOrder,
        durationOverridden: newDurationMin != null,
      });
      await queryClient.cancelQueries({ queryKey: ["franchise-route-map"] });

      const snapshots = queryClient.getQueriesData<FranchiseRouteMapData>({
        queryKey: ["franchise-route-map"],
      });

      // B2-7 (2026-05-22) — when a duration override is provided,
      // we know the new end time deterministically; compute it
      // once here so both the same-position and shifted-position
      // branches below can splice it into the optimistic patch.
      // When omitted, leave scheduledEndTime out of the patch
      // (legacy behavior — natural 30s refetch reconciles).
      const optimisticEndTime =
        newDurationMin != null
          ? addDurationToHHMM(newStartTime, newDurationMin)
          : undefined;

      queryClient.setQueriesData<FranchiseRouteMapData>(
        { queryKey: ["franchise-route-map"] },
        (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            routes: prev.routes.map((r) => {
              if (r.routeId !== route_id) return r;
              const target = r.stops.find((s) => s.stopId === stopId);
              if (!target) return r;
              const oldOrder = target.stopOrder;
              if (oldOrder === newStopOrder) {
                // Same-position case: only the target's time
                // changes; no shift.
                return {
                  ...r,
                  stops: r.stops.map((s) =>
                    s.stopId === stopId
                      ? {
                          ...s,
                          scheduledTime: newStartTime,
                          ...(optimisticEndTime !== undefined
                            ? { scheduledEndTime: optimisticEndTime }
                            : {}),
                        }
                      : s,
                  ),
                };
              }
              const movingDown = oldOrder < newStopOrder;
              return {
                ...r,
                stops: r.stops.map((s) => {
                  if (s.stopId === stopId) {
                    return {
                      ...s,
                      stopOrder: newStopOrder,
                      scheduledTime: newStartTime,
                      ...(optimisticEndTime !== undefined
                        ? { scheduledEndTime: optimisticEndTime }
                        : {}),
                    };
                  }
                  // Other stops shift inside the affected range.
                  // DOWN move (oldOrder < newOrder): rows in
                  // (oldOrder, newOrder] decrement by 1.
                  // UP move (oldOrder > newOrder): rows in
                  // [newOrder, oldOrder) increment by 1.
                  if (
                    movingDown &&
                    s.stopOrder > oldOrder &&
                    s.stopOrder <= newStopOrder
                  ) {
                    return { ...s, stopOrder: s.stopOrder - 1 };
                  }
                  if (
                    !movingDown &&
                    s.stopOrder >= newStopOrder &&
                    s.stopOrder < oldOrder
                  ) {
                    return { ...s, stopOrder: s.stopOrder + 1 };
                  }
                  return s;
                }),
              };
            }),
          };
        },
      );

      return { snapshots };
    },

    // r15.5 (2026-05-21) — DO NOT invalidate ["franchise-route-map"]
    // on success. The optimistic patch above already mirrors the BE
    // write; a broad invalidate triggers MapView render storms (see
    // `useRouteStopSwap` for the full rationale). Keep
    // `dispatch-overview` invalidation so the calendar/dispatch
    // surfaces see the new time immediately.
    onSuccess: (_data, input) => {
      traceMap("route_reposition_success", {
        route_id: input.route_id,
        stopId: input.stopId,
        newStopOrder: input.newStopOrder,
        batchMode: input.__batchMode === true,
      });
      queryClient.invalidateQueries({ queryKey: ["dispatch-overview"] });
      if (input.__batchMode === true) return;
      queryClient.invalidateQueries({ queryKey: ["franchise-route-map"] });
      // Delayed second invalidate picks up real polylines after
      // the BE's fire-and-forget Google Routes call finishes.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["franchise-route-map"] });
      }, 2500);
    },

    onError: (err, input, context) => {
      traceMap("route_reposition_error", {
        route_id: input.route_id,
        stopId: input.stopId,
        newStopOrder: input.newStopOrder,
        message: String(err).slice(0, 200),
      });
      if (context?.snapshots) {
        for (const [key, data] of context.snapshots) {
          queryClient.setQueryData(key, data);
        }
      }
      // On error we DO want a refetch — the optimistic patch is
      // now known-wrong and we need the BE's truth back in the
      // cache.
      queryClient.invalidateQueries({ queryKey: ["franchise-route-map"] });
    },
  });
}
