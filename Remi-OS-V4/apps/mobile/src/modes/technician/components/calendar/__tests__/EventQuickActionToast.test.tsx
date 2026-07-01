/**
 * Tests for `EventQuickActionToast` (P2-FE-5 chunk 2c, 2026-04-22).
 *
 * Coverage axes:
 *   1. visibility — `visible={false}` renders null; `visible={true}`
 *      mounts the dark pill with the message.
 *   2. action pill — tapping "Cancel appt" fires `onCancel` AND
 *      `onDismiss` (we want the toast to close immediately so it
 *      doesn't linger over the cancel sheet that's about to open).
 *   3. auto-dismiss — after `autoDismissMs` elapses while visible,
 *      `onDismiss` is called exactly once.
 *   4. detail line — optional second-line copy renders only when
 *      provided (otherwise the message stays single-line).
 */

/* eslint-disable import/no-unresolved -- @testing-library/react-native lands with the jest-expo runner. */

import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

import { EventQuickActionToast } from "../event-quick-action-toast";

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("EventQuickActionToast", () => {
  it("renders nothing when visible=false", () => {
    const { queryByText } = render(
      <EventQuickActionToast
        visible={false}
        message="John Smith • 9:30 AM"
        onCancel={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    expect(queryByText("John Smith • 9:30 AM")).toBeNull();
    expect(queryByText("Cancel appt")).toBeNull();
  });

  it("renders the pill, the message, and the Cancel action when visible=true", () => {
    const { getByText } = render(
      <EventQuickActionToast
        visible
        message="John Smith • 9:30 AM"
        onCancel={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    expect(getByText("John Smith • 9:30 AM")).toBeTruthy();
    expect(getByText("Cancel appt")).toBeTruthy();
  });

  it("renders the optional detail line when provided", () => {
    const { getByText, queryByText, rerender } = render(
      <EventQuickActionToast
        visible
        message="John Smith • 9:30 AM"
        detail="Brake service"
        onCancel={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    expect(getByText("Brake service")).toBeTruthy();

    rerender(
      <EventQuickActionToast
        visible
        message="John Smith • 9:30 AM"
        onCancel={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    expect(queryByText("Brake service")).toBeNull();
  });

  it("fires onCancel and onDismiss when the Cancel pill is pressed", () => {
    const onCancel = jest.fn();
    const onDismiss = jest.fn();
    const { getByText } = render(
      <EventQuickActionToast
        visible
        message="John Smith • 9:30 AM"
        onCancel={onCancel}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.press(getByText("Cancel appt"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("auto-dismisses after autoDismissMs", () => {
    const onDismiss = jest.fn();
    render(
      <EventQuickActionToast
        visible
        message="John Smith • 9:30 AM"
        onCancel={jest.fn()}
        onDismiss={onDismiss}
        autoDismissMs={3000}
      />,
    );
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(2999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not auto-dismiss when visible=false", () => {
    const onDismiss = jest.fn();
    render(
      <EventQuickActionToast
        visible={false}
        message="John Smith • 9:30 AM"
        onCancel={jest.fn()}
        onDismiss={onDismiss}
        autoDismissMs={3000}
      />,
    );
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
