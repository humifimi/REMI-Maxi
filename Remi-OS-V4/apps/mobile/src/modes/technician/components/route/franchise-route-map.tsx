import { useMemo, useRef, useEffect, useState, useCallback, type ReactNode } from "react";
// 2026-05-25 — Plan Mode batch finalizer needs a direct
// `queryClient` handle to fire ONE invalidate + ONE delayed
// invalidate after the whole batch commits (instead of the per-
// mutation invalidates the `__batchMode: true` flag now
// suppresses).
import { useQueryClient } from "@tanstack/react-query";
import { StyleSheet, View, Text, Pressable, ScrollView, Alert } from "react-native";
import MapView, {
  Marker,
  Polyline,
  Callout,
  PROVIDER_GOOGLE,
} from "react-native-maps";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Updates from "expo-updates";
import { useFranchiseRouteMap } from "@technician/hooks/operations/use-franchise-map";
import { useRealtimeLocation } from "@technician/hooks/operations/use-realtime";
import { useReassignAppointment } from "@technician/hooks/schedule/use-calendar";
import type { MapRoute, MapStop } from "@technician/types/api";
import { decodePolyline, polylineMidpoint } from "@technician/utils/polyline";
import { useCalendarStore } from "@technician/stores/calendar";
import { TechAvatarChip } from "@/src/components/shared/tech-avatar-chip";
import { colorForTech } from "@technician/utils/color-for-tech";
import { AppointmentMarker } from "@technician/components/route/appointment-marker";
// Snap-zone Phase 7h (2026-05-22, follow-up) — `<MarkerDropConfirmSheet>`
// removed. Pin dragging is entirely off; cross-tech reassign is now
// only reachable via `<MarkerReassignPickerSheet>` (single-tap →
// menu → "Reassign…").
import { MarkerContextMenuSheet } from "@technician/components/route/marker-context-menu-sheet";
import { RouteReorderChipBar } from "@technician/components/route/route-reorder-chip-bar";
import { QuickTimeSheet } from "@technician/components/route/quick-time-sheet";
import {
  DragRescheduleSheet,
  type DragRescheduleSheetMode,
  type DragRescheduleSheetPayload,
  defaultInsertStartHHMM,
} from "@technician/components/route/drag-reschedule-sheet";
import {
  computeInsertWindow,
  computeSwapWindows,
} from "@technician/utils/route-reschedule-windows";
import {
  type PlannedMove,
  applyPlannedMoves,
  dedupePlannedMoves,
} from "@technician/utils/route-plan-moves";
import {
  ReviewPlanSheet,
  type CommitRowStatus,
  type ReviewPlanRow,
} from "@technician/components/route/review-plan-sheet";
import { commitPlanSequentially } from "@technician/utils/route-plan-commit";
import { formatTimeRange12h } from "@technician/utils/format-display";
import {
  MarkerReassignPickerSheet,
  type ReassignPickerCandidate,
} from "@technician/components/route/marker-reassign-picker-sheet";
// Snap-zone Phase 7h (2026-05-22) — `useRouteStopReorder` +
// `computeReorderIds` removed. The marker-pin → bulk-reorder pathway
// (LDM-WAVE-2 CHUNK-3) is retired; same-route reorder lives entirely
// in the chip-bar snap-zone rescheduler now. See
// `docs/implementation-plans/chip-bar-snap-zone-rescheduler-plan.md`
// § Phase 7h for context.
import { useRouteStopSwap } from "@technician/hooks/route-map/use-route-stop-swap";
import { useRouteStopReposition } from "@technician/hooks/route-map/use-route-stop-reposition";
// Snap-zone Phase 7h (2026-05-22, follow-up) — the marker-drop
// dispatcher (`findNearestStop` / `classifyDrop` /
// `use-marker-drop-dispatcher`) was deleted along with the drag-
// driven reassign path. The marker is no longer draggable; cross-
// tech reassign flows through `<MarkerReassignPickerSheet>` only.
import {
  traceMap,
  captureMutationOutcome,
  captureMapBootHeartbeat,
} from "@technician/utils/sentry-map-diagnostics";

// Mount-time heartbeat build stamp. Bump this string whenever you
// ship a new diagnostic OTA so the resulting Sentry event ties back
// to a specific instrumented build. Look for events titled
// `route_map:heartbeat:mount (<this string>)` in Sentry to confirm
// the OTA actually applied on a given device.
const ROUTE_MAP_BUILD_STAMP = "2026-05-21-r16.19b-tooltip-time-range-merge";

/**
 * On-screen debug HUD toggle. Flip to `false` and ship an OTA to
 * hide the overlay once the chip-bar bug is diagnosed. The HUD
 * renders a small bottom-left panel showing build stamp,
 * pendingMenu primitives, the resolved liveMenuRoute, and the last
 * marker tap event so we can see in real time whether:
 *   - the second tap is firing onSelect at all (vs. iOS MapKit
 *     swallowing it because the marker is already "selected")
 *   - liveMenuRoute resolves to the same route as the tap
 *   - colorForRoute returns a color that matches the marker
 * This was added 2026-05-20 after three rounds of "shipped, still
 * broken" — Sentry breadcrumbs need a captureMessage to flush and
 * waiting for that round-trip costs the user a whole session.
 */
// 2026-05-25 — turned off now that the chip-bar flash + color mismatch
// is confirmed fixed. The HUD scaffolding stays in place so it's a
// one-line flip back to `true` next time we need a real-time peek at
// pendingMenu / liveMenuRoute / last-tap state during an OTA debug
// session. See SHOW_ROUTE_MAP_HUD comment block above for the full
// rationale.
const SHOW_ROUTE_MAP_HUD = false;

/**
 * Single source of truth for a route's color on the map.
 *
 * 2026-05-20 round-10 — switched from `colorForRouteId(routeId)` (a
 * private `ROUTE_PALETTE[routeId % 8]` scheme local to this file) to
 * `colorForTech(route.technicianId)`. The previous scheme produced
 * map colors that did not match the calendar's appointment-card
 * colors, the landscape avatar strip's border colors, or anywhere
 * else in the app that needed "tech color" — because every other
 * surface uses `colorForTech(techId)` against `TECH_PALETTE`, while
 * the map used a different palette indexed by routeId.
 *
 * The user's correct mental model: each tech has ONE color
 * everywhere — calendar cards, avatar borders, map markers, map
 * polyline, route-reorder chip bar, reassign-picker swatches. The
 * map was the deviant; everything else was already consistent.
 *
 * `colorForTech` is identity-stable across reorder (Knuth hash of
 * techId, not array-position-based) — see
 * `src/utils/color-for-tech.ts` for the bucketing rationale and the
 * 2026-05-08 high-bits fix. The comment in that file calling out
 * "intentionally NOT the same as the ROUTE_PALETTE scheme used by
 * FranchiseRouteMap" is now stale; this commit unifies them.
 */
function colorForRoute(route: Pick<MapRoute, "technicianId">): string {
  return colorForTech(route.technicianId);
}

const DONE_STATUSES = new Set(["completed", "skipped"]);

interface FranchiseRouteMapProps {
  franchiseId: number;
  date: string;
  fullBleed?: boolean;
  /**
   * LDM-WAVE-1 CHUNK-6 — chrome slots. Three-state semantic:
   *   - `undefined` (prop omitted) → default chrome IFF `!fullBleed`,
   *     otherwise nothing. Matches pre-CHUNK-6 behavior exactly.
   *   - `null` → suppress the default chrome for this region even
   *     when `!fullBleed` (lets the future portrait-customer-app
   *     variant opt out without flipping `fullBleed`).
   *   - `<ReactNode>` → render the provided node, regardless of
   *     `fullBleed`.
   * Spec: §CHUNK-6 → Behavior contract — slot fall-through.
   */
  renderTopChrome?: ReactNode | null;
  renderRightChrome?: ReactNode | null;
  renderBottomChrome?: ReactNode | null;
}

function segmentColor(prev: MapStop, cur: MapStop, routeColor: string) {
  const prevDone = DONE_STATUSES.has(prev.status);
  const curDone = DONE_STATUSES.has(cur.status);
  if (prevDone && curDone) return "#D1D5DB";
  if (prevDone && !curDone) return "#F59E0B";
  return routeColor;
}

// Snap-zone Phase 7a (2026-05-22) — chip-bar `onReorder` is a
// legacy fallback for drag drops that don't match either snap
// zone. In the route-map wiring both snap handlers are always
// supplied, so this is a true no-op. Defined module-level so
// React doesn't see a new function identity per render (which
// would defeat the chip-bar's renderItem memoization).
const NOOP_REORDER = (_newOrderedStopIds: number[]) => {};

