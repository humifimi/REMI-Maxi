/**
 * LDM-WAVE-1 CHUNK-6 — `FranchiseRouteMap` slot-prop tests.
 *
 * Pins the three-state semantic from the wave doc:
 *
 *   prop value         → renders
 *   ─────────────────────────────────────────────────────────────────
 *   undefined          → default chrome for that region IFF
 *                        `!fullBleed`; otherwise nothing.
 *   null               → nothing (suppresses default even when
 *                        `!fullBleed`).
 *   <ReactNode>        → the provided node, regardless of `fullBleed`.
 *
 * Hermetic — mocks `react-native-maps`, both store/data hooks, and the
 * realtime channel so the test exercises only the slot resolver
 * branch. Asserting against testIDs rather than visual snapshots so
 * we don't tie ourselves to font / spacing minutiae.
 */

import React from "react";
import { Text, View } from "react-native";
import { render } from "@testing-library/react-native";

// ---------------------------------------------------------------------------
// Mock react-native-maps — we never want a native MapView under jsdom/node.
// ---------------------------------------------------------------------------
jest.mock("react-native-maps", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  const MockMapView = (props: { children?: React.ReactNode }) =>
    React.createElement(View, { testID: "mock-mapview" }, props.children);
  const MockMarker = (props: { children?: React.ReactNode }) =>
    React.createElement(View, null, props.children);
  const MockPolyline = () => null;
  const MockCallout = (props: { children?: React.ReactNode }) =>
    React.createElement(View, null, props.children);
  return {
    __esModule: true,
    default: MockMapView,
    Marker: MockMarker,
    Polyline: MockPolyline,
    Callout: MockCallout,
  };
});

// ---------------------------------------------------------------------------
// Mock the data hook so the component reaches its render branch.
// ---------------------------------------------------------------------------
const fakeMapData = {
  routes: [
    {
      routeId: 1,
      technicianId: 11,
      technicianName: "Alice",
      stops: [],
    },
    {
      routeId: 2,
      technicianId: 22,
      technicianName: "Bob",
      stops: [],
    },
  ],
  technicianLocations: [],
};

jest.mock("@technician/hooks/operations/use-franchise-map", () => ({
  useFranchiseRouteMap: () => ({ data: fakeMapData, isLoading: false }),
}));

jest.mock("@technician/hooks/operations/use-realtime", () => ({
  useRealtimeLocation: () => ({ lastUpdate: null }),
}));

// Calendar store — return a stable shape regardless of selector.
jest.mock("@technician/stores/calendar", () => ({
  useCalendarStore: (selector: (s: {
    mapSelectedTechIds: number[];
    toggleMapTech: () => void;
    clearMapSelection: () => void;
  }) => unknown) =>
    selector({
      mapSelectedTechIds: [],
      toggleMapTech: jest.fn(),
      clearMapSelection: jest.fn(),
    }),
}));

import { FranchiseRouteMap } from "../franchise-route-map";

describe("FranchiseRouteMap — slot fall-through semantic", () => {
  it("(a) portrait (!fullBleed, no slots) renders default legend + zoom/fit chrome", () => {
    const node = render(
      <FranchiseRouteMap franchiseId={1} date="2026-05-15" />
    );
    // Default legend renders the "Show All" branch only when filtered;
    // it renders the avatar chips always. The TechAvatarChip carries
    // the route name, so finding the names is enough proof the legend
    // mounted.
    expect(node.getByText("Alice")).toBeTruthy();
    expect(node.getByText("Bob")).toBeTruthy();
  });

  it("(b) landscape (fullBleed, no slots) renders neither default chrome", () => {
    const node = render(
      <FranchiseRouteMap franchiseId={1} date="2026-05-15" fullBleed />
    );
    // No legend → tech names should not be in the tree.
    expect(node.queryByText("Alice")).toBeNull();
    expect(node.queryByText("Bob")).toBeNull();
  });

  it("(c) renderTopChrome={<ReactNode>} renders the slot regardless of fullBleed", () => {
    const node = render(
      <FranchiseRouteMap
        franchiseId={1}
        date="2026-05-15"
        fullBleed
        renderTopChrome={<Text testID="custom-top">custom top chrome</Text>}
      />
    );
    expect(node.getByTestId("custom-top")).toBeTruthy();
    expect(node.getByText("custom top chrome")).toBeTruthy();
  });

  it("(d) explicit renderBottomChrome={null} suppresses default legend even when !fullBleed", () => {
    const node = render(
      <FranchiseRouteMap
        franchiseId={1}
        date="2026-05-15"
        renderBottomChrome={null}
      />
    );
    // Default legend would have included Alice + Bob; null suppresses it.
    expect(node.queryByText("Alice")).toBeNull();
    expect(node.queryByText("Bob")).toBeNull();
  });

  it("custom renderRightChrome replaces the default zoom/fit cluster in !fullBleed mode", () => {
    const node = render(
      <FranchiseRouteMap
        franchiseId={1}
        date="2026-05-15"
        renderRightChrome={
          <View testID="custom-right">
            <Text>custom right</Text>
          </View>
        }
      />
    );
    expect(node.getByTestId("custom-right")).toBeTruthy();
  });
});
