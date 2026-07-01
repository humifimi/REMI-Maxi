/**
 * Tests for `<MarkerReassignPickerSheet>` (LDM-WAVE-2 CHUNK-4,
 * `DRAG-3-CONTEXT-MENU`).
 *
 * Asserts:
 *   - Filters out the sender (`fromTechId`) from the candidate list.
 *   - Default selection is the first candidate (which, given a
 *     pre-sorted `candidates` array in techOrder with fromTech removed,
 *     means "the next tech after fromTech").
 *   - Tapping a different candidate updates the selection.
 *   - Pressing Reassign fires `onConfirm` with the selected tech id.
 *   - Pressing Cancel fires `onCancel`.
 *   - Empty-state renders when no candidates remain after filtering.
 *
 * Hermetic — stubs `<MapActionModal>` to a passthrough View tree.
 */

/* eslint-disable import/no-unresolved */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("@technician/components/route/map-action-modal", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  function MapActionModal(props: {
    visible: boolean;
    children?: React.ReactNode;
  }) {
    if (!props.visible) return null;
    return <View testID="map-action-modal-host">{props.children}</View>;
  }
  return { __esModule: true, MapActionModal };
});

import {
  MarkerReassignPickerSheet,
  type ReassignPickerCandidate,
} from "../marker-reassign-picker-sheet";

const CANDIDATES: ReassignPickerCandidate[] = [
  { technicianId: 11, technicianName: "Alice", routeColor: "#3B82F6" },
  { technicianId: 22, technicianName: "Bob", routeColor: "#EF4444" },
  { technicianId: 33, technicianName: "Carol", routeColor: "#22C55E" },
];

describe("MarkerReassignPickerSheet", () => {
  function renderSheet(
    overrides: Partial<React.ComponentProps<typeof MarkerReassignPickerSheet>> = {},
  ) {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const utils = render(
      <MarkerReassignPickerSheet
        visible
        appointmentSummary="Test Customer"
        fromTechName="Alice"
        fromTechId={11}
        candidates={CANDIDATES}
        onCancel={onCancel}
        onConfirm={onConfirm}
        {...overrides}
      />,
    );
    return { ...utils, onCancel, onConfirm };
  }

  it("renders only candidates other than the sender", () => {
    renderSheet();
    // Bob and Carol render as radio rows…
    expect(screen.getByLabelText("Reassign to Bob")).toBeTruthy();
    expect(screen.getByLabelText("Reassign to Carol")).toBeTruthy();
    // …but Alice (the sender) is excluded from the radio list.
    expect(screen.queryByLabelText("Reassign to Alice")).toBeNull();
  });

  it("defaults selection to the first non-sender candidate (next in techOrder)", () => {
    const { onConfirm } = renderSheet();
    fireEvent.press(screen.getByLabelText("Confirm reassign"));
    expect(onConfirm).toHaveBeenCalledWith(22); // Bob
  });

  it("updates selection when a different candidate is tapped", () => {
    const { onConfirm } = renderSheet();
    fireEvent.press(screen.getByLabelText("Reassign to Carol"));
    fireEvent.press(screen.getByLabelText("Confirm reassign"));
    expect(onConfirm).toHaveBeenCalledWith(33); // Carol
  });

  it("fires onCancel when Cancel is pressed", () => {
    const { onCancel } = renderSheet();
    fireEvent.press(screen.getByLabelText("Cancel reassign"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not fire onConfirm when isPending is true", () => {
    const { onConfirm } = renderSheet({ isPending: true });
    fireEvent.press(screen.getByLabelText("Confirm reassign"));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows the empty state when there are no other candidates", () => {
    const onConfirm = jest.fn();
    render(
      <MarkerReassignPickerSheet
        visible
        appointmentSummary="Test Customer"
        fromTechName="Alice"
        fromTechId={11}
        candidates={[{ technicianId: 11, technicianName: "Alice", routeColor: "#3B82F6" }]}
        onCancel={jest.fn()}
        onConfirm={onConfirm}
      />,
    );
    expect(
      screen.getByText("No other technicians available to reassign to."),
    ).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Confirm reassign"));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