export function FranchiseRouteMap({
  franchiseId,
  date,
  fullBleed = false,
  renderTopChrome,
  renderRightChrome,
  renderBottomChrome,
}: FranchiseRouteMapProps) {
  const fitPadding = useMemo(
    () =>
      fullBleed
        ? { top: 40, right: 24, bottom: 40, left: 24 }
        : { top: 60, right: 40, bottom: 120, left: 40 },
    [fullBleed],
  );

  const mapRef = useRef<MapView>(null);

  // Mount-time Sentry heartbeat — fires once per mount of this
  // component. Pure deployment verification: confirms the
  // instrumented JS bundle is the one running on the device.
  useEffect(() => {
    captureMapBootHeartbeat(ROUTE_MAP_BUILD_STAMP);
  }, []);

  const { data, isLoading } = useFranchiseRouteMap(franchiseId, date);
  // Map multi-select lives in the calendar store (session-only) so it stays
  // independent from the calendar's own selection. Empty array = show all.
  const mapSelectedTechIds = useCalendarStore((s) => s.mapSelectedTechIds);
  const toggleMapTech = useCalendarStore((s) => s.toggleMapTech);
  const clearMapSelection = useCalendarStore((s) => s.clearMapSelection);
  const isFiltered = mapSelectedTechIds.length > 0;
  const isTechVisible = useCallback(
    (technicianId: number) =>
      !isFiltered || mapSelectedTechIds.includes(technicianId),
    [isFiltered, mapSelectedTechIds],
  );

  const wsChannel = franchiseId > 0 ? `franchise:${franchiseId}` : null;
  const { lastUpdate } = useRealtimeLocation(wsChannel);

  // Snap-zone Phase 7h (2026-05-22, follow-up) — `pendingReassign` +
  // `useRouteStopReorder` + `handleMarkerDragEnd` all deleted. Pin
  // dragging is entirely off (the native `<Marker>` no longer passes
  // `draggable`); cross-tech reassign now flows ONLY through
  // `<MarkerReassignPickerSheet>` (single-tap → `<MapActionModal>` →
  // "Reassign…"). The drag-driven `<MarkerDropConfirmSheet>` and its
  // pending state are gone with the rest of the LDM-WAVE-2 CHUNK-3
  // drag-driven pathway.
  //
  // PLAN-DEVIATION: 2026-05-17-map-sheets-native-modal — the
  // map-driven sheets use RN's `<Modal>` (via `<MapActionModal>`)
  // instead of `<AppSheet>`. Visibility is purely declarative.

  // r15 chunk 4 — chip-bar pairwise swap mutation. Phase 4 + 7a
  // (2026-05-22) — drives SWAP-mode drag-end through
  // `handleDragRescheduleSubmit` with explicit per-side times from
  // the mini-sheet. The previous `handleCommitChipOrder` chain that
  // walked a multi-swap plan is retired; every drag is now its own
  // single-swap call.
  const swapMutation = useRouteStopSwap();
  const repositionMutation = useRouteStopReposition();
  const reassignMutation = useReassignAppointment();
  const queryClient = useQueryClient();

  // Snap-zone Phase 7a (2026-05-22) removed `chipBarCommitting`
  // and `chipBarPending` state. Both belonged to the parent-owned
  // batch-commit model (r16 / r16.1) that the snap-zone mini-
  // sheets retired. Polyline preview now reads `liveMenuRoute.stops`
  // directly — the mutations' optimistic patches keep that cache
  // in sync, so the bar + map stay aligned without a sibling
  // state mirror. See plan §7a for the unwind context.

  // Snap-zone Phase 7a (2026-05-22) removed `derivePairwiseSwaps`
  // + `handleCommitChipOrder`. The Commit/Discard buttons that
  // drove the multi-swap commit chain are gone; every drag now
  // commits as a single explicit swap or reposition via its
  // mini-sheet, so there's nothing to "reduce a pending plan
  // into pairwise swaps" for. The crash-mitigation rationale
  // those helpers were carrying (REMI-TECHNICIAN-20 / -28 —
  // AIRMap subview-array races under rapid optimistic patches)
  // is unchanged by the removal: each drag still produces one
  // mutation, and the user can't fire them faster than the
  // mini-sheet's open/save cycle allows. See plan §7a.

  // LDM-WAVE-2 CHUNK-4 (DRAG-3-CONTEXT-MENU) — Tap-to-menu state.
  // Tapping a marker sets `pendingMenu` → chip bar opens. The
  // Reassign… affordance sets `pendingMenuReassign` →
  // <MarkerReassignPickerSheet> opens (this is independent from the
  // CHUNK-3 drag-driven `pendingReassign` so the two flows can
  // coexist with different confirmation UX).
  //
  // 2026-05-20 fix — store primitives, NOT object snapshots. The
  // previous shape held `{stop, route}` snapshots from the moment of
  // tap; when TanStack Query refetched `data`, those snapshots became
  // stale and the chip-bar IIFE re-resolved through `data.routes.find(...)`,
  // which could match a different logical route if iteration order or
  // payload shape shifted across the refetch window. Storing the
  // primitive ids means the chip bar always reads the LIVE route +
  // stop from `data` and a no-op tap (or duplicate onSelect fire from
  // MapKit on iOS) doesn't change identity → no spurious re-render
  // to a different route.
  const [pendingMenu, setPendingMenu] = useState<{
    routeId: number;
    stopId: number;
  } | null>(null);
  const [pendingMenuReassign, setPendingMenuReassign] = useState<{
    appointmentId: number;
    fromTechId: number;
    fromTechName: string;
    summary: string;
  } | null>(null);

  // r15 chunk 3 — quick-time reschedule from chip tooltip.
  // Holds the appointmentId + customerName so the QuickTimeSheet can
  // render the header without waiting for its own fetch to resolve.
  const [pendingQuickTime, setPendingQuickTime] = useState<{
    appointmentId: number;
    customerName: string | null;
  } | null>(null);

  // r15 chunk 3 — "Advanced…" full-RescheduleSheet from the map.
  // Deferred: the existing <RescheduleSheet> is built on @gorhom/
  // bottom-sheet which has a known animation-stall bug around
  // <MapView> on iOS (PLAN-DEVIATION 2026-05-17 in
  // marker-context-menu-sheet.tsx). Until that's ported to
  // MapActionModal, "Advanced…" closes QuickTime and shows an alert
  // pointing the user at the calendar tab for date / notification
  // changes. The QuickTime time-only path covers the 80% case.

  // 2026-05-20 round-3 debug HUD state. Updated every time a marker
  // fires `onSelect`. The HUD overlay (see `renderDebugHud` below)
  // shows this against `pendingMenu` so we can see at a glance
  // whether the second tap actually fired and what ids reached the
  // handler.
  const [lastTapEvent, setLastTapEvent] = useState<{
    routeId: number;
    stopId: number;
    technicianName: string;
    color: string;
    ts: number;
    seq: number;
  } | null>(null);
  const tapSeqRef = useRef(0);
  const [wsPositions, setWsPositions] = useState<
    Map<number, { lat: number; lng: number }>
  >(new Map());

  useEffect(() => {
    if (!lastUpdate) return;
    setWsPositions((prev) => {
      const next = new Map(prev);
      next.set(lastUpdate.technicianId, {
        lat: lastUpdate.lat,
        lng: lastUpdate.lng,
      });
      return next;
    });
  }, [lastUpdate]);

  // 2026-05-20 fix (round 3) — color resolution moved off a
  // `Map<routeId, string>` derived from `data.routes` and onto the
  // pure `colorForRoute(route)` helper at the top of this file
  // (which delegates to `colorForTech(route.technicianId)` per
  // round-10). See colorForRoute jsdoc for full history.
  // Every consumer (marker, polyline, chip bar, legend chip, picker
  // candidate) calls the helper directly with the routeId in hand,
  // so a refetch / reorder / membership change in `data.routes` can
  // no longer reshuffle the color sequence across renders.

  const techLocationMap = useMemo(() => {
    const m = new Map<number, { lat: number; lng: number }>();
    data?.technicianLocations.forEach((tl) => {
      m.set(tl.technician_id, { lat: tl.lat, lng: tl.lng });
    });
    wsPositions.forEach((pos, id) => m.set(id, pos));
    return m;
  }, [data?.technicianLocations, wsPositions]);

  const allCoordinates = useMemo(() => {
    if (!data) return [];
    const coords: { latitude: number; longitude: number }[] = [];
    data.routes.forEach((r) => {
      r.stops.forEach((s) => {
        if (s.lat != null && s.lng != null) {
          coords.push({ latitude: s.lat, longitude: s.lng });
        }
      });
    });
    return coords;
  }, [data]);

  const coordsRef = useRef(allCoordinates);
  coordsRef.current = allCoordinates;

  const handleMapReady = useCallback(() => {
    if (!mapRef.current) return;
    const coords = coordsRef.current;
    if (coords.length > 0) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: fitPadding,
        animated: false,
      });
    } else {
      mapRef.current.animateToRegion({
        latitude: 39.9612,
        longitude: -82.9988,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      }, 0);
    }
  }, [fitPadding]);

  useEffect(() => {
    if (mapRef.current && allCoordinates.length > 0) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(allCoordinates, {
          edgePadding: fitPadding,
          animated: true,
        });
      }, 500);
    }
  }, [allCoordinates, fitPadding]);

  const fitToRoute = useCallback(() => {
    if (!mapRef.current || !data) return;
    let coords: { latitude: number; longitude: number }[] = [];
    if (isFiltered) {
      data.routes
        .filter((r) => mapSelectedTechIds.includes(r.technicianId))
        .forEach((route) => {
          route.stops
            .filter((s) => s.lat != null && s.lng != null)
            .forEach((s) =>
              coords.push({ latitude: s.lat!, longitude: s.lng! }),
            );
          const live = techLocationMap.get(route.technicianId);
          if (live) coords.push({ latitude: live.lat, longitude: live.lng });
        });
    } else {
      coords = allCoordinates;
    }
    if (coords.length > 0) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: fitPadding,
        animated: true,
      });
    }
  }, [allCoordinates, isFiltered, mapSelectedTechIds, data, techLocationMap, fitPadding]);

  // Refit the map when the filter changes (toggle a tech on/off).
  useEffect(() => {
    if (!mapRef.current || !data) return;
    const t = setTimeout(() => fitToRoute(), 150);
    return () => clearTimeout(t);
  }, [mapSelectedTechIds, data, fitToRoute]);

  const handleTechTap = useCallback(
    (technicianId: number) => {
      toggleMapTech(technicianId);
    },
    [toggleMapTech],
  );

  // Snap-zone Phase 7h (2026-05-22, follow-up) — `handleMarkerDragEnd`
  // and its drag-driven confirm handlers (`handleCancelReassign`,
  // `handleConfirmReassign`) were deleted along with `pendingReassign`
  // and `<MarkerDropConfirmSheet>`. Pin dragging is entirely off — the
  // native `<Marker>` no longer passes `draggable`, so no `onDragEnd`
  // event ever fires from `<AppointmentMarker>`. Cross-tech
  // reassign flows only through the explicit menu now: single-tap →
  // `<MapActionModal>` → "Reassign…" → `<MarkerReassignPickerSheet>`
  // → `reassignMutation` (kept above for that menu-driven path).
  //
  // PLAN-DEVIATION: 2026-05-22-snap-zone-replaces-pin-drag —
  //   The full pin-drag pathway (LDM-WAVE-2 CHUNK-3: drag activation,
  //   drop dispatcher, same-route reorder, cross-tech reassign on
  //   drop, the confirm sheet, the marker's drag plumbing, and the
  //   matching Sentry surface) was deleted in snap-zone Phase 7h
  //   follow-up. The earlier 2026-05-17-native-marker-drag-vs-double-
  //   tap-hold deviation is RESOLVED by this removal.
  //   See docs/PLAN-DEVIATIONS.md#2026-05-22-snap-zone-replaces-pin-drag.

  // LDM-WAVE-2 CHUNK-4 (DRAG-3-CONTEXT-MENU) — marker-tap handler.
  // The marker raises `onActionsPress(stop, route)` on single-tap; we
  // store ONLY the primitive ids so a TanStack Query refetch or an
  // iOS double-fire of `didSelectAnnotation` for the same marker
  // can't silently swap downstream consumers onto a different route.
  //
  // 2026-05-20 round-3 instrumentation — every call records the
  // (routeId, stopId, stopCount) AND the previous pendingMenu state.
  // The "9-dot flash" reported by the user implies this handler is
  // firing twice per tap with different ids, OR firing once with
  // wrong ids then being corrected. Sentry breadcrumbs will show
  // which.
  const handleMarkerActionsPress = useCallback(
    (stop: MapStop, route: MapRoute) => {
      tapSeqRef.current += 1;
      const seq = tapSeqRef.current;
      setLastTapEvent({
        routeId: route.routeId,
        stopId: stop.stopId,
        technicianName: route.technicianName,
        color: colorForRoute(route),
        ts: Date.now(),
        seq,
      });
      traceMap("menu_state_changed", {
        state: "opening",
        seq,
        appointmentId: stop.appointmentId,
        routeId: route.routeId,
        technicianId: route.technicianId,
        routeStopsCount: route.stops.length,
        routeStopsWithCoordsCount: route.stops.filter(
          (s) => s.lat != null && s.lng != null,
        ).length,
        ts: Date.now(),
      });
      setPendingMenu((prev) => {
        // Idempotent: if the same marker is already selected, don't
        // create a new state object (would re-render and possibly
        // re-fire MapKit selection events).
        if (
          prev &&
          prev.routeId === route.routeId &&
          prev.stopId === stop.stopId
        ) {
          traceMap("menu_state_changed", {
            state: "no_change_same_ids",
            routeId: route.routeId,
            stopId: stop.stopId,
          });
          return prev;
        }
        traceMap("menu_state_changed", {
          state: "transition",
          prevRouteId: prev?.routeId ?? null,
          prevStopId: prev?.stopId ?? null,
          nextRouteId: route.routeId,
          nextStopId: stop.stopId,
        });
        return { routeId: route.routeId, stopId: stop.stopId };
      });
    },
    []
  );

  const handleCloseMenu = useCallback(() => {
    traceMap("menu_state_changed", { state: "closing" });
    setPendingMenu(null);
  }, []);

  // Resolve the live route + stop for the open menu, every render.
  // `pendingMenu` only holds ids; this is the single source of truth
  // for what the chip bar and the reassign-picker should display.
  const liveMenuRoute = useMemo<MapRoute | null>(() => {
    if (!pendingMenu || !data) return null;
    return (
      data.routes.find((r) => r.routeId === pendingMenu.routeId) ?? null
    );
  }, [pendingMenu, data]);

  const liveMenuStop = useMemo<MapStop | null>(() => {
    if (!pendingMenu || !liveMenuRoute) return null;
    return (
      liveMenuRoute.stops.find((s) => s.stopId === pendingMenu.stopId) ?? null
    );
  }, [pendingMenu, liveMenuRoute]);

  // Snap-zone Phase 7a (2026-05-22) — chip-bar input is now a
  // single derivation off `liveMenuRoute.stops`. The mutations'
  // optimistic patches update `liveMenuRoute.stops` directly
  // (swap → swap stop_orders + scheduled times; reposition →
  // bump the moved stop's stop_order + scheduledTime and shift
  // the affected siblings), so re-deriving `chipPendingStops`
  // from that cache slice on every render IS the up-to-date
  // view. The previous parent-owned `chipBarPending` mirror
  // and the `chipPendingChangeCount` / `chipHasPendingChanges`
  // bookkeeping it drove are retired — they only existed to
  // back the bottom-bar Commit/Discard buttons. See plan §7a.
  const chipPendingStops = useMemo<MapStop[]>(() => {
    if (!liveMenuRoute) return [];
    return [...liveMenuRoute.stops]
      .filter((s) => s.lat != null && s.lng != null)
      .sort((a, b) => a.stopOrder - b.stopOrder);
  }, [liveMenuRoute]);

  // Phase 4 (2026-05-21) + Phase 6 (2026-05-22) —
  // `<DragRescheduleSheet>` state for SWAP- and INSERT-mode drag
  // drops. When the chip-bar fires `onRequestSwapWithTimes` or
  // `onRequestInsertAtPosition`, we compute the per-side picker
  // window(s) + default(s) from the current `chipPendingStops`
  // neighborhood and open the sheet in the matching kind. On
  // Save, we dispatch the matching BE mutation (`swapStops` or
  // `repositionStop`) with the dispatcher's picked times and
  // notify-customer flag, and let the mutation's optimistic
  // cache patch redraw the polyline + chip bar. On Cancel, we
  // close the sheet without touching either.
  //
  // PLAN-DEVIATION: 2026-05-21-chip-bar-snap-mini-sheet — the per-
  // drop mini-sheet path below replaces the chip bar's pre-existing
  // r16.1/r16.2 auto-trade `onReorder` model. Phase 5 also shipped
  // as Option 5b (new `useRouteStopReposition` hook) instead of
  // Option 5a (extending `useRescheduleAppointment`). See
  // docs/PLAN-DEVIATIONS.md#2026-05-21-chip-bar-snap-mini-sheet.
  //
  // The state is a discriminated union so the submit branch
  // can resolve back to the right mutation + the right
  // chip-bar-pending update without any "did we open in insert
  // or swap" guessing. routeId lives on the outer state for
  // both kinds because the BE endpoints want it as a path arg.
  type DragRescheduleState =
    | {
        kind: "swap";
        routeId: number;
        aStopId: number;
        bStopId: number;
        mode: DragRescheduleSheetMode;
      }
    | {
        kind: "insert";
        routeId: number;
        stopId: number;
        // 1-indexed `stop_order` the BE will write — surfaced from
        // `computeInsertWindow` so the submit handler doesn't
        // re-derive it from `chipPendingStops` (which may have
        // mutated by the time the dispatcher hits Save).
        newStopOrder: number;
        mode: DragRescheduleSheetMode;
      };
  const [dragRescheduleState, setDragRescheduleState] =
    useState<DragRescheduleState | null>(null);
  const [dragRescheduleSubmitting, setDragRescheduleSubmitting] =
    useState(false);

  // B2-1 (2026-05-22) — opt-in chip-bar "Plan" mode. Toggle pill
  // lives next to the Tech button in the chip bar. When ON, drag
  // drops are staged instead of opening the mini-sheet — the
  // staged plan is reviewed and committed as a batch in B2-4/5.
  // See `docs/implementation-plans/chip-bar-plan-mode-batch.md`.
  //
  // PLAN-DEVIATION: 2026-05-22-chip-bar-plan-mode-batch — Plan Mode
  // is not in the snap-zone plan; it was added in response to a field
  // report that rapid sequential per-drop commits were stressing the
  // native map layer (REMI-TECHNICIAN-20 / -28). It sits on top of the
  // per-drop pipeline; toggling it off restores the plan's per-drop
  // model exactly. See
  // docs/PLAN-DEVIATIONS.md#2026-05-22-chip-bar-plan-mode-batch.
  //
  // B2-2 (2026-05-22) — `plannedMoves` holds the staged plan.
  // Each entry carries proposed times so the review sheet (B2-4)
  // can show + edit them. The discriminated union mirrors the
  // mini-sheet payload shape so the commit pipeline (B2-5) can
  // dispatch directly to the existing `swapMutation` /
  // `repositionMutation` without an intermediate translation
  // layer.
  //
  // Dedupe rule + PlannedMove shape live in
  // `src/utils/route-plan-moves.ts`. Module is pure (no React) so
  // the dedupe rule has unit-test coverage without dragging the
  // parent component's broken test setup (QueryClient gap) into
  // scope.
  //
  // Reset triggers (both clear `plannedMoves`):
  //   - `liveMenuRoute?.routeId` changes — plan only makes sense
  //     within one route; switching routes implicitly discards.
  //   - Toggle flipped OFF mid-plan — B2-6 will add a confirm-
  //     discard prompt; for B2-2 we drop silently so the mini-
  //     sheet flow takes over cleanly on the next drop.
  const [planModeActive, setPlanModeActive] = useState(false);
  const [plannedMoves, setPlannedMoves] = useState<PlannedMove[]>([]);
  const handleTogglePlanMode = useCallback((next: boolean) => {
    setPlanModeActive(next);
    if (!next) {
      setPlannedMoves([]);
      // B2-5 (2026-05-22) — also clear any lingering commit
      // status entries from a prior partial-failure session so a
      // re-enter of plan mode starts from a clean slate.
      setCommitStatusByRow({});
    }
  }, []);
  useEffect(() => {
    setPlanModeActive(false);
    setPlannedMoves([]);
    // B2-5 — same reset on route switch (the routeId change
    // already nukes plannedMoves; mirror that for the status
    // map so a future re-open doesn't surface stale badges).
    setCommitStatusByRow({});
  }, [liveMenuRoute?.routeId]);

  const stagePlannedMove = useCallback((move: PlannedMove) => {
    setPlannedMoves((prev) => dedupePlannedMoves(prev, move));
  }, []);

  // B2-3 (2026-05-22) — When plan mode is active AND there are
  // staged moves, derive a "displayed" version of the focused
  // route's stops by replaying the plan against `chipPendingStops`.
  // Both the chip bar AND the focused route's polyline (further
  // down) consume this memo so the dispatcher sees the route
  // reshape in real time without any BE call. When plan mode is
  // off (or the plan is empty), this is identity equal to
  // `chipPendingStops` so no consumer needs to branch on the mode
  // — the shared memo IS the source of truth in both branches.
  const displayedFocusedStops = useMemo<MapStop[]>(() => {
    if (!planModeActive || plannedMoves.length === 0) return chipPendingStops;
    return applyPlannedMoves(chipPendingStops, plannedMoves);
  }, [chipPendingStops, planModeActive, plannedMoves]);

  // B2-4 (2026-05-22) — `<ReviewPlanSheet>` visibility + the
  // assembled rows it consumes. The sheet is presentational: it
  // takes pre-built rows + a few coarse callbacks (adjust-time,
  // remove, commit, cancel) and the parent owns the source-of-
  // truth `plannedMoves`. Editing a time in the sheet calls back
  // into the parent, which patches the matching `PlannedMove`,
  // which re-renders both the polyline and chip bar in real time
  // (since both surfaces derive from `plannedMoves` via
  // `applyPlannedMoves`).
  //
  // B2-5 (2026-05-22) — added `commitStatusByRow` + `isCommitting`
  // so the sheet can render per-row badges (inFlight / committed /
  // failed) during the sequential commit walk. The walk itself
  // lives in `handleReviewCommit` below; the helper that drives
  // it is in `src/utils/route-plan-commit.ts` and is unit-tested
  // independently of the parent component.
  const [reviewSheetVisible, setReviewSheetVisible] = useState(false);
  const [commitStatusByRow, setCommitStatusByRow] = useState<
    Record<string, CommitRowStatus>
  >({});
  const [isCommitting, setIsCommitting] = useState(false);
  // Closing the sheet when the plan goes empty (e.g. user removes
  // the last row via the sheet, OR a routeId change resets the
  // plan from under us) avoids a sheet-floating-over-nothing
  // state. Cheap effect; no debouncing needed because plan length
  // is the only signal that matters here.
  useEffect(() => {
    if (plannedMoves.length === 0) {
      setReviewSheetVisible(false);
    }
  }, [plannedMoves.length]);
  // B2-5 (2026-05-22) — rowKey scheme is shared between the sheet
  // memo below AND the commit pipeline's `rowKeyOf` callback. If
  // these ever diverge, the sheet's status badges will land on the
  // wrong rows, so keep them derived from one place.
  const rowKeyForMove = useCallback((move: PlannedMove): string => {
    return move.kind === "swap"
      ? `swap:${move.aStopId}:${move.bStopId}`
      : `insert:${move.stopId}`;
  }, []);

  const reviewPlanRows = useMemo<ReviewPlanRow[]>(() => {
    return plannedMoves.map((move) => {
      const rowKey = rowKeyForMove(move);
      const status = commitStatusByRow[rowKey];
      if (move.kind === "swap") {
        const aStop = chipPendingStops.find((s) => s.stopId === move.aStopId);
        const bStop = chipPendingStops.find((s) => s.stopId === move.bStopId);
        const isStale = !aStop || !bStop;
        const aName = aStop?.customerName ?? "Appointment";
        const bName = bStop?.customerName ?? "Appointment";
        // B2-7 (2026-05-22) — effective duration = override ?? base.
        // Sheet reads `durationMinutes` for end-time math + the
        // chevron stepper's "value" display; `baseDurationMinutes`
        // drives the dirty-tint comparison so the value tints green
        // only when the dispatcher has actually stepped off the base.
        const aEffective = move.aDurationOverrideMin ?? move.aDurationMinutes;
        const bEffective = move.bDurationOverrideMin ?? move.bDurationMinutes;
        return {
          rowKey,
          kind: "swap",
          summary: `Trade times with ${bName}`,
          isStale,
          status,
          aSide: {
            name: aName,
            originalHHMM: aStop?.scheduledTime ?? null,
            proposedStartHHMM: move.aNewStartHHMM,
            durationMinutes: aEffective,
            baseDurationMinutes: move.aDurationMinutes,
            windowEdges: move.aWindow,
            windowLabel: formatTimeRange12h(
              move.aWindow.startHHMM,
              move.aWindow.endHHMM,
            ),
          },
          bSide: {
            name: bName,
            originalHHMM: bStop?.scheduledTime ?? null,
            proposedStartHHMM: move.bNewStartHHMM,
            durationMinutes: bEffective,
            baseDurationMinutes: move.bDurationMinutes,
            windowEdges: move.bWindow,
            windowLabel: formatTimeRange12h(
              move.bWindow.startHHMM,
              move.bWindow.endHHMM,
            ),
          },
        };
      }
      const stop = chipPendingStops.find((s) => s.stopId === move.stopId);
      const isStale = !stop;
      const name = stop?.customerName ?? "Appointment";
      const effectiveDuration =
        move.durationOverrideMin ?? move.durationMinutes;
      return {
        rowKey,
        kind: "insert",
        summary: `Insert at position ${move.newStopOrder}`,
        isStale,
        status,
        aSide: {
          name,
          originalHHMM: stop?.scheduledTime ?? null,
          proposedStartHHMM: move.newStartHHMM,
          durationMinutes: effectiveDuration,
          baseDurationMinutes: move.durationMinutes,
          windowEdges: move.window,
          windowLabel: formatTimeRange12h(
            move.window.startHHMM,
            move.window.endHHMM,
          ),
        },
      };
    });
  }, [plannedMoves, chipPendingStops, commitStatusByRow, rowKeyForMove]);

  const handleOpenReviewPlan = useCallback(() => {
    traceMap("review_plan_open", { count: plannedMoves.length });
    setReviewSheetVisible(true);
  }, [plannedMoves.length]);

  const handleCloseReviewPlan = useCallback(() => {
    setReviewSheetVisible(false);
  }, []);

  // B2-6 (2026-05-22) — "Discard plan" from the review sheet's
  // header link. Confirms with a destructive Alert; on Discard,
  // clears the plan, exits plan mode entirely, drops any
  // lingering commit-status entries, and closes the sheet. We
  // ALSO exit plan mode (not just clear `plannedMoves`) because
  // the dispatcher chose to abandon the batch — keeping the
  // plan-mode toggle on after a wholesale discard would force
  // them to redo it just to be in the normal drag-to-mini-sheet
  // flow again. The sheet itself hides the Discard button when
  // `rows.length === 0` or `isSubmitting === true`, so this
  // handler only fires from valid states; we still guard against
  // a stale tap by sanity-checking length here.
  const handleDiscardPlan = useCallback(() => {
    const count = plannedMoves.length;
    if (count === 0) {
      setReviewSheetVisible(false);
      return;
    }
    Alert.alert(
      `Discard ${count} pending change${count === 1 ? "" : "s"}?`,
      "These changes won't be saved.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            traceMap("review_plan_discard", {
              count,
              routeId: liveMenuRoute?.routeId ?? null,
            });
            setPlannedMoves([]);
            setCommitStatusByRow({});
            setPlanModeActive(false);
            setReviewSheetVisible(false);
          },
        },
      ],
      { cancelable: true },
    );
  }, [plannedMoves.length, liveMenuRoute?.routeId]);

  // B2-5 (2026-05-22) — clear a row's commit status when its
  // underlying move changes. Without this, a failed row would
  // keep its red "Failed: …" badge after the dispatcher fixed
  // the cause and stepped to a new time, which makes the retry
  // look like it was already attempted with the new value. Same
  // shape used by `handleReviewRemove` (status entry just
  // disappears with the row).
  const clearRowStatus = useCallback((rowKey: string) => {
    setCommitStatusByRow((prev) => {
      if (!(rowKey in prev)) return prev;
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
  }, []);

  const handleReviewAdjustTime = useCallback(
    (rowKey: string, side: "a" | "b", newStartHHMM: string) => {
      setPlannedMoves((prev) =>
        prev.map((m) => {
          if (
            m.kind === "swap" &&
            rowKey === `swap:${m.aStopId}:${m.bStopId}`
          ) {
            return side === "a"
              ? { ...m, aNewStartHHMM: newStartHHMM }
              : { ...m, bNewStartHHMM: newStartHHMM };
          }
          if (m.kind === "insert" && rowKey === `insert:${m.stopId}`) {
            return { ...m, newStartHHMM };
          }
          return m;
        }),
      );
      clearRowStatus(rowKey);
    },
    [clearRowStatus],
  );

  // B2-7 (2026-05-22) — duration chevron edits from the review
  // sheet. Mirrors `handleReviewAdjustTime` exactly except the
  // mutated field is the override (not the new start). Setting the
  // override === the base unsets it (`undefined`) so the row's
  // "dirty" tint disappears and the commit pipeline doesn't send a
  // no-op override field.
  const handleReviewAdjustDuration = useCallback(
    (rowKey: string, side: "a" | "b", newDurationMin: number) => {
      setPlannedMoves((prev) =>
        prev.map((m) => {
          if (
            m.kind === "swap" &&
            rowKey === `swap:${m.aStopId}:${m.bStopId}`
          ) {
            if (side === "a") {
              const nextOverride =
                newDurationMin === m.aDurationMinutes ? undefined : newDurationMin;
              return { ...m, aDurationOverrideMin: nextOverride };
            }
            const nextOverride =
              newDurationMin === m.bDurationMinutes ? undefined : newDurationMin;
            return { ...m, bDurationOverrideMin: nextOverride };
          }
          if (m.kind === "insert" && rowKey === `insert:${m.stopId}`) {
            const nextOverride =
              newDurationMin === m.durationMinutes ? undefined : newDurationMin;
            return { ...m, durationOverrideMin: nextOverride };
          }
          return m;
        }),
      );
      clearRowStatus(rowKey);
    },
    [clearRowStatus],
  );

  const handleReviewRemove = useCallback(
    (rowKey: string) => {
      setPlannedMoves((prev) =>
        prev.filter((m) => {
          if (m.kind === "swap") {
            return rowKey !== `swap:${m.aStopId}:${m.bStopId}`;
          }
          return rowKey !== `insert:${m.stopId}`;
        }),
      );
      clearRowStatus(rowKey);
    },
    [clearRowStatus],
  );

  // B2-5 (2026-05-22) — sequential commit pipeline. Replaces the
  // B2-4 stub. Walks `plannedMoves` in order via
  // `commitPlanSequentially` (a pure helper that drives the
  // per-row status reporter + stops on first failure). For each
  // move it calls the matching existing mutation
  // (`swapMutation` / `repositionMutation`) with the shared
  // `notifyCustomer` flag from the sheet's footer toggle.
  //
  // Outcomes:
  //   - All non-stale moves succeed → remove them from
  //     `plannedMoves`, clear `commitStatusByRow`, exit plan
  //     mode, close the sheet. Stale moves stay in the plan
  //     (the dispatcher needs to remove them manually — the
  //     sheet's `isStale` hint tells them why).
  //   - Failure mid-walk → remove ONLY the successfully
  //     committed moves from `plannedMoves` so a retry of the
  //     tail doesn't double-fire them. Leave `commitStatusByRow`
  //     intact so the failed row keeps its red badge and the
  //     un-attempted rows render as idle. Sheet stays open.
  //
  // Stale moves are filtered BEFORE the walk so the helper sees
  // a clean list — keeps the helper's interface free of any
  // chipPendingStops dependency. The dropped stales' row entries
  // (if any pre-existing status from a prior commit) are also
  // cleared so they render cleanly in the sheet.
  const handleReviewCommit = useCallback(
    async (notifyCustomer: boolean) => {
      if (isCommitting) return;
      if (plannedMoves.length === 0 || !liveMenuRoute) return;
      const routeId = liveMenuRoute.routeId;

      // Filter out stale moves — they reference a stop that's no
      // longer in the focused route, so the BE would reject them.
      // Same staleness check as `reviewPlanRows` above.
      const stopIdSet = new Set(chipPendingStops.map((s) => s.stopId));
      const movesToCommit = plannedMoves.filter((m) => {
        if (m.kind === "swap") {
          return stopIdSet.has(m.aStopId) && stopIdSet.has(m.bStopId);
        }
        return stopIdSet.has(m.stopId);
      });

      if (movesToCommit.length === 0) {
        // Everything was stale — nothing to fire. Surface via
        // trace so we can spot this pattern in production; the
        // sheet stays open with all rows rendered as stale.
        traceMap(
          "review_plan_commit_all_stale",
          { count: plannedMoves.length, routeId },
          "warning",
        );
        return;
      }

      traceMap("review_plan_commit_started", {
        count: movesToCommit.length,
        totalCount: plannedMoves.length,
        notifyCustomer,
        routeId,
      });

      setIsCommitting(true);

      const result = await commitPlanSequentially({
        moves: movesToCommit,
        rowKeyOf: rowKeyForMove,
        commitMove: async (move) => {
          if (move.kind === "swap") {
            // B2-7 (2026-05-22) — only forward the duration
            // override fields when the dispatcher actually stepped
            // them off the base. Omitting them keeps the existing
            // (legacy) BE call signature for unchanged-duration
            // moves so anyone reading the network panel sees the
            // exact same payload they saw pre-B2-7.
            await swapMutation.mutateAsync({
              route_id: routeId,
              aStopId: move.aStopId,
              bStopId: move.bStopId,
              aNewTime: move.aNewStartHHMM,
              bNewTime: move.bNewStartHHMM,
              notifyCustomer,
              // 2026-05-25 — Suppress per-call invalidates +
              // delayed invalidates during the batch walk. The
              // finalizer block below fires ONE invalidate + ONE
              // delayed invalidate after the whole batch
              // commits, avoiding N × refetch round-trips that
              // made Plan Mode commits feel sluggish.
              __batchMode: true,
              ...(move.aDurationOverrideMin !== undefined && {
                aNewDurationMin: move.aDurationOverrideMin,
              }),
              ...(move.bDurationOverrideMin !== undefined && {
                bNewDurationMin: move.bDurationOverrideMin,
              }),
            });
          } else {
            await repositionMutation.mutateAsync({
              route_id: routeId,
              stopId: move.stopId,
              newStopOrder: move.newStopOrder,
              newStartTime: move.newStartHHMM,
              notifyCustomer,
              __batchMode: true,
              ...(move.durationOverrideMin !== undefined && {
                newDurationMin: move.durationOverrideMin,
              }),
            });
          }
        },
        onStatusChange: (rowKey, status) => {
          setCommitStatusByRow((prev) => ({ ...prev, [rowKey]: status }));
        },
      });

      // 2026-05-25 — Plan Mode batch finalizer. Each per-move BE
      // swap kicked off its OWN fire-and-forget polyline refresh
      // (Google Routes API, ~1-2s per route), so for an N-move
      // batch we have N parallel refreshes that complete at
      // staggered times depending on Google's response latency.
      // A single 2.5s delayed invalidate sometimes fires BEFORE
      // the slowest refresh writes back, leaving the FE rendering
      // stale or missing polylines (per user smoke-test 2026-05-25:
      // "lines got mixed up, one line dissapeared altogether").
      //
      // Defense in depth: fire an immediate invalidate (replaces
      // optimistic patches with BE canonical state) PLUS staggered
      // delayed invalidates at 1s, 3s, and 6s to catch polyline
      // writes whenever they actually land. The query is cheap
      // (one HTTP GET) and TanStack dedupes overlapping refetches,
      // so over-invalidating is essentially free.
      if (result.succeededRowKeys.length > 0) {
        queryClient.invalidateQueries({ queryKey: ["franchise-route-map"] });
        const delays = [1000, 3000, 6000];
        for (const delayMs of delays) {
          setTimeout(() => {
            queryClient.invalidateQueries({
              queryKey: ["franchise-route-map"],
            });
          }, delayMs);
        }
      }

      // Prune successfully committed moves so a retry of any
      // failed tail doesn't double-fire them. Use a set lookup
      // against the same rowKey scheme the helper used.
      if (result.succeededRowKeys.length > 0) {
        const succeededSet = new Set(result.succeededRowKeys);
        setPlannedMoves((prev) =>
          prev.filter((m) => !succeededSet.has(rowKeyForMove(m))),
        );
      }

      if (result.failedRowKey == null) {
        // Full success — exit plan mode + close sheet. Stale
        // moves (if any) were never in `movesToCommit`, so check
        // whether anything is left in the plan before exiting.
        const remainingCount = plannedMoves.length - result.succeededRowKeys.length;
        if (remainingCount === 0) {
          setReviewSheetVisible(false);
          setPlanModeActive(false);
          setCommitStatusByRow({});
          traceMap("review_plan_commit_all_succeeded", {
            count: result.succeededRowKeys.length,
            routeId,
          });
        } else {
          // Some stale moves remain — sheet stays open so the
          // dispatcher can remove them manually. Keep plan
          // mode on; clear the committed rows from the status
          // map (they were pruned above).
          setCommitStatusByRow((prev) => {
            const next: Record<string, CommitRowStatus> = {};
            for (const [k, v] of Object.entries(prev)) {
              if (!result.succeededRowKeys.includes(k)) next[k] = v;
            }
            return next;
          });
          traceMap(
            "review_plan_commit_succeeded_with_stale_remaining",
            {
              committed: result.succeededRowKeys.length,
              staleRemaining: remainingCount,
              routeId,
            },
            "warning",
          );
        }
      } else {
        // Partial failure — sheet stays open, failed row keeps
        // its red badge, un-attempted rows stay idle. Drop the
        // committed rows' status entries (they were pruned from
        // plannedMoves above so their row no longer exists).
        if (result.succeededRowKeys.length > 0) {
          setCommitStatusByRow((prev) => {
            const next = { ...prev };
            for (const k of result.succeededRowKeys) delete next[k];
            return next;
          });
        }
        traceMap(
          "review_plan_commit_stopped_on_failure",
          {
            committed: result.succeededRowKeys.length,
            failedRowKey: result.failedRowKey,
            failureAt: result.stoppedAt,
            routeId,
          },
          "error",
        );
      }

      setIsCommitting(false);
    },
    [
      isCommitting,
      plannedMoves,
      liveMenuRoute,
      chipPendingStops,
      rowKeyForMove,
      swapMutation,
      repositionMutation,
    ],
  );

  const handleRequestSwapWithTimes = useCallback(
    (draggedStopId: number, targetStopId: number) => {
      if (!liveMenuRoute) return;
      const windows = computeSwapWindows(
        chipPendingStops,
        draggedStopId,
        targetStopId,
      );
      if (!windows) return;
      const draggedStop = chipPendingStops.find(
        (s) => s.stopId === draggedStopId,
      );
      const targetStop = chipPendingStops.find(
        (s) => s.stopId === targetStopId,
      );
      if (!draggedStop || !targetStop) return;

      // B2-2 (2026-05-22) — Plan-mode fork. When the toggle is ON
      // we stage the move with default times (literal time-trade,
      // same as the mini-sheet's defaultStartHHMM) instead of
      // opening the sheet. The review sheet (B2-4) will let the
      // dispatcher edit those times before committing.
      if (planModeActive) {
        traceMap("drag_reschedule_swap_planned", {
          routeId: liveMenuRoute.routeId,
          draggedStopId,
          targetStopId,
          aDefault: windows.aDefaultStartHHMM,
          bDefault: windows.bDefaultStartHHMM,
        });
        stagePlannedMove({
          kind: "swap",
          aStopId: draggedStopId,
          bStopId: targetStopId,
          aNewStartHHMM: windows.aDefaultStartHHMM,
          bNewStartHHMM: windows.bDefaultStartHHMM,
          aWindow: windows.aWindow,
          bWindow: windows.bWindow,
          aDurationMinutes: windows.aDurationMinutes,
          bDurationMinutes: windows.bDurationMinutes,
        });
        return;
      }

      traceMap("drag_reschedule_swap_open", {
        routeId: liveMenuRoute.routeId,
        draggedStopId,
        targetStopId,
        aDefault: windows.aDefaultStartHHMM,
        bDefault: windows.bDefaultStartHHMM,
      });
      setDragRescheduleState({
        kind: "swap",
        routeId: liveMenuRoute.routeId,
        aStopId: draggedStopId,
        bStopId: targetStopId,
        mode: {
          kind: "swap",
          aSide: {
            appointment: draggedStop,
            durationMinutes: windows.aDurationMinutes,
            window: windows.aWindow,
            defaultStartHHMM: windows.aDefaultStartHHMM,
          },
          bSide: {
            appointment: targetStop,
            durationMinutes: windows.bDurationMinutes,
            window: windows.bWindow,
            defaultStartHHMM: windows.bDefaultStartHHMM,
          },
        },
      });
    },
    [chipPendingStops, liveMenuRoute, planModeActive, stagePlannedMove],
  );

  // Phase 6 (2026-05-22) — INSERT-mode entry point.
  //
  // `insertAtIndex` is the chip-bar's 0-indexed splice-after-removal
  // position; it maps 1:1 onto `computeInsertWindow`'s
  // `insertAtIndex` arg so we don't have to translate coordinate
  // spaces here. The helper returns `null` for stale/out-of-range
  // drops (which the chip bar SHOULDN'T fire but we defend
  // against anyway — the sheet stays closed and the gesture
  // becomes a silent no-op rather than crashing or opening on
  // garbage data).
  //
  // We deliberately do NOT pre-pick the picker's default start
  // time — `<DragRescheduleSheet>` derives it internally via
  // `defaultInsertStartHHMM(window, durationMinutes)` so the
  // midpoint + 15-min snapping logic lives in exactly one place.
  const handleRequestInsertAtPosition = useCallback(
    (draggedStopId: number, insertAtIndex: number) => {
      if (!liveMenuRoute) return;
      const result = computeInsertWindow(
        chipPendingStops,
        draggedStopId,
        insertAtIndex,
      );
      if (!result) return;
      const draggedStop = chipPendingStops.find(
        (s) => s.stopId === draggedStopId,
      );
      if (!draggedStop) return;

      // B2-2 (2026-05-22) — Plan-mode fork. When the toggle is ON
      // we stage the insert with the same midpoint-of-gap default
      // the mini-sheet derives via `defaultInsertStartHHMM`, so
      // the staged time matches what the dispatcher would have
      // seen in the picker.
      if (planModeActive) {
        const defaultStart = defaultInsertStartHHMM(
          result.window,
          result.durationMinutes,
        );
        traceMap("drag_reschedule_insert_planned", {
          routeId: liveMenuRoute.routeId,
          draggedStopId,
          insertAtIndex,
          newStopOrder: result.newStopOrder,
          newStart: defaultStart,
        });
        stagePlannedMove({
          kind: "insert",
          stopId: draggedStopId,
          newStopOrder: result.newStopOrder,
          newStartHHMM: defaultStart,
          window: result.window,
          durationMinutes: result.durationMinutes,
        });
        return;
      }

      traceMap("drag_reschedule_insert_open", {
        routeId: liveMenuRoute.routeId,
        draggedStopId,
        insertAtIndex,
        newStopOrder: result.newStopOrder,
        windowStart: result.window.startHHMM,
        windowEnd: result.window.endHHMM,
        durationMinutes: result.durationMinutes,
      });
      setDragRescheduleState({
        kind: "insert",
        routeId: liveMenuRoute.routeId,
        stopId: draggedStopId,
        newStopOrder: result.newStopOrder,
        mode: {
          kind: "insert",
          appointment: draggedStop,
          durationMinutes: result.durationMinutes,
          window: result.window,
        },
      });
    },
    [chipPendingStops, liveMenuRoute, planModeActive, stagePlannedMove],
  );

  const handleDragRescheduleCancel = useCallback(() => {
    if (dragRescheduleSubmitting) return;
    if (dragRescheduleState) {
      traceMap("drag_reschedule_cancel", {
        routeId: dragRescheduleState.routeId,
        kind: dragRescheduleState.kind,
      });
    }
    setDragRescheduleState(null);
  }, [dragRescheduleSubmitting, dragRescheduleState]);

  const handleDragRescheduleSubmit = useCallback(
    async (payload: DragRescheduleSheetPayload) => {
      if (!dragRescheduleState) return;
      // Mode mismatch guard — if the sheet ever emits a payload
      // shape that doesn't match the state we opened it in, bail
      // out without firing a BE call. Shouldn't happen unless a
      // future refactor mixes the two flows, but the cost of the
      // guard is zero and the cost of a wrong-endpoint write is
      // a corrupted route.
      if (payload.kind !== dragRescheduleState.kind) {
        setDragRescheduleState(null);
        return;
      }

      setDragRescheduleSubmitting(true);
      try {
        if (
          payload.kind === "swap" &&
          dragRescheduleState.kind === "swap"
        ) {
          const { routeId, aStopId, bStopId } = dragRescheduleState;
          // B2-7 (2026-05-22) — only forward the duration override
          // fields when the dispatcher actually stepped them in the
          // sheet. Omitting them preserves the legacy BE payload
          // for unchanged-duration drops.
          await swapMutation.mutateAsync({
            route_id: routeId,
            aStopId,
            bStopId,
            aNewTime: payload.aNewStartHHMM,
            bNewTime: payload.bNewStartHHMM,
            notifyCustomer: payload.notifyCustomer,
            ...(payload.aNewDurationMin !== undefined && {
              aNewDurationMin: payload.aNewDurationMin,
            }),
            ...(payload.bNewDurationMin !== undefined && {
              bNewDurationMin: payload.bNewDurationMin,
            }),
          });
          // Phase 7a (2026-05-22) — the chip-bar pending mirror
          // (`setChipBarPending`) is gone. The swap mutation's
          // onMutate has already swapped stop_orders + times on
          // the map-data cache, and `chipPendingStops` is just
          // a sorted view of that cache. No sibling state to
          // keep in sync anymore.
          traceMap("drag_reschedule_swap_committed", {
            routeId,
            aStopId,
            bStopId,
            notifyCustomer: payload.notifyCustomer,
          });
        } else if (
          payload.kind === "insert" &&
          dragRescheduleState.kind === "insert"
        ) {
          const { routeId, stopId, newStopOrder } = dragRescheduleState;
          await repositionMutation.mutateAsync({
            route_id: routeId,
            stopId,
            newStopOrder,
            newStartTime: payload.newStartHHMM,
            notifyCustomer: payload.notifyCustomer,
            ...(payload.newDurationMin !== undefined && {
              newDurationMin: payload.newDurationMin,
            }),
          });
          // Phase 7a (2026-05-22) — same as the swap branch above:
          // the reposition mutation's onMutate has already bumped
          // `stopOrder` + `scheduledTime` on the target and shifted
          // affected siblings in the map-data cache, and the chip
          // bar reads that cache directly through `chipPendingStops`.
          // No chip-bar pending mirror to update.
          traceMap("drag_reschedule_insert_committed", {
            routeId,
            stopId,
            newStopOrder,
            notifyCustomer: payload.notifyCustomer,
          });
        }
        setDragRescheduleState(null);
      } catch (err) {
        traceMap(
          "drag_reschedule_submit_error",
          {
            routeId: dragRescheduleState.routeId,
            kind: dragRescheduleState.kind,
            message: err instanceof Error ? err.message : String(err),
          },
          "error",
        );
        // Leave the sheet open so the dispatcher can retry. Both
        // mutations' onError already rolled back their optimistic
        // cache patches.
      } finally {
        setDragRescheduleSubmitting(false);
      }
    },
    [dragRescheduleState, swapMutation, repositionMutation],
  );

  // 2026-05-20 round-11 — avatar-tap switches the chip bar.
  //
  // Watches `mapSelectedTechIds` (the avatar strip's selection set).
  // When the chip bar is open AND a tech gets added to the selection:
  //   - if that tech is different from the chip bar's current tech,
  //     switch the chip bar to that tech's first stop. Color, dots,
  //     and focused-route render all follow automatically because
  //     they're all derived from `pendingMenu.routeId` /
  //     `liveMenuRoute`.
  // When the chip bar is open AND the chip bar's own tech is REMOVED
  // from the selection (user untoggled the focused tech):
  //   - close the chip bar.
  // When the chip bar is closed, this effect is a no-op (we still
  // track the previous selection so a future open + tap stays sane).
  //
  // Why `useEffect` + diff instead of a callback prop from the
  // avatar strip: the avatar strip lives in `LandscapeWorkweekView`
  // and reaches us through `useCalendarStore.mapSelectedTechIds`.
  // Adding a "focused tech" callback would require plumbing through
  // LWV; watching the store from here is the minimally-invasive fix.
  const prevMapSelectedTechIdsRef = useRef<number[]>(mapSelectedTechIds);
  useEffect(() => {
    const prev = prevMapSelectedTechIdsRef.current;
    const current = mapSelectedTechIds;
    prevMapSelectedTechIdsRef.current = current;

    if (!pendingMenu || !data) return;

    const focusedTechId = liveMenuRoute?.technicianId;
    if (focusedTechId == null) return;

    const added = current.filter((t) => !prev.includes(t));
    const removed = prev.filter((t) => !current.includes(t));

    if (added.length > 0) {
      // The user just toggled a tech ON. Take the most recent add
      // (last in the diff) as the new focus target. If it matches
      // the chip bar's current tech, no-op — they tapped their own
      // tech, which is fine.
      const newTechId = added[added.length - 1];
      if (newTechId === focusedTechId) return;

      const newRoute = data.routes.find((r) => r.technicianId === newTechId);
      if (!newRoute) return;
      const firstStop = [...newRoute.stops]
        .filter((s) => s.lat != null && s.lng != null)
        .sort((a, b) => a.stopOrder - b.stopOrder)[0];
      if (!firstStop) return;

      traceMap("menu_state_changed", {
        state: "switch_via_avatar_tap",
        prevRouteId: pendingMenu.routeId,
        prevStopId: pendingMenu.stopId,
        nextRouteId: newRoute.routeId,
        nextStopId: firstStop.stopId,
        nextTechId: newTechId,
      });
      setPendingMenu({
        routeId: newRoute.routeId,
        stopId: firstStop.stopId,
      });
      return;
    }

    if (removed.includes(focusedTechId)) {
      // The user removed the chip bar's own tech from the selection.
      // Close the chip bar.
      traceMap("menu_state_changed", {
        state: "closed_via_avatar_untoggle",
        focusedTechId,
      });
      setPendingMenu(null);
    }
  }, [mapSelectedTechIds, pendingMenu, liveMenuRoute, data]);

  const handleMenuReassign = useCallback(() => {
    if (!liveMenuRoute || !liveMenuStop) return;
    traceMap("picker_state_changed", {
      state: "opening",
      appointmentId: liveMenuStop.appointmentId,
      fromTechId: liveMenuRoute.technicianId,
    });
    setPendingMenuReassign({
      appointmentId: liveMenuStop.appointmentId,
      fromTechId: liveMenuRoute.technicianId,
      fromTechName: liveMenuRoute.technicianName,
      summary:
        liveMenuStop.customerName ??
        liveMenuStop.serviceNames ??
        `Stop ${liveMenuStop.stopOrder}`,
    });
    setPendingMenu(null);
  }, [liveMenuRoute, liveMenuStop]);

  const handleCancelMenuReassign = useCallback(() => {
    traceMap("picker_state_changed", { state: "cancelling" });
    setPendingMenuReassign(null);
  }, []);

  const handleConfirmMenuReassign = useCallback(
    (toTechId: number) => {
      if (!pendingMenuReassign) return;
      const startedAt = Date.now();
      const ctx = pendingMenuReassign;
      traceMap("reassign_mutation_fired", {
        surface: "menu-reassign",
        appointmentId: ctx.appointmentId,
        fromTechId: ctx.fromTechId,
        toTechId,
      });
      reassignMutation.mutate(
        {
          appointmentId: ctx.appointmentId,
          fromTechnicianId: ctx.fromTechId,
          toTechnicianId: toTechId,
          franchiseId,
        },
        {
          onSuccess: () => {
            captureMutationOutcome({
              surface: "menu-reassign",
              draggedAppointmentId: ctx.appointmentId,
              fromTechnicianId: ctx.fromTechId,
              toTechnicianId: toTechId,
              outcome: "success",
              elapsedMs: Date.now() - startedAt,
            });
          },
          onError: (err: unknown) => {
            captureMutationOutcome({
              surface: "menu-reassign",
              draggedAppointmentId: ctx.appointmentId,
              fromTechnicianId: ctx.fromTechId,
              toTechnicianId: toTechId,
              outcome: "error",
              errorMessage: err instanceof Error ? err.message : String(err),
              elapsedMs: Date.now() - startedAt,
            });
          },
          onSettled: () => setPendingMenuReassign(null),
        }
      );
    },
    [pendingMenuReassign, reassignMutation, franchiseId]
  );

  // Candidate list for the picker — every route's tech, in the order
  // `data.routes` arrives in. The picker filters out the sender (the
  // `fromTechId` is passed below).
  const reassignCandidates: ReassignPickerCandidate[] = useMemo(() => {
    if (!data) return [];
    return data.routes.map((r) => ({
      technicianId: r.technicianId,
      technicianName: r.technicianName,
      routeColor: colorForRoute(r),
    }));
  }, [data]);

  if (isLoading || !data) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading map...</Text>
      </View>
    );
  }

  if (data.routes.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>No routes for this date</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        // PROVIDER_GOOGLE pins iOS to Google Maps (Android already
        // defaults to Google Maps). Without this, iOS falls back to
        // Apple Maps which renders different tiles, traffic data, and
        // POI styling than Android — the franchise dispatcher view is
        // designed against Google Maps's tile aesthetic + traffic
        // overlay. Requires `ios.config.googleMapsApiKey` in
        // app.config.js (read from the GOOGLE_MAPS_IOS_API_KEY env
        // var, supplied at build time via EAS Secrets).
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude: 39.9612,
          longitude: -82.9988,
          latitudeDelta: 0.5,
          longitudeDelta: 0.5,
        }}
        onMapReady={handleMapReady}
      >
        {/* 2026-05-20 round-9 — solo focus.
            When the chip bar is open (pendingMenu set), the user
            should visually see ONLY the focused route. Closed chip
            bar shows the avatar-strip selection.

            r15.6 (2026-05-21) — MOUNT all RouteLayers
            unconditionally; control focus/visibility via the
            `visible` prop only. Previously this site `.filter()`-ed
            non-focused routes OUT entirely when the chip bar was
            open, which unmounted 8+ RouteLayers (each with N
            markers + polylines + a live marker) as children of
            MapView in a single React commit. AIRMap (the iOS
            native MapView from react-native-maps) cannot handle
            that volume of subview churn safely — a child view
            comes back nil mid-`insertReactSubview:atIndex:` and
            iOS throws NSInvalidArgumentException. See Sentry
            REMI-TECHNICIAN-20 (3 occurrences across r15.3,
            r15.4, r15.5 — the polyline-key fix in r15.5 reduced
            but did not eliminate the churn surface).

            With everything mounted, opening/closing the chip bar
            is purely a prop update — no subview list mutation at
            the MapView level. Mental model is preserved because
            non-focused routes get `visible={false}` and render
            transparent. */}
        {data.routes.map((route) => {
            const color = colorForRoute(route);
            // Phase 7a (2026-05-22) — polyline always renders from
            // the route's current `stop_order` sort. The previous
            // "pending-plan preview" branch (r16.1) is gone — every
            // committed drag now patches the underlying cache via
            // its mutation's onMutate, so the next render naturally
            // reflects the new ordering within ~16ms of Save
            // (cancelling closes the sheet without touching the
            // cache, so the polyline doesn't move at all). The
            // mid-drag pending preview that motivated the original
            // branch is intentionally not restored here; see plan
            // §7c for the optional re-introduction work.
            // B2-3 (2026-05-22) — Focused route in plan mode reads
            // from `displayedFocusedStops` (the planned post-commit
            // order) so the polyline reshapes in real time as the
            // dispatcher stages drops. All other routes use their
            // cache-backed order unchanged. The focused-route
            // identity check is cheap (one `routeId` compare per
            // render-frame per route) and lets the non-focused
            // polylines avoid a needless memo passthrough.
            const isFocusedInPlanMode =
              planModeActive &&
              liveMenuRoute?.routeId === route.routeId &&
              plannedMoves.length > 0;
            const stopsWithCoords = isFocusedInPlanMode
              ? displayedFocusedStops
              : [...route.stops]
                  .filter((s) => s.lat != null && s.lng != null)
                  .sort((a, b) => a.stopOrder - b.stopOrder);
            // r15.6 — when the chip bar is open, ONLY the focused
            // route is visible; everyone else is `visible=false`.
            // When the chip bar is closed, the avatar-strip filter
            // applies. Previously this branch said "if pendingMenu
            // then true" because the filter above had already
            // narrowed to the focused route. Now that we don't
            // filter, the focused-vs-rest distinction lives here.
            const visible = pendingMenu
              ? route.routeId === pendingMenu.routeId
              : isTechVisible(route.technicianId);

            return (
              <RouteLayer
                key={route.routeId}
                route={route}
                stops={stopsWithCoords}
                color={color}
                visible={visible}
                livePosition={techLocationMap.get(route.technicianId)}
                onTap={() => handleTechTap(route.technicianId)}
                onMarkerActionsPress={handleMarkerActionsPress}
              />
            );
          })}
      </MapView>

      {/* Snap-zone Phase 7h (2026-05-22, follow-up) —
          `<MarkerDropConfirmSheet>` was removed here. It only existed
          to confirm a cross-tech reassign initiated by dragging a pin
          onto another tech's pin, but pin dragging is entirely off
          now. The menu-driven reassign (`<MarkerReassignPickerSheet>`,
          mounted below) replaces it. */}

      {/* LDM-WAVE-2 CHUNK-4 (DRAG-3-CONTEXT-MENU) — context-menu sheet
          is mounted-but-invisible (visible=false). Kept here so the
          props remain bound to live data when we re-enable the menu
          UI; the chip bar below is the current presentation. */}
      <MarkerContextMenuSheet
        visible={false}
        customerName={liveMenuStop?.customerName ?? null}
        serviceNames={liveMenuStop?.serviceNames ?? null}
        metaLabel={null}
        canViewDetails={false}
        // r15 chunk 3 — Reschedule row now opens QuickTimeSheet
        // for the appointment behind the tapped marker. The row's
        // "disabled stub" was replaced (PLAN-DEVIATION pivot — the
        // user explicitly chose the QuickTime path over the
        // disabled-row + subtitle pattern).
        canReschedule={!!liveMenuStop}
        canCancel={false}
        canReassign={true}
        onReassign={handleMenuReassign}
        onReschedule={() => {
          if (!liveMenuStop) return;
          setPendingQuickTime({
            appointmentId: liveMenuStop.appointmentId,
            customerName: liveMenuStop.customerName,
          });
          handleCloseMenu();
        }}
        onClose={handleCloseMenu}
      />

      {/* Chip bar reorder — shows when a marker is tapped. Reads the
          live route + stop resolved above; if a refetch removed the
          tapped stop while the menu was open, the chip bar simply
          unmounts (no stale fallback to a different route).
          
          2026-05-20 round-3 changes:
            - `key` forces a FULL remount when routeId changes,
              wiping any internal DraggableFlatList state from the
              previously-tapped route (suspected cause of the "9 dot
              flash" — DraggableFlatList briefly rendering the prior
              route's stop list during reconciliation).
            - `color` derived directly from `colorForRoute` (NOT
              from `colorMap.get` + fallback). Identical to what the
              marker uses, by design — both are pure functions of
              the same routeId. */}
      {pendingMenu && liveMenuRoute && liveMenuStop && (
        <RouteReorderChipBar
          key={`chip-${liveMenuRoute.routeId}`}
          route={liveMenuRoute}
          selectedStopId={liveMenuStop.stopId}
          color={colorForRoute(liveMenuRoute)}
          // Phase 7a (2026-05-22) — chip-bar is presentational
          // again. `pendingOrder` derives directly from the route's
          // current sorted stop list (cache-backed, so it reflects
          // the latest optimistic patch from any swap/reposition
          // mutation). The parent-owned `chipBarPending` /
          // `chipBarCommitting` / Commit-Discard handler chain is
          // retired. See plan §7a.
          //
          // B2-3 (2026-05-22) — When plan mode is active and there
          // are staged moves, `displayedFocusedStops` returns the
          // planned post-commit order; otherwise it's identity-equal
          // to `chipPendingStops`. Single source for both the chip
          // bar AND the focused-route polyline.
          pendingOrder={displayedFocusedStops}
          // Snap-zone Phase 7a kept `onReorder` for the chip-bar
          // legacy fallback (drag-end with neither snap handler
          // matching). In the route-map wiring both snap handlers
          // are always supplied, so this is a true no-op today.
          onReorder={NOOP_REORDER}
          onRequestSwapWithTimes={handleRequestSwapWithTimes}
          onRequestInsertAtPosition={handleRequestInsertAtPosition}
          // B2-1 (2026-05-22) — plan-mode toggle pill in the chip-
          // bar footer. For this chunk the pill is purely cosmetic
          // (no behavior change). B2-2 wires the suppression of
          // <DragRescheduleSheet> when this is true; B2-3 makes
          // the polyline derive from a planned order; B2-4 adds
          // the review-and-commit sheet. See
          // `docs/implementation-plans/chip-bar-plan-mode-batch.md`.
          planModeActive={planModeActive}
          onTogglePlanMode={handleTogglePlanMode}
          // B2-4 (2026-05-22) — the chip-bar's Plan pill morphs
          // into a "{N} · Review" CTA whenever there are staged
          // moves; tapping it opens `<ReviewPlanSheet>` below
          // instead of toggling plan mode off. Toggle-off in
          // the staged-plan state needs a confirm-discard
          // prompt (B2-6) — until then the only paths out of
          // plan mode are committing all moves (B2-5) or
          // removing them one-by-one in the review sheet.
          pendingMoveCount={plannedMoves.length}
          onOpenReviewPlan={handleOpenReviewPlan}
          onReassign={handleMenuReassign}
          onDismiss={handleCloseMenu}
          // r16.7 — tapping a chip on the bar now updates the
          // selected stop (pendingMenu). Previously, tapping a
          // chip only toggled its tooltip; the only way to change
          // the highlighted chip was to tap the matching marker on
          // the map, which was confusing once the bar was open.
          onSelectChip={(stop) => {
            traceMap("chip_bar_select_via_chip_tap", {
              routeId: liveMenuRoute.routeId,
              stopId: stop.stopId,
              previousStopId: liveMenuStop.stopId,
            });
            setPendingMenu({
              routeId: liveMenuRoute.routeId,
              stopId: stop.stopId,
            });
          }}
          // r15 chunk 3 — chip-tooltip tap opens QuickTimeSheet.
          onReschedule={(stop) => {
            traceMap("chip_bar_open_quick_time", {
              routeId: liveMenuRoute.routeId,
              stopId: stop.stopId,
              appointmentId: stop.appointmentId,
            });
            setPendingQuickTime({
              appointmentId: stop.appointmentId,
              customerName: stop.customerName,
            });
          }}
        />
      )}

      {/* r15 chunk 3 — QuickTimeSheet for fast time-only reschedule
          from the chip-bar tooltip. Mounted at the map level so the
          chip bar can pop a sheet without taking on its own visual
          space. Uses MapActionModal (not gorhom) because gorhom
          silently fails to animate around MapView on iOS — same
          pivot as the other map sheets. See quick-time-sheet.tsx. */}
      <QuickTimeSheet
        visible={pendingQuickTime != null}
        appointmentId={pendingQuickTime?.appointmentId ?? null}
        customerName={pendingQuickTime?.customerName ?? null}
        onClose={() => setPendingQuickTime(null)}
        onAdvanced={() => {
          // r15 chunk 3 — Advanced deferred. Until <RescheduleSheet>
          // is ported to MapActionModal (gorhom-around-MapView bug),
          // close QuickTime and tell the user where to find date /
          // notification changes. Cheap to swap out later.
          setPendingQuickTime(null);
          Alert.alert(
            "Date and notification changes",
            "Switch to the Calendar tab and tap this appointment to change the date or notification preferences. Quick time changes here on the map keep the same day.",
          );
        }}
      />

      {/* Phase 4 (2026-05-21) — dual-picker mini-sheet for SWAP-mode
          drag drops on the chip bar. Open: dispatcher dropped chip A
          onto chip B's snap zone → pick explicit start times for both
          sides → submit through the extended `swapStops` mutation
          (with `aNewTime`/`bNewTime`/`notifyCustomer`). Insert-mode
          drops still go through the legacy auto-trade commit chain
          until Phase 6 wires up the single-picker branch end-to-end. */}
      <DragRescheduleSheet
        visible={dragRescheduleState != null}
        mode={dragRescheduleState?.mode ?? null}
        isSubmitting={dragRescheduleSubmitting}
        onSubmit={handleDragRescheduleSubmit}
        onCancel={handleDragRescheduleCancel}
      />

      {/* B2-4 (2026-05-22) — plan-mode batch-review sheet. Opens
          from the chip-bar's morphed "{N} · Review" CTA. Lets the
          dispatcher edit each staged move's start time, remove a
          move from the plan, toggle a shared "Notify customers"
          flag, and commit. Commit is a no-op stub in B2-4; B2-5
          wires the sequential mutation pipeline. Cancel + backdrop
          close the sheet WITHOUT discarding the plan. Visibility
          collapses automatically when `plannedMoves.length` hits
          zero (see the matching `useEffect` above) so the sheet
          never floats over an empty plan. */}
      <ReviewPlanSheet
        visible={reviewSheetVisible}
        rows={reviewPlanRows}
        isSubmitting={isCommitting}
        onAdjustTime={handleReviewAdjustTime}
        onAdjustDuration={handleReviewAdjustDuration}
        onRemove={handleReviewRemove}
        onCommit={handleReviewCommit}
        onCancel={handleCloseReviewPlan}
        onDiscardPlan={handleDiscardPlan}
      />

      {/* LDM-WAVE-2 CHUNK-4 — tech-picker for the Reassign… row. */}
      <MarkerReassignPickerSheet
        visible={pendingMenuReassign != null}
        appointmentSummary={pendingMenuReassign?.summary ?? null}
        fromTechName={pendingMenuReassign?.fromTechName ?? null}
        fromTechId={pendingMenuReassign?.fromTechId ?? null}
        candidates={reassignCandidates}
        isPending={reassignMutation.isPending}
        onCancel={handleCancelMenuReassign}
        onConfirm={handleConfirmMenuReassign}
      />

      {/* LDM-WAVE-1 CHUNK-6 — top chrome slot. Default top is `null`
          (existing FranchiseRouteMap never rendered top chrome), so
          omitting the prop gives the same look. Landscape passes
          <MapPillRow .../> here; portrait still passes nothing. */}
      {resolveSlot(renderTopChrome, null, styles.topSlot)}

      {/* Right-edge slot (zoom + fit). Default = the existing
          zoom/fit cluster, gated on `!fullBleed`. */}
      {resolveSlot(
        renderRightChrome,
        fullBleed ? null : (
          <DefaultRightChrome mapRef={mapRef} fitToRoute={fitToRoute} />
        ),
        styles.rightSlot
      )}

      {isFiltered && data.routes.every((r) => !isTechVisible(r.technicianId)) ? (
        <View
          pointerEvents="none"
          style={[
            styles.emptyOverlay,
            fullBleed ? styles.emptyOverlayFullBleed : null,
          ]}
        >
          <Text style={styles.emptyTitle}>No routes match this filter</Text>
          <Text style={styles.emptyHint}>
            Tap an avatar to bring it back, or {"\"Show All\""} below
          </Text>
        </View>
      ) : null}

      {/* Bottom-edge slot (legend + tech avatar chips). Default =
          the existing legend, gated on `!fullBleed`. */}
      {resolveSlot(
        renderBottomChrome,
        fullBleed ? null : (
          <DefaultBottomLegend
            routes={data.routes}
            mapSelectedTechIds={mapSelectedTechIds}
            isFiltered={isFiltered}
            onTechTap={handleTechTap}
            onClearSelection={clearMapSelection}
          />
        ),
        styles.bottomSlot
      )}

      {/* 2026-05-20 round-3 on-screen debug HUD. See SHOW_ROUTE_MAP_HUD
          declaration at the top of this file for why this exists.
          Remove once the chip-bar flash + color mismatch is confirmed
          fixed (flip the const to false and ship an OTA — leaving
          the panel in place but invisible so it's one line to
          re-enable). */}
      {SHOW_ROUTE_MAP_HUD ? (
        <RouteMapDebugHud
          buildStamp={ROUTE_MAP_BUILD_STAMP}
          pendingMenu={pendingMenu}
          liveMenuRoute={liveMenuRoute}
          liveMenuStop={liveMenuStop}
          lastTapEvent={lastTapEvent}
          totalRoutes={data.routes.length}
        />
      ) : null}
    </View>
  );
}

