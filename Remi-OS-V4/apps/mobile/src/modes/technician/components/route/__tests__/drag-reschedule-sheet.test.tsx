/**
 * Tests for `<DragRescheduleSheet>` — Phase 2 of the chip-bar
 * snap-zone rescheduler plan.
 *
 * Two layers of coverage:
 *
 *   1. Pure-helper tests for the time math (parse, format, clamp,
 *      midpoint default, cross-midnight + no-room classification).
 *      These exercise the export surface that the sheet's state
 *      transitions are built on — they're the regression boundary
 *      for "did someone refactor the math and break the contract".
 *
 *   2. Render-and-interact tests for the React component:
 *      - INSERT mode: midpoint default, step + clamp, save payload,
 *        notify-customer toggle propagation.
 *      - SWAP mode: two pickers, defaults = other side's pre-swap
 *        time, save fires both halves, save enabled on open.
 *      - No-room window: pickers hidden, Save disabled, "no room"
 *        message rendered.
 *      - Cross-midnight: error state, Save hidden, only Cancel +
 *        Advanced (when provided).
 *      - Cancel: fires onCancel, no mutation, no payload.
 *
 * Hermetic — stubs `<MapActionModal>` (matching other map-sheet
 * tests' convention) so the underlying RN absolute-positioned wrapper
 * doesn't interfere with `getByLabelText` queries.
 */

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("@technician/components/route/map-action-modal", () => {
  const ReactInner = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  function MapActionModal(props: {
    visible: boolean;
    children?: React.ReactNode;
  }) {
    if (!props.visible) return null;
    return ReactInner.createElement(
      View,
      { testID: "map-action-modal-host" },
      props.children,
    );
  }
  return { __esModule: true, MapActionModal };
});

jest.mock("@technician/hooks/utility/use-haptics", () => ({
  haptic: { light: jest.fn(), medium: jest.fn(), heavy: jest.fn() },
}));

import {
  DragRescheduleSheet,
  type DragRescheduleSheetMode,
  type DragRescheduleSheetPayload,
  parseHHMMToMinutes,
  formatMinutesToHHMM,
  clampStartHHMM,
  defaultInsertStartHHMM,
  isCrossMidnightWindow,
  hasNoRoomInWindow,
  addDurationToHHMM,
} from "../drag-reschedule-sheet";
import type { MapStop } from "@technician/types/api";

// ─── Helper fixtures ───────────────────────────────────────────────

function makeStop(overrides: Partial<MapStop> = {}): MapStop {
  return {
    stopId: 1,
    appointmentId: 100,
    stopOrder: 1,
    lat: 40.0,
    lng: -74.0,
    customerName: "Jane Doe",
    addressLine: "123 Main St",
    city: "Springfield",
    scheduledTime: "10:30",
    scheduledEndTime: "11:30",
    serviceNames: "Oil Change",
    status: "scheduled",
    estimatedArrival: null,
    actualArrival: null,
    ...overrides,
  };
}

function makeInsertMode(
  overrides?: Partial<{
    appointment: MapStop;
    durationMinutes: number;
    window: { startHHMM: string; endHHMM: string };
    defaultStartHHMM?: string;
  }>,
): DragRescheduleSheetMode {
  return {
    kind: "insert",
    appointment: overrides?.appointment ?? makeStop(),
    durationMinutes: overrides?.durationMinutes ?? 60,
    window: overrides?.window ?? { startHHMM: "10:00", endHHMM: "12:00" },
    defaultStartHHMM: overrides?.defaultStartHHMM,
  };
}

function makeSwapMode(): DragRescheduleSheetMode {
  return {
    kind: "swap",
    aSide: {
      appointment: makeStop({
        stopId: 10,
        stopOrder: 2,
        customerName: "Alice",
        scheduledTime: "09:00",
      }),
      durationMinutes: 60,
      window: { startHHMM: "10:00", endHHMM: "13:00" }, // B's old neighborhood
      defaultStartHHMM: "11:00", // B's pre-swap start
    },
    bSide: {
      appointment: makeStop({
        stopId: 20,
        stopOrder: 3,
        customerName: "Bob",
        scheduledTime: "11:00",
      }),
      durationMinutes: 45,
      window: { startHHMM: "08:00", endHHMM: "10:00" }, // A's old neighborhood
      defaultStartHHMM: "09:00", // A's pre-swap start
    },
  };
}

