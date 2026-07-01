/**
 * `<AppointmentMarker>` (LDM-WAVE-2 CHUNK-4) — wrapper around
 * `react-native-maps`' native `<Marker>` for an appointment pin.
 *
 * Snap-zone Phase 7h (2026-05-22, follow-up) — renamed from
 * `<DraggableAppointmentMarker>` (file: `draggable-appointment-marker.tsx`)
 * when pin dragging was removed. The "Draggable" prefix described
 * the old behavior; the marker now only handles single-tap to open
 * the context menu, so the name is misleading.
 *
 * Single-tap on the pin → `onActionsPress(stop, route)` fires so the
 * parent opens `<MarkerContextMenuSheet>` directly. The menu sheet
 * itself shows the appointment info (customer, service, tech, time)
 * and offers the per-appointment actions (Reschedule, Reassign…).
 *
 * PLAN-DEVIATION: 2026-05-22-snap-zone-replaces-pin-drag —
 *   The component used to be draggable (LDM-WAVE-2 CHUNK-3 /
 *   `DRAG-2-PIN`): long-press → drag pin → drop to reorder within a
 *   route or reassign across techs. The chip-bar snap-zone rescheduler
 *   replaced same-route reorder end-to-end, and cross-tech reassign
 *   moved to the explicit menu path (single-tap → "Actions" →
 *   "Reassign…"). Pin dragging is now entirely off — the native
 *   `<Marker>` no longer passes `draggable`, no `onDragEnd` callback
 *   wires through, and the drop-dispatcher / confirm-sheet
 *   plumbing has been deleted.
 *   See docs/PLAN-DEVIATIONS.md#2026-05-22-snap-zone-replaces-pin-drag.
 *
 * PLAN-DEVIATION: 2026-05-17-drop-callout-for-tap-to-menu —
 *   The first CHUNK-4 implementation used a native iOS `<Callout>`
 *   with an "Actions" row inside (`<CalloutSubview>`) as the menu
 *   trigger. After multiple rounds of debugging on-device, the iOS
 *   native Callout was unstable for this use case (closing on its
 *   own before the user could reach the Actions chevron). We pivoted
 *   to single-tap → direct menu open, no Callout layer involved.
 *   See docs/PLAN-DEVIATIONS.md#2026-05-17-drop-callout-for-tap-to-menu.
 *
 * Menu state lives in the parent `<FranchiseRouteMap>`: this component
 * just relays `onActionsPress(stop, route)` upward.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View, Text } from "react-native";
import { Marker } from "react-native-maps";
import type { MapStop, MapRoute } from "@technician/types/api";
import {
  traceMap,
  traceMarkerGesture,
} from "@technician/utils/sentry-map-diagnostics";

const DONE_STATUSES = new Set(["completed", "skipped"]);

export interface AppointmentMarkerProps {
  route: MapRoute;
  stop: MapStop;
  color: string;
  /**
   * Whether the route's polyline + marker should render visibly. When
   * a map-multi-select filter is active and this stop's tech isn't in
   * the selection, the parent dims the marker via `visible={false}`.
   */
  visible: boolean;
  /**
   * Fires on single-tap when `onActionsPress` is NOT wired. Defaults
   * to the route-focus tap (the pre-CHUNK-3 onPress behavior,
   * preserved here for back-compat). When `onActionsPress` IS wired
   * it takes precedence and this is ignored.
   */
  onTap?: (routeId: number) => void;
  /**
   * LDM-WAVE-2 CHUNK-4 (`DRAG-3-CONTEXT-MENU`) — fires on single-tap.
   * Parent opens `<MarkerContextMenuSheet>` for this `(stop, route)`
   * pair. When omitted, single-tap falls back to `onTap` (route focus).
   */
  onActionsPress?: (stop: MapStop, route: MapRoute) => void;
}