interface RouteMapDebugHudProps {
  buildStamp: string;
  pendingMenu: { routeId: number; stopId: number } | null;
  liveMenuRoute: MapRoute | null;
  liveMenuStop: MapStop | null;
  lastTapEvent: {
    routeId: number;
    stopId: number;
    technicianName: string;
    color: string;
    ts: number;
    seq: number;
  } | null;
  totalRoutes: number;
}

function RouteMapDebugHud({
  buildStamp,
  pendingMenu,
  liveMenuRoute,
  liveMenuStop,
  lastTapEvent,
  totalRoutes,
}: RouteMapDebugHudProps) {
  const liveColor = liveMenuRoute ? colorForRoute(liveMenuRoute) : null;
  const matches =
    lastTapEvent && liveMenuRoute
      ? lastTapEvent.routeId === liveMenuRoute.routeId &&
        lastTapEvent.color === liveColor
      : null;
  const locatedCount = liveMenuRoute
    ? liveMenuRoute.stops.filter((s) => s.lat != null && s.lng != null).length
    : 0;
  const tapAge = lastTapEvent ? Date.now() - lastTapEvent.ts : null;

  // 2026-05-21 — Force-update button rewritten to be a real
  // diagnostic + recovery tool. The previous version (r4) only
  // called reloadAsync() when checkForUpdateAsync returned
  // isAvailable: true. That misses the most common stuck-OTA
  // scenario: the new bundle was already downloaded in the
  // background and is sitting in local cache, but the running JS
  // bundle is still the old one. In that case
  // checkForUpdateAsync returns isAvailable: false (server has
  // nothing newer than what's locally stored), but reloadAsync
  // would happily apply the cached new bundle.
  //
  // This version:
  //   1. Always tries reloadAsync at the end, regardless of
  //      isAvailable, so a pending-cached update gets applied
  //      without needing iOS to do a true cold launch (which
  //      iOS often won't — swipe-up frequently just suspends
  //      instead of terminating, leaving the JS context alive
  //      and the pending update unapplied).
  //   2. Surfaces the `reason` field from checkForUpdateAsync
  //      when isAvailable is false. expo-updates v29's reason
  //      values include "noUpdateAvailable", "rolledBack",
  //      "updateAlreadyDownloaded", etc. Knowing which one is
  //      firing tells us whether the bundle is stuck at "not
  //      yet downloaded" (server issue), "downloaded but not
  //      applied" (cache issue), or "rolled back due to error"
  //      (bundle issue).
  //   3. Logs the local cache state via Updates.useUpdates
  //      adjacent props (updateId of currently running, plus
  //      isUpdateAvailable / isUpdatePending if exposed).
  //
  // If `reloadAsync` doesn't recover the device, the only
  // remaining path is reinstalling the IPA from EAS, which
  // wipes the on-device expo-updates storage.
  const [otaState, setOtaState] = useState<string>("idle");
  const handleForceUpdate = useCallback(async () => {
    try {
      setOtaState("checking server...");
      const check = await Updates.checkForUpdateAsync();
      if (check.isAvailable) {
        setOtaState("fetching new bundle...");
        const fetched = await Updates.fetchUpdateAsync();
        if (!fetched.isNew) {
          setOtaState("server had update but fetch isNew=false (cached)");
        } else {
          setOtaState("fetched new bundle, reloading...");
        }
      } else {
        // Capture the reason. The narrowed union from the
        // expo-updates types doesn't include `reason` in this
        // branch, so cast through unknown to read it for
        // diagnostic display.
        const reason =
          (check as unknown as { reason?: string }).reason ?? "unknown";
        setOtaState(
          `server: no newer than cache (${reason}) — trying reload to apply pending...`,
        );
      }
      // Always reload at the end. If the bundle just fetched is
      // newer than the running bundle, reloadAsync applies it. If
      // a previously-cached bundle is pending apply, reloadAsync
      // applies that. If nothing's pending, reloadAsync just
      // reloads the current bundle (harmless).
      await Updates.reloadAsync();
    } catch (e) {
      setOtaState(`error: ${String(e).slice(0, 100)}`);
    }
  }, []);

  // Current Update info — lets us see at a glance what bundle is
  // actually loaded vs. the build stamp baked into JS. If they
  // disagree, the bundle did update but the JS we're looking at is
  // out of date with the OTA.
  const currentUpdateId = Updates.updateId ?? "(embedded)";
  const isEmergencyLaunch = Updates.isEmergencyLaunch;
  const channel = Updates.channel ?? "(none)";

  return (
    <View pointerEvents="box-none" style={hudStyles.container}>
      <Text style={hudStyles.title}>
        MAP HUD {buildStamp} ({totalRoutes} routes)
      </Text>

      <Text style={hudStyles.label}>last tap</Text>
      {lastTapEvent ? (
        <View style={hudStyles.row}>
          <View
            style={[hudStyles.swatch, { backgroundColor: lastTapEvent.color }]}
          />
          <Text style={hudStyles.value}>
            #{lastTapEvent.seq} r{lastTapEvent.routeId} s{lastTapEvent.stopId}{" "}
            {lastTapEvent.technicianName} • {lastTapEvent.color}
            {tapAge != null ? ` • ${tapAge}ms ago` : ""}
          </Text>
        </View>
      ) : (
        <Text style={hudStyles.value}>(none yet)</Text>
      )}

      <Text style={hudStyles.label}>pendingMenu</Text>
      <Text style={hudStyles.value}>
        {pendingMenu
          ? `r${pendingMenu.routeId} s${pendingMenu.stopId}`
          : "null"}
      </Text>

      <Text style={hudStyles.label}>liveMenuRoute</Text>
      {liveMenuRoute && liveColor ? (
        <View style={hudStyles.row}>
          <View style={[hudStyles.swatch, { backgroundColor: liveColor }]} />
          <Text style={hudStyles.value}>
            r{liveMenuRoute.routeId} • {liveMenuRoute.technicianName} •{" "}
            {locatedCount}/{liveMenuRoute.stops.length} stops • {liveColor}
          </Text>
        </View>
      ) : (
        <Text style={hudStyles.value}>null</Text>
      )}

      <Text style={hudStyles.label}>liveMenuStop</Text>
      <Text style={hudStyles.value}>
        {liveMenuStop ? `stopOrder=${liveMenuStop.stopOrder}` : "null"}
      </Text>

      {matches != null ? (
        <Text
          style={[
            hudStyles.value,
            { color: matches ? "#22C55E" : "#EF4444", marginTop: 4 },
          ]}
        >
          tap↔live {matches ? "✓ match" : "✗ MISMATCH"}
        </Text>
      ) : null}

      <View style={hudStyles.divider} />

      <Text style={hudStyles.label}>OTA bundle</Text>
      <Text style={hudStyles.value}>
        ch={channel} • id={currentUpdateId.slice(0, 12)}
        {isEmergencyLaunch ? " • EMERGENCY" : ""}
      </Text>
      <Pressable style={hudStyles.button} onPress={handleForceUpdate}>
        <Text style={hudStyles.buttonText}>Force OTA Update</Text>
      </Pressable>
      <Text style={hudStyles.value}>{otaState}</Text>
    </View>
  );
}

