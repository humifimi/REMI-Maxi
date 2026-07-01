/**
 * Tests for `<AppointmentMarker>` (LDM-WAVE-2 CHUNK-4) — renamed
 * from `<AppointmentMarker>` when pin dragging was removed
 * (Snap-zone Phase 7h follow-up, 2026-05-22).
 *
 * Asserts:
 *   - When `onActionsPress` is provided, tapping the marker fires
 *     `onActionsPress(stop, route)` directly (no Callout in between).
 *   - When `onActionsPress` is omitted but `onTap` is provided, the
 *     legacy `onTap(routeId)` fallback fires.
 *   - When neither is provided, single-tap is silent.
 *   - `tracksViewChanges` flips off after the initial mount-flash so
 *     the perf cache can take over.
 *
 * Hermetic — stubs `react-native-maps` so `<Marker>` renders as a
 * plain pressable View. After the 2026-05-17 Callout drop, this
 * component renders NO Callout / CalloutSubview, so those mocks have
 * been removed.
 *
 * Snap-zone Phase 7h (2026-05-22, follow-up) — the drag-end test and
 * `onDragEnd` prop are gone. Pin dragging is fully off; the only
 * gesture the marker exposes is single-tap → `onSelect`. The mock
 * therefore reads `onSelect` (not `onPress`) and the drag tap-target
 * was removed.
 */

/* eslint-disable import/no-unresolved */

import React, { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

// Capture the `tracksViewChanges` prop the production code passes to
// the native Marker on each render so the tracks-flash test can
// assert the flip-back-to-false after the 250ms mount window.
const markerTrackingProps: (boolean | undefined)[] = [];

jest.mock("react-native-maps", () => {
  const React = jest.requireActual("react");
  const { View, Pressable } = jest.requireActual("react-native");
  const MockMarker = (props: {
    children?: React.ReactNode;
    coordinate?: unknown;
    tracksViewChanges?: boolean;
    onSelect?: () => void;
  }) => {
    markerTrackingProps.push(props.tracksViewChanges);
    return React.createElement(
      View,
      {
        testID: "mock-marker",
      },
      // Tap target for marker onSelect (single-tap to open menu).
      React.createElement(Pressable, {
        testID: "mock-marker-press",
        accessibilityLabel: "marker-press",
        onPress: props.onSelect,
      }),
      props.children,
    );
  };
  return {
    __esModule: true,
    default: MockMarker,
    Marker: MockMarker,
  };
});

import { AppointmentMarker } from "../appointment-marker";
import type { MapStop, MapRoute } from "@technician/types/api";

const STOP: MapStop = {
  stopId: 99,
  appointmentId: 1001,
  stopOrder: 3,
  lat: 39.96,
  lng: -82.99,
  customerName: "Test Customer",
  addressLine: "100 Main St",
  city: "Columbus",
  scheduledTime: "10:30",
  serviceNames: "Maintenance",
  status: "scheduled",
};

const ROUTE: MapRoute = {
  routeId: 7,
  technicianId: 11,
  technicianName: "Alice",
  status: "in_progress",
  startLat: null,
  startLng: null,
  estimatedDistanceKm: null,
  estimatedDurationMin: null,
  stops: [STOP],
};

describe("<AppointmentMarker> tap-to-menu", () => {
  beforeEach(() => {
    markerTrackingProps.length = 0;
  });

  it("fires onActionsPress(stop, route) on single-tap when wired", () => {
    const onActionsPress = jest.fn();
    render(
      <AppointmentMarker
        route={ROUTE}
        stop={STOP}
        color="#3B82F6"
        visible
        onActionsPress={onActionsPress}
      />,
    );
    fireEvent.press(screen.getByLabelText("marker-press"));
    expect(onActionsPress).toHaveBeenCalledTimes(1);
    expect(onActionsPress).toHaveBeenCalledWith(STOP, ROUTE);
  });

  it("falls back to legacy onTap(routeId) when onActionsPress is omitted", () => {
    const onTap = jest.fn();
    render(
      <AppointmentMarker
        route={ROUTE}
        stop={STOP}
        color="#3B82F6"
        visible
        onTap={onTap}
      />,
    );
    fireEvent.press(screen.getByLabelText("marker-press"));
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onTap).toHaveBeenCalledWith(ROUTE.routeId);
  });

  it("is silent on single-tap when neither callback is provided", () => {
    // Smoke: should not throw, should not crash.
    render(
      <AppointmentMarker
        route={ROUTE}
        stop={STOP}
        color="#3B82F6"
        visible
      />,
    );
    fireEvent.press(screen.getByLabelText("marker-press"));
    // No expectation needed beyond "didn't throw" — implicit.
  });

  it("flips tracksViewChanges off after the mount-flash window", () => {
    // The marker mounts with `trackingFlash: true` so the native
    // bitmap rasterizes once at the current color, then drops to
    // `false` after 250 ms so the perf cache (which is why we don't
    // leave it true) kicks back in. This used to also flip back to
    // true on every drag-end as a snap-back fix; pin dragging is now
    // off and the flag is driven only by mount + color changes.
    jest.useFakeTimers();
    try {
      render(
        <AppointmentMarker
          route={ROUTE}
          stop={STOP}
          color="#3B82F6"
          visible
        />,
      );
      // Initial render: trackingFlash starts true so the bitmap
      // renders once.
      expect(markerTrackingProps[0]).toBe(true);
      act(() => {
        jest.advanceTimersByTime(300);
      });
      // After the 250 ms window, the next render has tracking off.
      const lastTracking =
        markerTrackingProps[markerTrackingProps.length - 1];
      expect(lastTracking).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
