/**
 * Sentry diagnostics for the franchise route map's interactive
 * surfaces (CHUNK-4 menu / picker + the menu-driven reassign mutation).
 * Mirrors the shape of `sentry-diagnostics.ts` for the calendar drag
 * pipeline — structured breadcrumbs + captureMessage with greppable
 * tags.
 *
 * The set of observable transitions left on the map after Snap-zone
 * Phase 7h (2026-05-22, follow-up):
 *
 *   - marker_tap                 single-tap on a pin → menu opens
 *   - reassign_mutation_fired    PUT reassign request kicked off (from
 *                                the menu picker)
 *   - reassign_mutation_settled  success/error from BE
 *   - menu_state_changed         <MarkerContextMenuSheet> open/close
 *   - picker_state_changed       <MarkerReassignPickerSheet> open/close
 *
 * Each transition fires a breadcrumb (cheap). Major decision points
 * AND failures also fire a captureMessage.
 *
 * Snap-zone Phase 7h (2026-05-22, follow-up) — pin dragging is fully
 * off, so the entire drag-side surface here (`marker_drag_start`,
 * `marker_drag_end`, `drop_classified`, `reorder_mutation_*`,
 * `reassign_confirm_opened`, `captureDropClassified`,
 * `DropClassificationKind`, `MutationContext.surface: "route-reorder"`)
 * was removed. The chip-bar snap-zone owns same-route reorders end-to-
 * end; cross-tech reassign is only menu-driven now and reuses the
 * `marker-drop-reassign` surface label for back-compat with existing
 * Sentry saved searches even though no actual drop happens. See
 * docs/PLAN-DEVIATIONS.md#2026-05-22-snap-zone-replaces-pin-drag.
 *
 * History: added 2026-05-17 during the CHUNK-4 smoke-test debug
 * session that motivated the `troubleshoot-with-runtime-data.mdc`
 * rule. Before this helper, the entire route-map flow was silent —
 * no breadcrumbs, no captured events, no way to tell from Sentry
 * whether a tap event fired, the dispatcher classified, or the
 * mutation completed.
 */

import * as Sentry from "@sentry/react-native";

/**
 * Category attached to every breadcrumb from this module so Sentry's
 * issue page can filter the route-map trail out from network /
 * navigation / console noise.
 */
const CATEGORY = "route-map";

/**
 * Fire-and-forget breadcrumb for any route-map state transition.
 * Rides along with the next captured event in the session (or with
 * the session replay timeline). Cheap; safe to call from worklets +
 * gesture handlers.
 */
export function traceMap(
  message: string,
  data?: Record<string, unknown>,
  level: Sentry.SeverityLevel = "info",
): void {
  Sentry.addBreadcrumb({
    category: CATEGORY,
    message,
    level,
    data,
  });
  // 2026-05-21 (r16.1) — mirror to console in dev so Metro shows
  // chip-bar / commit-chain events alongside Sentry breadcrumbs.
  // Production builds skip this (no console payloads, no perf hit).
  if (__DEV__) {
    const prefix = `[map] ${message}`;
    if (level === "error") {
      console.warn(prefix, data ?? "");
    } else {
      console.log(prefix, data ?? "");
    }
  }
}

// Snap-zone Phase 7h (2026-05-22, follow-up) — `DropClassificationKind`,
// `DropClassificationContext`, and `captureDropClassified` were
// removed. They existed to classify a pin-drag drop (`reorder` vs
// `reassign` vs `no-op`), which doesn't happen anymore — pin
// dragging is fully off. Historical Sentry events tagged
// `route_map.classification:*` remain searchable; this module no
// longer emits new ones.