const hudStyles = StyleSheet.create({
  container: {
    position: "absolute",
    // 2026-05-20 round-5 — moved to top-left so it stops overlapping
    // the chip bar at the bottom. The chip bar was visually obscured
    // by the dark translucent HUD background and the user couldn't
    // see whether the dots were actually colored or not.
    top: 8,
    left: 8,
    maxWidth: 360,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "rgba(17,24,39,0.85)",
  },
  title: {
    color: "#F9FAFB",
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 4,
  },
  label: {
    color: "#9CA3AF",
    fontSize: 9,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    color: "#F9FAFB",
    fontSize: 10,
    fontFamily: "Menlo",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginTop: 8,
    marginBottom: 2,
  },
  button: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#3B82F6",
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
});

// ---------------------------------------------------------------------------
// LDM-WAVE-1 CHUNK-6 — chrome slot helpers.
// ---------------------------------------------------------------------------

/**
 * Three-state slot resolver: undefined → default, null → nothing,
 * ReactNode → wrap in a positioned container so the consumer doesn't
 * have to know about the absolute-positioning math.
 *
 * The `positionStyle` parameter pins the slot to the correct edge
 * (top / right / bottom) so callers passing a flat `<MapPillRow>`
 * don't have to compose their own positioned wrapper.
 */