function renderSheet(
  modeArg: DragRescheduleSheetMode,
  overrides: Partial<{
    visible: boolean;
    onSubmit: (payload: DragRescheduleSheetPayload) => void;
    onCancel: () => void;
    isSubmitting: boolean;
    onAdvanced: () => void;
  }> = {},
) {
  const onSubmit =
    overrides.onSubmit ??
    (jest.fn() as jest.Mock<void, [DragRescheduleSheetPayload]>);
  const onCancel = overrides.onCancel ?? jest.fn();
  const onAdvanced = overrides.onAdvanced;
  const utils = render(
    <DragRescheduleSheet
      visible={overrides.visible ?? true}
      mode={modeArg}
      onSubmit={onSubmit}
      onCancel={onCancel}
      isSubmitting={overrides.isSubmitting ?? false}
      onAdvanced={onAdvanced}
    />,
  );
  return { ...utils, onSubmit, onCancel, onAdvanced };
}

// ─── Pure helper tests ─────────────────────────────────────────────

describe("time helpers", () => {
  describe("parseHHMMToMinutes / formatMinutesToHHMM", () => {
    it("parses HH:MM", () => {
      expect(parseHHMMToMinutes("10:30")).toBe(630);
      expect(parseHHMMToMinutes("00:00")).toBe(0);
      expect(parseHHMMToMinutes("23:59")).toBe(23 * 60 + 59);
    });
    it("parses HH:MM:SS (ignores seconds)", () => {
      expect(parseHHMMToMinutes("10:30:45")).toBe(630);
    });
    it("returns null on malformed input", () => {
      expect(parseHHMMToMinutes("abc")).toBeNull();
      expect(parseHHMMToMinutes("25:00")).toBeNull();
      expect(parseHHMMToMinutes("10:60")).toBeNull();
      expect(parseHHMMToMinutes("")).toBeNull();
    });
    it("formats minutes back to HH:MM", () => {
      expect(formatMinutesToHHMM(0)).toBe("00:00");
      expect(formatMinutesToHHMM(630)).toBe("10:30");
      expect(formatMinutesToHHMM(23 * 60 + 59)).toBe("23:59");
    });
    it("formatMinutesToHHMM wraps gracefully on out-of-range input", () => {
      expect(formatMinutesToHHMM(-15)).toBe("23:45");
      expect(formatMinutesToHHMM(25 * 60)).toBe("01:00");
    });
  });

  describe("clampStartHHMM", () => {
    const window = { startHHMM: "10:00", endHHMM: "12:00" };
    it("returns unchanged when inside the valid range", () => {
      expect(clampStartHHMM("10:30", window, 60)).toBe("10:30");
    });
    it("clamps to window start when too early", () => {
      expect(clampStartHHMM("09:00", window, 60)).toBe("10:00");
    });
    it("clamps to latest valid start (end - duration) when too late", () => {
      // 60-min appt in 10:00-12:00 → latest valid start = 11:00
      expect(clampStartHHMM("11:30", window, 60)).toBe("11:00");
    });
    it("returns candidate unchanged when window has no room", () => {
      const tightWindow = { startHHMM: "10:00", endHHMM: "10:30" };
      expect(clampStartHHMM("10:15", tightWindow, 60)).toBe("10:15");
    });
  });

  describe("defaultInsertStartHHMM", () => {
    it("returns midpoint snapped to nearest 15-min for a comfortable window", () => {
      // 60-min appt in 10:00-12:00 → valid range = [10:00, 11:00]
      // midpoint = 10:30, snapped to 15 = 10:30
      expect(defaultInsertStartHHMM({ startHHMM: "10:00", endHHMM: "12:00" }, 60))
        .toBe("10:30");
    });
    it("snaps midpoint to nearest 15 even when raw midpoint is off-grid", () => {
      // 60-min appt in 10:00-11:45 → valid range = [10:00, 10:45] (45 min wide).
      // raw midpoint = 10:00 + floor(45/2) = 10:22.
      // nearest 15-min slot to 10:22 = 10:15 (delta 7) vs 10:30 (delta 8) → 10:15.
      // 10:15 is inside [10:00, 10:45], so final = 10:15.
      expect(defaultInsertStartHHMM({ startHHMM: "10:00", endHHMM: "11:45" }, 60))
        .toBe("10:15");
    });
    it("returns window.startHHMM when the window has zero or negative room", () => {
      expect(defaultInsertStartHHMM({ startHHMM: "10:00", endHHMM: "10:30" }, 60))
        .toBe("10:00");
      expect(defaultInsertStartHHMM({ startHHMM: "10:00", endHHMM: "11:00" }, 60))
        .toBe("10:00");
    });
  });

  describe("isCrossMidnightWindow / hasNoRoomInWindow", () => {
    it("isCrossMidnightWindow flags end<start", () => {
      expect(isCrossMidnightWindow({ startHHMM: "22:00", endHHMM: "02:00" })).toBe(true);
      expect(isCrossMidnightWindow({ startHHMM: "10:00", endHHMM: "12:00" })).toBe(false);
    });
    it("hasNoRoomInWindow flags end-start<duration", () => {
      expect(hasNoRoomInWindow({ startHHMM: "10:00", endHHMM: "10:30" }, 60)).toBe(true);
      expect(hasNoRoomInWindow({ startHHMM: "10:00", endHHMM: "11:00" }, 60)).toBe(false);
      expect(hasNoRoomInWindow({ startHHMM: "22:00", endHHMM: "02:00" }, 60)).toBe(true);
    });
  });

  describe("addDurationToHHMM", () => {
    it("adds minutes", () => {
      expect(addDurationToHHMM("10:30", 60)).toBe("11:30");
      expect(addDurationToHHMM("10:30", 90)).toBe("12:00");
      expect(addDurationToHHMM("10:30", 0)).toBe("10:30");
    });
  });
});

