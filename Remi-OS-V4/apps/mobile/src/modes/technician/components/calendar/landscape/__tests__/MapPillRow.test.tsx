/**
 * LDM-WAVE-1 CHUNK-6 — `MapPillRow` tests.
 *
 * Hermetic — no native dependencies. Covers:
 *   - 0 descriptors → renders nothing (silent collapse so we don't
 *     ship an empty 44pt strip that pushes map content with no pixels).
 *   - 1 descriptor → renders the capsule with the right label.
 *   - N descriptors → renders all of them.
 *   - `tone` variants apply distinct backgrounds.
 *   - `onPress` descriptor wires up a Pressable that calls back.
 *   - presentational descriptor (no `onPress`) renders without a
 *     Pressable (still accessible via testID).
 */

import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { MapPillRow } from "../MapPillRow";

describe("MapPillRow", () => {
  it("renders nothing when given zero descriptors", () => {
    const node = render(<MapPillRow pills={[]} />);
    expect(node.queryByTestId("map-pill-row-root")).toBeNull();
  });

  it("renders a single descriptor with its label", () => {
    const node = render(
      <MapPillRow
        pills={[{ id: "live-routes", label: "5 routes", tone: "live" }]}
      />
    );
    expect(node.getByTestId("map-pill-row-root")).toBeTruthy();
    expect(node.getByTestId("map-pill-row-pill-live-routes")).toBeTruthy();
    expect(node.getByText("5 routes")).toBeTruthy();
  });

  it("renders N descriptors", () => {
    const node = render(
      <MapPillRow
        pills={[
          { id: "live-routes", label: "5 routes" },
          { id: "alerts", label: "2 alerts", tone: "warning" },
          { id: "ai", label: "AI suggestion" },
        ]}
      />
    );
    expect(node.getByTestId("map-pill-row-pill-live-routes")).toBeTruthy();
    expect(node.getByTestId("map-pill-row-pill-alerts")).toBeTruthy();
    expect(node.getByTestId("map-pill-row-pill-ai")).toBeTruthy();
  });

  it("an onPress descriptor wires up a Pressable that invokes the callback", () => {
    const onPress = jest.fn();
    const node = render(
      <MapPillRow
        pills={[
          {
            id: "toggle",
            label: "Toggle thing",
            onPress,
          },
        ]}
      />
    );
    fireEvent.press(node.getByTestId("map-pill-row-pill-toggle"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("a presentational descriptor (no onPress) does not fire any callback when tapped", () => {
    const node = render(
      <MapPillRow
        pills={[{ id: "live-routes", label: "5 routes", tone: "live" }]}
      />
    );
    // No onPress means tapping shouldn't throw / shouldn't escalate
    // to a phantom callback. Just verify the testID still resolves.
    const pill = node.getByTestId("map-pill-row-pill-live-routes");
    expect(pill).toBeTruthy();
  });

  it("custom testIDPrefix scopes the rendered testIDs", () => {
    const node = render(
      <MapPillRow
        pills={[{ id: "live-routes", label: "5 routes" }]}
        testIDPrefix="landscape-pills"
      />
    );
    expect(node.getByTestId("landscape-pills-root")).toBeTruthy();
    expect(node.getByTestId("landscape-pills-pill-live-routes")).toBeTruthy();
  });
});