function resolveSlot(
  slot: ReactNode | null | undefined,
  fallback: ReactNode | null,
  positionStyle: object
): ReactNode {
  if (slot === null) return null;
  const node = slot === undefined ? fallback : slot;
  if (node === null) return null;
  return <View style={positionStyle}>{node}</View>;
}

interface DefaultRightChromeProps {
  mapRef: React.RefObject<MapView | null>;
  fitToRoute: () => void;
}

function DefaultRightChrome({ mapRef, fitToRoute }: DefaultRightChromeProps) {
  return (
    <>
      <Pressable
        style={styles.controlBtn}
        onPress={() => {
          mapRef.current?.getCamera().then((cam) => {
            if (cam.zoom != null) {
              mapRef.current?.animateCamera(
                { zoom: cam.zoom + 1 },
                { duration: 200 }
              );
            } else if (cam.altitude != null) {
              mapRef.current?.animateCamera(
                { altitude: cam.altitude / 2 },
                { duration: 200 }
              );
            }
          });
        }}
      >
        <MaterialIcons name="add" size={22} color="#374151" />
      </Pressable>
      <Pressable
        style={styles.controlBtn}
        onPress={() => {
          mapRef.current?.getCamera().then((cam) => {
            if (cam.zoom != null) {
              mapRef.current?.animateCamera(
                { zoom: cam.zoom - 1 },
                { duration: 200 }
              );
            } else if (cam.altitude != null) {
              mapRef.current?.animateCamera(
                { altitude: cam.altitude * 2 },
                { duration: 200 }
              );
            }
          });
        }}
      >
        <MaterialIcons name="remove" size={22} color="#374151" />
      </Pressable>
      <Pressable style={styles.controlBtn} onPress={fitToRoute}>
        <MaterialIcons name="fit-screen" size={22} color="#374151" />
      </Pressable>
    </>
  );
}

