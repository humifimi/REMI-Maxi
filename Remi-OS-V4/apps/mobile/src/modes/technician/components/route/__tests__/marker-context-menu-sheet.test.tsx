/**
 * Tests for `<MarkerContextMenuSheet>` (LDM-WAVE-2 CHUNK-4,
 * `DRAG-3-CONTEXT-MENU`).
 *
 * Asserts:
 *   - All 4 action rows render with their labels.
 *   - The Reassign row (enabled) fires `onReassign` when pressed.
 *   - The Dismiss button fires `onClose`.
 *   - Disabled rows render with their subtitle and DO NOT fire callbacks
 *     when pressed (this protects the spec's "disable + tooltip
 *     subtitle, don't hide" decision row).
 *
 * Hermetic — stubs `<MapActionModal>` to a passthrough View tree so
 * the underlying RN `<Modal>` doesn't interfere with the test
 * environment (jest-expo renders Modal children gated on `visible`,
 * which is fine, but we keep the stub for visual clarity).
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

import { MarkerContextMenuSheet } from "../marker-context-menu-sheet";

describe("MarkerContextMenuSheet", () => {
  function renderSheet(overrides: Partial<React.ComponentProps<typeof MarkerContextMenuSheet>> = {}) {
    const onClose = jest.fn();
    const onReassign = jest.fn();
    const onViewDetails = jest.fn();
    const onReschedule = jest.fn();
    const onCancelAppointment = jest.fn();
    const utils = render(
      <MarkerContextMenuSheet
        visible
        customerName="Test Customer"
        serviceNames="Maintenance"
        metaLabel="Alice · 10:30 AM"
        canReassign
        onReassign={onReassign}
        onViewDetails={onViewDetails}
        onReschedule={onReschedule}
        onCancelAppointment={onCancelAppointment}
        onClose={onClose}
        {...overrides}
      />,
    );
    return { ...utils, onClose, onReassign, onViewDetails, onReschedule, onCancelAppointment };
  }

  it("renders all four action rows + the header summary", () => {
    renderSheet();
    expect(screen.getByText("Test Customer")).toBeTruthy();
    expect(screen.getByText("Maintenance")).toBeTruthy();
    expect(screen.getByText("Alice · 10:30 AM")).toBeTruthy();
    expect(screen.getByLabelText("View details")).toBeTruthy();
    expect(screen.getByLabelText("Reschedule…")).toBeTruthy();
    expect(screen.getByLabelText("Reassign…")).toBeTruthy();
    expect(screen.getByLabelText("Cancel appointment")).toBeTruthy();
  });

  it("fires onReassign when the Reassign row is pressed and the row is enabled", () => {
    const { onReassign } = renderSheet();
    fireEvent.press(screen.getByLabelText("Reassign…"));
    expect(onReassign).toHaveBeenCalledTimes(1);
  });

  it("fires onClose when the Dismiss button is pressed", () => {
    const { onClose } = renderSheet();
    fireEvent.press(screen.getByLabelText("Dismiss menu"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disabled rows do not fire their callback when pressed and render a subtitle", () => {
    // PLAN-DEVIATION 2026-05-17-marker-context-menu-passthrough-only-reassign
    // — View details / Reschedule / Cancel are disabled by default on the
    // map surface because their downstream sheets live in the calendar
    // tab. Pressing them must be a no-op.
    const { onViewDetails, onReschedule, onCancelAppointment } = renderSheet({
      canViewDetails: false,
      canReschedule: false,
      canCancel: false,
    });
    fireEvent.press(screen.getByLabelText("View details"));
    fireEvent.press(screen.getByLabelText("Reschedule…"));
    fireEvent.press(screen.getByLabelText("Cancel appointment"));
    expect(onViewDetails).not.toHaveBeenCalled();
    expect(onReschedule).not.toHaveBeenCalled();
    expect(onCancelAppointment).not.toHaveBeenCalled();
    expect(
      screen.getByText("Open this appointment in the calendar to see details"),
    ).toBeTruthy();
    expect(
      screen.getByText("Open this appointment in the calendar to reschedule"),
    ).toBeTruthy();
    expect(
      screen.getByText("Open this appointment in the calendar to cancel"),
    ).toBeTruthy();
  });
});
