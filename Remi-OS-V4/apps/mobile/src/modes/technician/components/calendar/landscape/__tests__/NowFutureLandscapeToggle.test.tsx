/**
 * `NowFutureLandscapeToggle` unit tests (PR-UX-15, 2026-05-09;
 * follow-up 2026-05-10 to retire corner anchoring).
 *
 * Pins the landscape toggle's contract after the 2026-05-10
 * relocation into `MoveChainChipRow.chipClusterRightSlot`:
 *
 *   1. Renders nothing when `intents.length === 0` (no chrome).
 *   2. Renders the "Now" pill when `futureMode === false`.
 *   3. Renders the "Future" pill when `futureMode === true`.
 *   4. Tap toggles `futureMode` via `setFutureMode`.
 *
 * The pre-2026-05-10 corner-anchoring case (`insets`,
 * `preferredHandOverride`, `safeAreaInsetsOverride`) is gone — the
 * toggle now flows inline inside the chip row popover and no longer
 * computes a `position: absolute` style. Tests that asserted the
 * left/right hand anchoring were never written; only the four
 * behavior cases above carried forward.
 */

import React from "react";
import { fireEvent, render } from "@testing-library/react-native";

import { NowFutureLandscapeToggle } from "../NowFutureLandscapeToggle";
import { useCalendarStore } from "@technician/stores/calendar";
import { usePendingRealityStore } from "@technician/stores/pending-reality";

beforeEach(() => {
  useCalendarStore.getState().setFutureMode(false);
  usePendingRealityStore.getState().clear();
});

describe("NowFutureLandscapeToggle", () => {
  it("renders nothing when there are no staged intents (self-gates the chrome)", () => {
    const node = render(<NowFutureLandscapeToggle />);
    expect(node.queryByTestId("landscape-now-future-toggle")).toBeNull();
  });

  it("renders the 'Now' pill when futureMode is false and intents are staged", () => {
    usePendingRealityStore.getState().setSession(
      { id: 7, intents: [], status: "draft", required_authorizer_role: "self" } as never,
      [{ id: 1, appointment_id: 100, intent_type: "reschedule" } as never],
    );
    const node = render(<NowFutureLandscapeToggle />);
    expect(node.queryByTestId("landscape-toggle-now-active")).toBeTruthy();
    expect(node.queryByTestId("landscape-toggle-future-active")).toBeNull();
    expect(node.queryByText("Now")).toBeTruthy();
  });

  it("renders the 'Future' pill when futureMode is true and intents are staged", () => {
    usePendingRealityStore.getState().setSession(
      { id: 7, intents: [], status: "draft", required_authorizer_role: "self" } as never,
      [{ id: 1, appointment_id: 100, intent_type: "reschedule" } as never],
    );
    useCalendarStore.getState().setFutureMode(true);
    const node = render(<NowFutureLandscapeToggle />);
    expect(node.queryByTestId("landscape-toggle-future-active")).toBeTruthy();
    expect(node.queryByTestId("landscape-toggle-now-active")).toBeNull();
    expect(node.queryByText("Future")).toBeTruthy();
  });

  it("toggles futureMode on tap", () => {
    usePendingRealityStore.getState().setSession(
      { id: 7, intents: [], status: "draft", required_authorizer_role: "self" } as never,
      [{ id: 1, appointment_id: 100, intent_type: "reschedule" } as never],
    );
    const node = render(<NowFutureLandscapeToggle />);
    expect(useCalendarStore.getState().futureMode).toBe(false);
    fireEvent.press(node.getByTestId("landscape-toggle-now-active"));
    expect(useCalendarStore.getState().futureMode).toBe(true);
    // After flip, the `future-active` testID should now be present
    fireEvent.press(node.getByTestId("landscape-toggle-future-active"));
    expect(useCalendarStore.getState().futureMode).toBe(false);
  });

  it("renders for the user's actual repro: futureMode stuck on after rotation, escape via tap", () => {
    // The PR-UX-15 user repro: portrait toggle on, rotate to
    // landscape, futureMode stays true. Without this component,
    // there's no escape valve. With it, the user can tap the
    // landscape pill (now nested in the chip row popover) to flip
    // back to Now.
    usePendingRealityStore.getState().setSession(
      { id: 7, intents: [], status: "draft", required_authorizer_role: "self" } as never,
      [{ id: 1, appointment_id: 100, intent_type: "reschedule" } as never],
    );
    useCalendarStore.getState().setFutureMode(true);
    const node = render(<NowFutureLandscapeToggle />);
    expect(useCalendarStore.getState().futureMode).toBe(true);
    fireEvent.press(node.getByTestId("landscape-toggle-future-active"));
    expect(useCalendarStore.getState().futureMode).toBe(false);
  });
});