interface DefaultBottomLegendProps {
  routes: MapRoute[];
  mapSelectedTechIds: number[];
  isFiltered: boolean;
  onTechTap: (technicianId: number) => void;
  onClearSelection: () => void;
}

function DefaultBottomLegend({
  routes,
  mapSelectedTechIds,
  isFiltered,
  onTechTap,
  onClearSelection,
}: DefaultBottomLegendProps) {
  // 2026-05-25 — surface "N appointment(s) not on map (no address)"
  // hint. `<AppointmentMarker>` returns null when stop.lat/lng is
  // null (see appointment-marker.tsx:174), so any stop whose
  // appointment lacks an `address_id` (or whose address has no
  // geocode) silently drops off the map. Without this hint the FO
  // can't tell which jobs are invisible — they just see a smaller
  // map than the day actually contains. Tapping the chip shows the
  // affected customer names so the FO knows whose record to fix.
  const missingAddressStops = useMemo(() => {
    const items: { customerName: string; technicianName: string }[] = [];
    for (const r of routes) {
      for (const s of r.stops) {
        if (s.lat == null || s.lng == null) {
          items.push({
            customerName: s.customerName ?? "(unknown customer)",
            technicianName: r.technicianName,
          });
        }
      }
    }
    return items;
  }, [routes]);

  const [showMissingDetail, setShowMissingDetail] = useState(false);

  return (
    <View style={styles.bottomLegendCol}>
      {missingAddressStops.length > 0 ? (
        <Pressable
          style={styles.missingHintRow}
          onPress={() => setShowMissingDetail((v) => !v)}
        >
          <MaterialIcons name="info-outline" size={14} color="#B45309" />
          <Text style={styles.missingHintText} numberOfLines={1}>
            {missingAddressStops.length} appointment
            {missingAddressStops.length === 1 ? "" : "s"} not on map (no
            address)
          </Text>
          <MaterialIcons
            name={showMissingDetail ? "expand-less" : "expand-more"}
            size={16}
            color="#B45309"
          />
        </Pressable>
      ) : null}

      {showMissingDetail && missingAddressStops.length > 0 ? (
        <View style={styles.missingDetailList}>
          {missingAddressStops.map((m, i) => (
            <Text key={`${m.customerName}-${i}`} style={styles.missingDetailItem}>
              • {m.customerName} ({m.technicianName})
            </Text>
          ))}
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.legendScroll}
      >
        {isFiltered && (
          <Pressable style={styles.showAllBtn} onPress={onClearSelection}>
            <Text style={styles.showAllText}>Show All</Text>
          </Pressable>
        )}
        {routes.map((route) => {
          const color = colorForRoute(route);
          const isSelected = mapSelectedTechIds.includes(route.technicianId);
          return (
            <TechAvatarChip
              key={route.routeId}
              name={route.technicianName}
              color={color}
              isSelected={isSelected}
              isFiltered={isFiltered}
              onPress={() => onTechTap(route.technicianId)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

interface RouteLayerProps {
  route: MapRoute;
  stops: MapStop[];
  color: string;
  visible: boolean;
  livePosition?: { lat: number; lng: number };
  onTap: (routeId: number) => void;
  /**
   * LDM-WAVE-2 CHUNK-4 (DRAG-3-CONTEXT-MENU) — Callout-Actions tap
   * callback. Fires when the user taps a marker's Callout. Parent
   * opens `<MarkerContextMenuSheet>` for the (stop, route) pair.
   *
   * Snap-zone Phase 7h (2026-05-22, follow-up) — `onMarkerDragEnd`
   * removed alongside the drag-driven reassign path. Markers are
   * not draggable; cross-tech reassign is menu-only now.
   */
  onMarkerActionsPress: (stop: MapStop, route: MapRoute) => void;
}

function RouteLayer({
  route,
  stops,
  color,
  visible,
  livePosition,
  onTap,
  onMarkerActionsPress,
}: RouteLayerProps) {
  return (
    <>
      {/* r15.6 (2026-05-21) — KEEP polylines mounted even when
          `visible` is false. Hide via `strokeColor="transparent"` +
          `strokeWidth=0` + `tappable={false}` so they don't steal
          taps and don't add visual weight. Reverses r14's
          "just don't render when hidden" decision.

          Why this reverts r14: r14's concern was a ghost-tap bug
          when the polyline is z-ordered above visible content.
          With `tappable={false}` the polyline cannot receive a tap
          regardless of z-order, so the ghost-tap risk is closed.
          The cost of keeping polylines mounted is essentially zero
          (transparent MapKit overlays consume negligible memory
          and never repaint). The cost of unmounting them is the
          AIRMap crash documented in Sentry REMI-TECHNICIAN-20 —
          rapidly mounting/unmounting MapView children races with
          AIRMap's `insertReactSubview:atIndex:` and lets a nil
          subview slip through, fatally. Trade-off is unambiguous. */}
      {stops.map((stop, index) => {
        if (index === 0) return null;
        const prev = stops[index - 1];
        const segColor = segmentColor(prev, stop, color);
        const isDone = segColor === "#D1D5DB";
        // 2026-05-25 — Real-route polyline. The BE persists the
        // encoded path on the DESTINATION stop's row (mirrors
        // `drive_time_from_previous_min` directionality). Falls
        // back to a straight line between centroids when the
        // backend hasn't computed the leg yet (route just
        // created, Routes API soft-failed, or stop lacks
        // geocoded lat/lng). The straight-line fallback keeps
        // the map looking complete during the brief window
        // before the post-commit polyline refresh lands.
        const decoded = decodePolyline(stop.encodedPolyline);
        const coordinates =
          decoded.length >= 2
            ? decoded
            : [
                { latitude: prev.lat!, longitude: prev.lng! },
                { latitude: stop.lat!, longitude: stop.lng! },
              ];
        return (
          <Polyline
            // r15.5 stable key — see history below. Key intentionally
            // does NOT include `visible` or `segColor` so the native
            // overlay updates in place when those change instead of
            // remounting (a remount = subview list churn = AIRMap
            // crash risk).
            //
            // r15.5 (2026-05-21) — moved from
            //   `seg-${routeId}-${prev.stopId}-${stop.stopId}-${segColor}`
            // to `seg-${routeId}-${index}` because a chip-drag swap
            // exchanges stop_order between two stops; the
            // sort-by-order'd `stops` array shifts; ~every
            // segment's (prev, next) pair changes; every polyline
            // would unmount + remount. Now `index` is stable
            // across swaps so polylines update props in place.
            key={`seg-${route.routeId}-${index}`}
            coordinates={coordinates}
            strokeColor={visible ? segColor : "transparent"}
            strokeWidth={visible ? (isDone ? 2 : 3) : 0}
            lineDashPattern={visible && isDone ? [4, 4] : undefined}
            tappable={visible}
            onPress={visible ? () => onTap(route.routeId) : undefined}
          />
        );
      })}

      {stops.map((stop) => (
        // 2026-05-20 round-4 fix — include `color` in the key.
        // <AppointmentMarker> renders an iOS-native
        // AIRMapMarker with `tracksViewChanges={false}` for perf
        // (re-rasterizing the marker bitmap on every render kills
        // the framerate when there are 30+ markers). The cached
        // bitmap is invalidated only when the React node remounts.
        // Without color in the key, when colorForRoute returns a
        // new color for the SAME routeId (e.g., palette change, or
        // — the actual bug we just hit — switching from the old
        // index-based color formula to the new id-based formula
        // via OTA) the JSX style updates but the native bitmap
        // stays at the OLD color forever. Adding `color` to the
        // key forces a full unmount/remount when the resolved
        // color changes, which busts the bitmap cache.
        <AppointmentMarker
          key={`drag-stop-${route.routeId}-${stop.stopId}-${color}`}
          route={route}
          stop={stop}
          color={color}
          visible={visible}
          onTap={onTap}
          onActionsPress={onMarkerActionsPress}
        />
      ))}

      {/* 2026-05-25 — Per-leg drive-time labels. One small marker
          per non-first stop, anchored at the midpoint of the
          decoded polyline (or the midpoint of the straight-line
          fallback when no polyline is computed yet). Shows
          "Xm" so the operator can read the leg duration without
          tapping anything. Hidden when the FE is in hide-mode
          for this route OR when the BE hasn't computed a
          duration for this leg yet. */}
      {visible &&
        stops.map((stop, index) => {
          if (index === 0) return null;
          const minutes = stop.driveTimeFromPreviousMin;
          if (minutes == null) return null;
          const prev = stops[index - 1];
          const decoded = decodePolyline(stop.encodedPolyline);
          const midDecoded = polylineMidpoint(decoded);
          // Compute a reasonable midpoint for the straight-line
          // fallback — average of the two stop coords.
          const midFallback =
            prev.lat != null &&
            prev.lng != null &&
            stop.lat != null &&
            stop.lng != null
              ? {
                  latitude: (prev.lat + stop.lat) / 2,
                  longitude: (prev.lng + stop.lng) / 2,
                }
              : null;
          const anchor = midDecoded ?? midFallback;
          if (!anchor) return null;
          const label =
            minutes < 1
              ? "<1m"
              : minutes < 60
                ? `${Math.round(minutes)}m`
                : `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
          return (
            <Marker
              key={`drive-time-${route.routeId}-${index}`}
              coordinate={anchor}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              zIndex={50}
            >
              <View style={styles.driveTimeBubble}>
                <Text style={styles.driveTimeText}>{label}</Text>
              </View>
            </Marker>
          );
        })}

      {/* r15.6 (2026-05-21) — KEEP the live marker mounted when
          `visible` is false. Hide via `opacity={0}` and disable
          taps. Same AIRMap subview-churn reasoning as the
          polylines above. r14's "just don't render when hidden"
          decision is reversed for the same trade-off: a hidden
          opacity-0 marker can't be tapped or seen, and the
          alternative (subview list mutation on visibility toggle)
          crashes iOS. */}
      {livePosition && (
        // 2026-05-20 round-6 — `key` includes color so a palette
        // change forces a fresh native view. `tracksViewChanges`
        // is `true` because there is only one live-position marker
        // per visible tech and the perf cost of always-tracking is
        // negligible. The cost of getting it wrong (stale color
        // forever) is large; not worth optimizing.
        //
        // r15.6 note: `tracksViewChanges=true` is necessary so the
        // marker visually repaints when `opacity` changes between
        // visible/hidden states — without it the native bitmap
        // wouldn't refresh on prop change.
        <Marker
          key={`live-${route.routeId}-${color}`}
          coordinate={{
            latitude: livePosition.lat,
            longitude: livePosition.lng,
          }}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={true}
          opacity={visible ? 1 : 0}
          onPress={visible ? () => onTap(route.routeId) : undefined}
        >
          <View style={[styles.liveMarkerOuter, { borderColor: color }]}>
            <View style={[styles.liveMarkerInner, { backgroundColor: color }]} />
          </View>
          <Callout>
            <View style={styles.callout}>
              <Text style={styles.calloutTitle}>{route.technicianName}</Text>
              <Text style={styles.calloutSub}>Live position</Text>
            </View>
          </Callout>
        </Marker>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    fontSize: 15,
    color: "#9CA3AF",
  },
  stopMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  stopMarkerText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
  },
  liveMarkerOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  liveMarkerInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  callout: {
    padding: 4,
    minWidth: 130,
  },
  calloutTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  calloutSub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  calloutMeta: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 2,
  },
  // LDM-WAVE-1 CHUNK-6 — slot wrappers.
  topSlot: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  rightSlot: {
    position: "absolute",
    right: 12,
    top: 12,
    gap: 6,
  },
  bottomSlot: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingVertical: 10,
  },
  controlBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  legendScroll: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: "center",
  },
  bottomLegendCol: {
    flexDirection: "column",
  },
  missingHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 8,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  missingHintText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#92400E",
  },
  missingDetailList: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 8,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  missingDetailItem: {
    fontSize: 12,
    color: "#78350F",
    lineHeight: 18,
  },
  // 2026-05-25 — Per-leg drive-time bubble pinned at the polyline
  // midpoint. Small high-contrast pill so it reads at a glance
  // without overpowering the route line.
  driveTimeBubble: {
    backgroundColor: "rgba(17, 24, 39, 0.92)",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    minWidth: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
  driveTimeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  showAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#3B82F6",
  },
  showAllText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  emptyOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 60,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  emptyOverlayFullBleed: {
    bottom: 0,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  emptyHint: {
    marginTop: 6,
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
});