// ─── INSERT mode component tests ───────────────────────────────────

describe("DragRescheduleSheet — INSERT mode", () => {
  it("renders one picker, defaulted to midpoint of valid range", () => {
    renderSheet(makeInsertMode()); // 60-min in 10:00-12:00 → 10:30 default
    // The display shows hour=10, minute=30, period=AM.
    // Both hour and minute appear; we identify the column by testID.
    const side = screen.getByTestId("drag-reschedule-side-a");
    expect(side).toBeTruthy();
    // Tabular-nums display: "10", "30", "AM"
    expect(screen.getByText("10")).toBeTruthy();
    expect(screen.getByText("30")).toBeTruthy();
    expect(screen.getByText("AM")).toBeTruthy();
    // No second column.
    expect(screen.queryByTestId("drag-reschedule-side-b")).toBeNull();
  });

  it("Save with default value fires onSubmit with insert payload", () => {
    const { onSubmit } = renderSheet(makeInsertMode());
    fireEvent.press(screen.getByLabelText("Save new time"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      kind: "insert",
      stopId: 1,
      newStartHHMM: "10:30",
      newEndHHMM: "11:30",
      notifyCustomer: false,
    });
  });

  it("step up by 15-min increments the start time", () => {
    const { onSubmit } = renderSheet(makeInsertMode());
    fireEvent.press(screen.getByLabelText("Increase Min"));
    fireEvent.press(screen.getByLabelText("Save new time"));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        newStartHHMM: "10:45",
        newEndHHMM: "11:45",
      }),
    );
  });

  it("clamps at the latest valid start — extra step-ups are no-ops", () => {
    const { onSubmit } = renderSheet(makeInsertMode()); // 10:30 default
    // 10:30 → 10:45 → 11:00 → 11:15 (would exceed 11:00 = end-duration, clamps).
    fireEvent.press(screen.getByLabelText("Increase Min"));
    fireEvent.press(screen.getByLabelText("Increase Min"));
    fireEvent.press(screen.getByLabelText("Increase Min"));
    fireEvent.press(screen.getByLabelText("Save new time"));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ newStartHHMM: "11:00" }),
    );
  });

  it("clamps at the earliest valid start — extra step-downs are no-ops", () => {
    const { onSubmit } = renderSheet(makeInsertMode()); // 10:30 default
    // 10:30 → 10:15 → 10:00 → 09:45 (clamps to 10:00).
    fireEvent.press(screen.getByLabelText("Decrease Min"));
    fireEvent.press(screen.getByLabelText("Decrease Min"));
    fireEvent.press(screen.getByLabelText("Decrease Min"));
    fireEvent.press(screen.getByLabelText("Save new time"));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ newStartHHMM: "10:00" }),
    );
  });

  it("toggling notify-customer ON propagates to the payload", () => {
    const { onSubmit } = renderSheet(makeInsertMode());
    fireEvent(screen.getByTestId("drag-reschedule-notify-toggle"), "valueChange", true);
    fireEvent.press(screen.getByLabelText("Save new time"));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ notifyCustomer: true }),
    );
  });

  // 2026-05-22 follow-up — the standalone "Cancel" button was removed
  // from the action row because the header X already cancels and the
  // row width is now spent on the Notify toggle. The user-facing
  // cancel path is the header close button (a11y label "Close").
  it("Close (header X) fires onCancel and does NOT fire onSubmit", () => {
    const { onCancel, onSubmit } = renderSheet(makeInsertMode());
    fireEvent.press(screen.getByLabelText("Close"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders the window hint with formatted bounds", () => {
    renderSheet(makeInsertMode()); // 10:00-12:00
    expect(screen.getByText(/Window:/)).toBeTruthy();
    // formatTimeRange12h same-AM collapse: "10:00 – 12:00 PM" (12:00 is PM).
    // Avoid asserting exact en-dash to keep this independent of typography.
    expect(screen.getByText(/10:00.*12:00 PM/)).toBeTruthy();
  });
});

