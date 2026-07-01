/**
 * Tests for `<NowFutureToggle>` (PR-UX-5 / Now⇄Future calendar
 * toggle).
 *
 * Coverage targets:
 *   1. Default state — Now segment is selected.
 *   2. Pressing the Future segment flips `useCalendarStore.futureMode`
 *      to true.
 *   3. Pressing the Now segment flips it back to false.
 *
 * 2026-05-12 (PR-UI-REDESIGN-2 follow-up): the previous "preview
 * caption" and "off-screen count caption" coverage was dropped
 * along with the captions themselves when the toggle moved inline
 * into the chip row's white pill. The toggle is now JUST the
 * segmented pill — no surrounding chrome — so the only remaining
 * behavioral surface is the two press → store flips.
 */

import React from "react";
import { fireEvent, render, act } from "@testing-library/react-native";

import { NowFutureToggle } from "@technician/components/calendar/NowFutureToggle";
import { useCalendarStore } from "@technician/stores/calendar";

beforeEach(() => {
  // Reset the future-mode flag before each test. We don't reset the
  // whole store via `reset()` because that re-stamps `selectedDate`
  // and resets persisted prefs that other tests might rely on.
  act(() => {
    useCalendarStore.setState({ futureMode: false });
  });
});

describe("<NowFutureToggle>", () => {
  it("renders both segments with Now selected by default", () => {
    const node = render(<NowFutureToggle />);
    const now = node.getByTestId("calendar-toggle-now");
    const future = node.getByTestId("calendar-toggle-future");
    expect(now.props.accessibilityState).toEqual({ selected: true });
    expect(future.props.accessibilityState).toEqual({ selected: false });
  });

  it("flips futureMode to true when Future is pressed", () => {
    const node = render(<NowFutureToggle />);
    fireEvent.press(node.getByTestId("calendar-toggle-future"));
    expect(useCalendarStore.getState().futureMode).toBe(true);
  });

  it("flips futureMode back to false when Now is pressed", () => {
    act(() => {
      useCalendarStore.setState({ futureMode: true });
    });
    const node = render(<NowFutureToggle />);
    fireEvent.press(node.getByTestId("calendar-toggle-now"));
    expect(useCalendarStore.getState().futureMode).toBe(false);
  });
});