export interface MutationContext {
  // Snap-zone Phase 7h (2026-05-22) — `"route-reorder"` was removed.
  // The marker-pin → bulk-reorder pathway is retired; the only mutation
  // surfaces left on the map are reassigns (cross-tech) and the chip-
  // bar snap-zone mutations (which use their own breadcrumb names).
  surface: "marker-drop-reassign" | "menu-reassign";
  draggedAppointmentId: number;
  fromTechnicianId: number;
  toTechnicianId: number | null;
  routeId?: number | null;
  /** "success" | "error" — outcome of the mutation. */
  outcome: "success" | "error";
  /** HTTP status code, if known. */
  status?: number | null;
  /** Short error message, if outcome === error. */
  errorMessage?: string | null;
  /** Elapsed milliseconds from mutation start to settle. */
  elapsedMs?: number | null;
}

/**
 * Capture mutation settlement as a searchable Sentry event. Pair
 * with breadcrumb `traceMap("reorder_mutation_fired", ...)` /
 * `traceMap("reassign_mutation_fired", ...)` at fire time so the
 * trail leading up to settle is intact.
 *
 * Level escalates: info on success, error on failure.
 */
export function captureMutationOutcome(ctx: MutationContext): void {
  Sentry.withScope((scope) => {
    scope.setLevel(ctx.outcome === "success" ? "info" : "error");
    scope.setTag("route_map.surface", ctx.surface);
    scope.setTag("route_map.mutation_outcome", ctx.outcome);
    scope.setTag(
      "route_map.from_technician_id",
      String(ctx.fromTechnicianId),
    );
    if (ctx.toTechnicianId != null) {
      scope.setTag("route_map.to_technician_id", String(ctx.toTechnicianId));
    }
    if (ctx.routeId != null) {
      scope.setTag("route_map.route_id", String(ctx.routeId));
    }
    if (ctx.status != null) {
      scope.setTag("route_map.http_status", String(ctx.status));
    }
    scope.setExtras({
      draggedAppointmentId: ctx.draggedAppointmentId,
      errorMessage: ctx.errorMessage ?? null,
      elapsedMs: ctx.elapsedMs ?? null,
    });
    Sentry.captureMessage(
      `route_map:${ctx.surface}:${ctx.outcome}`,
      ctx.outcome === "success" ? "info" : "error",
    );
  });
}

/**
 * Lightweight wrapper for marker-level taps.
 *
 * Snap-zone Phase 7h (2026-05-22, follow-up) — the kinds union used
 * to include `callout_actions_tap`, `drag_start`, and `drag_end`. The
 * Callout layer was deleted (PLAN-DEVIATION
 * 2026-05-17-drop-callout-for-tap-to-menu); pin dragging was deleted
 * (PLAN-DEVIATION 2026-05-22-snap-zone-replaces-pin-drag). Only the
 * single-tap surface is left.
 */
export type MarkerGestureKind = "tap";

export interface MarkerGestureContext {
  kind: MarkerGestureKind;
  appointmentId: number;
  routeId: number;
  technicianId: number;
}

export function traceMarkerGesture(ctx: MarkerGestureContext): void {
  traceMap(`marker_${ctx.kind}`, {
    appointmentId: ctx.appointmentId,
    routeId: ctx.routeId,
    technicianId: ctx.technicianId,
  });
}

/**
 * Mount-time heartbeat — fires a Sentry event the moment
 * `<FranchiseRouteMap>` renders for the first time in a session.
 * Pure deployment verification: when this event shows up in Sentry,
 * we know the instrumented JS bundle is running on the device. When
 * it does NOT show up after a user reports opening the map, the OTA
 * either didn't apply or was overridden by a stale cached bundle.
 *
 * Carries a build-fingerprint tag (commit short SHA via __DEV__ or a
 * static stamp) so a future agent can confirm WHICH instrumented
 * build the event came from.
 */
export function captureMapBootHeartbeat(buildStamp: string): void {
  Sentry.withScope((scope) => {
    scope.setLevel("info");
    scope.setTag("route_map.heartbeat", "mount");
    scope.setTag("route_map.build_stamp", buildStamp);
    Sentry.captureMessage(
      `route_map:heartbeat:mount (${buildStamp})`,
      "info",
    );
  });
}