export function AppointmentMarker({
  route,
  stop,
  color,
  visible,
  onTap,
  onActionsPress,
}: AppointmentMarkerProps) {
  // 2026-05-17 deploy diagnostic: marker mount/unmount breadcrumb.
  // If the menu sheet appears to "close immediately" and we see
  // unmount breadcrumbs shortly after each tap, the React tree is
  // remounting the Marker. Stable mount = bug is elsewhere (e.g.,
  // tracksViewChanges flip, parent re-render).
  useEffect(() => {
    traceMap("marker_component_mount", {
      appointmentId: stop.appointmentId,
      routeId: route.routeId,
      technicianId: route.technicianId,
    });
    return () => {
      traceMap("marker_component_unmount", {
        appointmentId: stop.appointmentId,
        routeId: route.routeId,
        technicianId: route.technicianId,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2026-05-20 round-6 — color/visibility cache bust.
  //   `<Marker>` with `tracksViewChanges={false}` (set for perf when
  //   30+ markers are on screen) leaves the marker's native bitmap
  //   cached. When `color` changes (e.g., the OTA series that switched
  //   from index-based to id-based palette assignment) the JSX prop
  //   updates but the cached native bitmap doesn't redraw — markers
  //   stay at their old color forever. Adding `color` to the React key
  //   alone was not enough — `AIRMapMarker` is pooled and reuses the
  //   bitmap cache across React mount cycles.
  //
  //   The fix is a brief tracking-on window. We flip `trackingFlash`
  //   true on mount and on every `color` change, then drop it back to
  //   `false` after 250 ms so the native marker re-rasterizes once and
  //   the perf cache kicks back in.
  //
  // Snap-zone Phase 7h (2026-05-22, follow-up) — this state used to
  // double as a drag-end snap-back signal (renamed from
  // `trackingAfterDrag`). Pin dragging is gone now, so the only thing
  // left that flips this state is the color/mount path.
  const [trackingFlash, setTrackingFlash] = useState(true);
  useEffect(() => {
    traceMap("marker_tracks_view_changes", {
      tracksViewChanges: trackingFlash,
      appointmentId: stop.appointmentId,
      color,
    });
    if (!trackingFlash) return;
    const t = setTimeout(() => setTrackingFlash(false), 250);
    return () => clearTimeout(t);
  }, [trackingFlash, stop.appointmentId, color]);

  useEffect(() => {
    setTrackingFlash(true);
  }, [color]);

  // --- Ref-stable callbacks for react-native-maps native markers ---
  // Native AIRMapMarker retains a pointer to the JS callback passed via
  // onSelect. If the callback is recreated (new closure) on a React
  // re-render, hermes may GC the old closure while native still holds
  // it → EXC_BAD_ACCESS on next tap. The fix: hold mutable values in
  // refs, give native a STABLE function that reads from the refs at
  // invocation time.
  const stopRef = useRef(stop);
  const routeRef = useRef(route);
  const onActionsPressRef = useRef(onActionsPress);
  const onTapRef = useRef(onTap);

  useEffect(() => { stopRef.current = stop; }, [stop]);
  useEffect(() => { routeRef.current = route; }, [route]);
  useEffect(() => { onActionsPressRef.current = onActionsPress; }, [onActionsPress]);
  useEffect(() => { onTapRef.current = onTap; }, [onTap]);

  const handleMarkerPress = useCallback(() => {
    const s = stopRef.current;
    const r = routeRef.current;
    traceMarkerGesture({
      kind: "tap",
      appointmentId: s.appointmentId,
      routeId: r.routeId,
      technicianId: r.technicianId,
    });
    if (onActionsPressRef.current) {
      onActionsPressRef.current(s, r);
    } else if (onTapRef.current) {
      onTapRef.current(r.routeId);
    }
  }, []);

  if (stop.lat == null || stop.lng == null) return null;

  // r15.6 (2026-05-21) — KEEP the marker mounted even when
  // `visible` is false. Hide via `opacity={0}` and disable `onSelect`
  // so it can't be tapped.
  //
  // Why we can't just return null: that unmounts the underlying
  // AIRMapMarker as a child of MapView. When several markers do that
  // simultaneously (toggle a tech → 5–10 markers unmount at once;
  // open/close chip bar with the route-focus filter → 30+ markers
  // churn at once), the rapid subview list mutation races with
  // AIRMap's `insertReactSubview:atIndex:` and a nil subview slips
  // through → fatal NSInvalidArgumentException. Sentry REMI-TECHNICIAN-20.
  //
  // Trade-off: invisible markers consume taps that would otherwise
  // hit the map directly. The user may need to retry a tap that
  // landed on an invisible annotation. Annoying but not destructive;
  // a crash is destructive.

  const isDone = DONE_STATUSES.has(stop.status);
  const markerColor = isDone ? "#D1D5DB" : color;

  return (
    <Marker
      key={`stop-${route.routeId}-${stop.stopId}`}
      coordinate={{ latitude: stop.lat, longitude: stop.lng }}
      // r15.6 note: tracksViewChanges must stay live-ish so opacity
      // changes between visible/hidden actually repaint the bitmap.
      // The `trackingFlash` timer above flickers tracking on for
      // 250 ms after color/visibility changes, which is enough.
      tracksViewChanges={trackingFlash}
      opacity={visible ? 1 : 0}
      onSelect={visible ? handleMarkerPress : undefined}
    >
      <View style={[styles.stopMarker, { backgroundColor: markerColor }]}>
        <Text style={styles.stopMarkerText}>{stop.stopOrder}</Text>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  stopMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  stopMarkerText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
});