// ─── SWAP mode component tests ─────────────────────────────────────

describe("DragRescheduleSheet — SWAP mode", () => {
  it("renders two pickers, defaulted to other side's pre-swap time", () => {
    renderSheet(makeSwapMode());
    expect(screen.getByTestId("drag-reschedule-side-a")).toBeTruthy();
    expect(screen.getByTestId("drag-reschedule-side-b")).toBeTruthy();
    // A defaults to 11:00, B defaults to 09:00.
    // (We just check that both display values render — exact disambiguation
    //  would require side-scoped queries which is more work than it's worth.)
    expect(screen.getByText("11")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy(); // formatted hour, not "09"
  });

  it("Save immediately fires the swap payload with both defaults", () => {
    const { onSubmit } = renderSheet(makeSwapMode());
    fireEvent.press(screen.getByLabelText("Save both"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      kind: "swap",
      aStopId: 10,
      aNewStartHHMM: "11:00",
      aNewEndHHMM: "12:00", // 11:00 + 60-min A duration
      bStopId: 20,
      bNewStartHHMM: "09:00",
      bNewEndHHMM: "09:45", // 09:00 + 45-min B duration
      notifyCustomer: false,
    });
  });

  it("notify-customer toggle applies to both sides via one shared flag", () => {
    const { onSubmit } = renderSheet(makeSwapMode());
    fireEvent(screen.getByTestId("drag-reschedule-notify-toggle"), "valueChange", true);
    fireEvent.press(screen.getByLabelText("Save both"));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ notifyCustomer: true }),
    );
  });

  // 2026-05-22 follow-up — see INSERT-mode equivalent. Cancel button
  // removed; header X is the cancel path.
  it("Close (header X) fires onCancel and does NOT fire onSubmit", () => {
    const { onCancel, onSubmit } = renderSheet(makeSwapMode());
    fireEvent.press(screen.getByLabelText("Close"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders the Save Both label, not Save", () => {
    renderSheet(makeSwapMode());
    expect(screen.queryByLabelText("Save new time")).toBeNull();
    expect(screen.getByLabelText("Save both")).toBeTruthy();
  });
});

// ─── Edge case: no-room window ─────────────────────────────────────

describe("DragRescheduleSheet — no-room window", () => {
  it("renders the no-room message, Save is disabled", () => {
    const tight = makeInsertMode({
      window: { startHHMM: "10:00", endHHMM: "10:30" },
      durationMinutes: 60,
    });
    const { onSubmit } = renderSheet(tight);
    expect(
      screen.getByText("No room in this slot — pick another position"),
    ).toBeTruthy();
    // Save button is rendered but disabled — pressing it is a no-op.
    fireEvent.press(screen.getByLabelText("Save new time"));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// ─── Edge case: cross-midnight window ──────────────────────────────

describe("DragRescheduleSheet — cross-midnight window (impossible state)", () => {
  it("renders the error state, Save button hidden, Advanced visible when provided", () => {
    const onAdvanced = jest.fn();
    const crossMidnight = makeInsertMode({
      window: { startHHMM: "22:00", endHHMM: "02:00" },
      durationMinutes: 60,
    });
    const { onSubmit } = renderSheet(crossMidnight, { onAdvanced });

    expect(
      screen.getByTestId("drag-reschedule-cross-midnight-error"),
    ).toBeTruthy();
    expect(
      screen.getByText("Invalid time window — please use Advanced"),
    ).toBeTruthy();
    // No Save / Save Both button is rendered.
    expect(screen.queryByLabelText("Save new time")).toBeNull();
    expect(screen.queryByLabelText("Save both")).toBeNull();
    // 2026-05-22 follow-up — header X is the cancel path. Advanced
    // still renders in the action row.
    expect(screen.getByLabelText("Close")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Open full reschedule sheet"));
    expect(onAdvanced).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

// ─── Visibility gate ───────────────────────────────────────────────

describe("DragRescheduleSheet — visibility / mode-null", () => {
  it("renders nothing visible when visible=false", () => {
    renderSheet(makeInsertMode(), { visible: false });
    // Our MapActionModal stub returns null when not visible.
    expect(screen.queryByTestId("map-action-modal-host")).toBeNull();
  });

  it("renders nothing visible when mode is null", () => {
    render(
      <DragRescheduleSheet
        visible
        mode={null}
        onSubmit={jest.fn()}
        onCancel={jest.fn()}
        isSubmitting={false}
      />,
    );
    expect(screen.queryByTestId("map-action-modal-host")).toBeNull();
  });
});
