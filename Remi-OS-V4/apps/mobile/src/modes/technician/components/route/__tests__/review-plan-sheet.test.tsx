/**
 * Tests for `<ReviewPlanSheet>` — chunk B2-4 of the chip-bar
 * plan-mode batch reorganization feature
 * (`docs/implementation-plans/chip-bar-plan-mode-batch.md`).
 *
 * Render-and-interact coverage:
 *   - Empty rows → empty state, Commit disabled.
 *   - One swap row → both pickers render, stepping fires
 *     `onAdjustTime` with the post-clamp HHMM.
 *   - One insert row → only A picker renders.
 *   - Remove button fires `onRemove` with the right rowKey.
 *   - Notify toggle toggles + flows into the Commit payload.
 *   - Commit button label reflects count, fires `onCommit` with
 *     the current Notify state.
 *   - Stale row → opacity hint + stepper arrows disabled, but
 *     Remove still works (so the user can drop bad rows).
 *
 * B2-5 additions:
 *   - `status: inFlight` → spinner badge renders, stepper arrows
 *     + Remove disabled (mutation mid-flight).
 *   - `status: committed` → check badge renders, stepper arrows
 *     + Remove disabled (no-op; the mutation succeeded).
 *   - `status: failed` → red error badge with message renders,
 *     stepper arrows + Remove STAY enabled (so the dispatcher
 *     can edit + retry, or back out entirely).
 *
 * Hermetic — stubs `<MapActionModal>` so the underlying RN
 * absolute-positioned wrapper doesn't interfere with
 * `getByLabelText` queries (same pattern as
 * `drag-reschedule-sheet.test.tsx`).
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
  ReviewPlanSheet,
  type ReviewPlanRow,
  type ReviewPlanSheetProps,
} from "../review-plan-sheet";

// ─── Fixtures ──────────────────────────────────────────────────────

function makeSwapRow(overrides: Partial<ReviewPlanRow> = {}): ReviewPlanRow {
  return {
    rowKey: "swap:10:20",
    kind: "swap",
    summary: "Trade times with Jim Smith",
    aSide: {
      name: "Mary Johnson",
      originalHHMM: "09:00",
      proposedStartHHMM: "11:00",
      durationMinutes: 60,
      baseDurationMinutes: 60,
      windowEdges: { startHHMM: "08:00", endHHMM: "13:00" },
      windowLabel: "8:00 AM – 1:00 PM",
    },
    bSide: {
      name: "Jim Smith",
      originalHHMM: "11:00",
      proposedStartHHMM: "09:00",
      durationMinutes: 60,
      baseDurationMinutes: 60,
      windowEdges: { startHHMM: "08:00", endHHMM: "13:00" },
      windowLabel: "8:00 AM – 1:00 PM",
    },
    ...overrides,
  };
}

function makeInsertRow(overrides: Partial<ReviewPlanRow> = {}): ReviewPlanRow {
  return {
    rowKey: "insert:30",
    kind: "insert",
    summary: "Insert at position 3",
    aSide: {
      name: "Pat Owens",
      originalHHMM: "14:00",
      proposedStartHHMM: "10:30",
      durationMinutes: 45,
      baseDurationMinutes: 45,
      windowEdges: { startHHMM: "09:00", endHHMM: "12:00" },
      windowLabel: "9:00 AM – 12:00 PM",
    },
    ...overrides,
  };
}

function renderSheet(
  rows: ReviewPlanRow[],
  overrides: Partial<ReviewPlanSheetProps> = {},
) {
  const props: ReviewPlanSheetProps = {
    visible: true,
    rows,
    isSubmitting: false,
    onAdjustTime: jest.fn(),
    onAdjustDuration: jest.fn(),
    onRemove: jest.fn(),
    onCommit: jest.fn(),
    onCancel: jest.fn(),
    onDiscardPlan: jest.fn(),
    ...overrides,
  };
  const view = render(<ReviewPlanSheet {...props} />);
  return { ...view, props };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe("<ReviewPlanSheet>", () => {
  it("returns null when not visible", () => {
    const { queryByTestId } = renderSheet([makeSwapRow()], {
      visible: false,
    });
    expect(queryByTestId("map-action-modal-host")).toBeNull();
  });

  it("renders the empty state and a disabled commit when no rows", () => {
    renderSheet([]);
    expect(screen.getByText(/All staged moves removed/)).toBeTruthy();
    // Commit label collapses to "Commit" when validRowCount is 0.
    const commit = screen.getByLabelText("Commit 0 changes");
    expect(commit.props.accessibilityState?.disabled).toBe(true);
  });

  it("renders one swap row with both pickers + the summary", () => {
    renderSheet([makeSwapRow()]);
    expect(screen.getByTestId("review-row-swap:10:20")).toBeTruthy();
    expect(screen.getByTestId("review-row-swap:10:20-a")).toBeTruthy();
    expect(screen.getByTestId("review-row-swap:10:20-b")).toBeTruthy();
    expect(screen.getByText("Trade times with Jim Smith")).toBeTruthy();
  });

  it("renders only the A picker for an insert row", () => {
    renderSheet([makeInsertRow()]);
    expect(screen.getByTestId("review-row-insert:30-a")).toBeTruthy();
    expect(screen.queryByTestId("review-row-insert:30-b")).toBeNull();
    expect(screen.getByText("Insert at position 3")).toBeTruthy();
  });

  it("stepping the A-side minute up clamps and emits onAdjustTime", () => {
    const onAdjustTime = jest.fn();
    renderSheet([makeSwapRow()], { onAdjustTime });
    // A-side proposed = 11:00; window is 08:00–13:00; duration 60.
    // Step minute up by 15 → 11:15 (well within range).
    const sideA = screen.getByTestId("review-row-swap:10:20-a");
    // First "Increase Min" inside the side-A subtree.
    const incMin = screen.getAllByLabelText("Increase Min").find((node) => {
      // sideA wraps the StepperBlock; only the A-side's "Increase Min"
      // is a descendant of sideA.
      let cur: typeof node | null = node;
      while (cur) {
        if (cur === sideA) return true;
        cur = cur.parent ?? null;
      }
      return false;
    });
    expect(incMin).toBeTruthy();
    fireEvent.press(incMin!);
    expect(onAdjustTime).toHaveBeenCalledWith("swap:10:20", "a", "11:15");
  });

  it("stepping past the window edge does NOT fire onAdjustTime", () => {
    const onAdjustTime = jest.fn();
    // A-side already at the window edge: window 08:00–13:00, duration
    // 60, so latestValidStart = 12:00. Set proposed to 12:00 and try
    // to step up.
    const row = makeSwapRow({
      aSide: {
        ...makeSwapRow().aSide,
        proposedStartHHMM: "12:00",
      },
    });
    renderSheet([row], { onAdjustTime });
    const sideA = screen.getByTestId("review-row-swap:10:20-a");
    const incMin = screen.getAllByLabelText("Increase Min").find((node) => {
      let cur: typeof node | null = node;
      while (cur) {
        if (cur === sideA) return true;
        cur = cur.parent ?? null;
      }
      return false;
    });
    expect(incMin).toBeTruthy();
    // Disabled at boundary — accessibilityState.disabled should be true.
    expect(incMin!.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(incMin!);
    expect(onAdjustTime).not.toHaveBeenCalled();
  });

  it("Remove fires onRemove with the row key", () => {
    const onRemove = jest.fn();
    renderSheet([makeSwapRow(), makeInsertRow()], { onRemove });
    fireEvent.press(screen.getByLabelText("Remove Pat Owens from plan"));
    expect(onRemove).toHaveBeenCalledWith("insert:30");
  });

  it("Notify toggle flows into the Commit payload", () => {
    const onCommit = jest.fn();
    renderSheet([makeSwapRow()], { onCommit });
    const toggle = screen.getByTestId("review-plan-notify-toggle");
    fireEvent(toggle, "valueChange", true);
    fireEvent.press(screen.getByLabelText("Commit 1 change"));
    expect(onCommit).toHaveBeenCalledWith(true);
  });

  it("Commit default fires with notifyCustomer = false", () => {
    const onCommit = jest.fn();
    renderSheet([makeSwapRow(), makeInsertRow()], { onCommit });
    fireEvent.press(screen.getByLabelText("Commit 2 changes"));
    expect(onCommit).toHaveBeenCalledWith(false);
  });

  it("Cancel fires onCancel", () => {
    const onCancel = jest.fn();
    renderSheet([makeSwapRow()], { onCancel });
    fireEvent.press(screen.getByLabelText("Close"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("stale row hint renders + steppers are disabled but Remove still fires", () => {
    const onRemove = jest.fn();
    const onAdjustTime = jest.fn();
    renderSheet([makeInsertRow({ isStale: true })], {
      onRemove,
      onAdjustTime,
    });
    expect(
      screen.getByText(/No longer in route — will be skipped on commit/),
    ).toBeTruthy();
    const sideA = screen.getByTestId("review-row-insert:30-a");
    const incMin = screen.getAllByLabelText("Increase Min").find((node) => {
      let cur: typeof node | null = node;
      while (cur) {
        if (cur === sideA) return true;
        cur = cur.parent ?? null;
      }
      return false;
    });
    expect(incMin).toBeTruthy();
    fireEvent.press(incMin!);
    expect(onAdjustTime).not.toHaveBeenCalled();
    // Remove still works on stale rows so the user can drop them.
    fireEvent.press(screen.getByLabelText("Remove Pat Owens from plan"));
    expect(onRemove).toHaveBeenCalledWith("insert:30");
  });

  it("isSubmitting disables Commit + notify but rows stay interactive", () => {
    const onAdjustTime = jest.fn();
    renderSheet([makeSwapRow()], { isSubmitting: true, onAdjustTime });
    const commit = screen.getByLabelText("Commit 1 change");
    expect(commit.props.accessibilityState?.disabled).toBe(true);
    const toggle = screen.getByTestId("review-plan-notify-toggle");
    expect(toggle.props.disabled).toBe(true);
    // Stepping still fires (parent may choose to throttle while
    // submitting; the sheet itself doesn't gate row interactions).
    const sideA = screen.getByTestId("review-row-swap:10:20-a");
    const incMin = screen.getAllByLabelText("Increase Min").find((node) => {
      let cur: typeof node | null = node;
      while (cur) {
        if (cur === sideA) return true;
        cur = cur.parent ?? null;
      }
      return false;
    });
    expect(incMin).toBeTruthy();
    fireEvent.press(incMin!);
    expect(onAdjustTime).toHaveBeenCalled();
  });

  // ─── B2-5 — per-row commit status ───────────────────────────────

  it("status: inFlight → spinner badge renders + stepper arrows + Remove disabled", () => {
    const onAdjustTime = jest.fn();
    const onRemove = jest.fn();
    renderSheet(
      [makeSwapRow({ status: { kind: "inFlight" } })],
      { onAdjustTime, onRemove },
    );
    // Badge renders with the inFlight testID.
    expect(screen.getByTestId("review-row-swap:10:20-status")).toBeTruthy();
    expect(screen.getByText("Committing…")).toBeTruthy();
    // Stepper arrows disabled — picking any "Increase Min" inside
    // sideA verifies the gating reached the row.
    const sideA = screen.getByTestId("review-row-swap:10:20-a");
    const incMin = screen.getAllByLabelText("Increase Min").find((node) => {
      let cur: typeof node | null = node;
      while (cur) {
        if (cur === sideA) return true;
        cur = cur.parent ?? null;
      }
      return false;
    });
    expect(incMin).toBeTruthy();
    expect(incMin!.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(incMin!);
    expect(onAdjustTime).not.toHaveBeenCalled();
    // Remove button disabled too — pressing is a no-op.
    const removeBtn = screen.getByLabelText("Remove Mary Johnson from plan");
    expect(removeBtn.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(removeBtn);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("status: committed → green check badge + stepper arrows + Remove disabled", () => {
    const onAdjustTime = jest.fn();
    const onRemove = jest.fn();
    renderSheet(
      [makeInsertRow({ status: { kind: "committed" } })],
      { onAdjustTime, onRemove },
    );
    expect(screen.getByTestId("review-row-insert:30-status")).toBeTruthy();
    expect(screen.getByText("Committed")).toBeTruthy();
    // Stepper disabled.
    const sideA = screen.getByTestId("review-row-insert:30-a");
    const incMin = screen.getAllByLabelText("Increase Min").find((node) => {
      let cur: typeof node | null = node;
      while (cur) {
        if (cur === sideA) return true;
        cur = cur.parent ?? null;
      }
      return false;
    });
    expect(incMin).toBeTruthy();
    expect(incMin!.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(incMin!);
    expect(onAdjustTime).not.toHaveBeenCalled();
    // Remove disabled.
    const removeBtn = screen.getByLabelText("Remove Pat Owens from plan");
    expect(removeBtn.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(removeBtn);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("status: failed → red error badge with message + stepper arrows STAY enabled for retry", () => {
    const onAdjustTime = jest.fn();
    const onRemove = jest.fn();
    renderSheet(
      [
        makeSwapRow({
          status: {
            kind: "failed",
            message: "appointment was cancelled by customer",
          },
        }),
      ],
      { onAdjustTime, onRemove },
    );
    expect(screen.getByTestId("review-row-swap:10:20-status")).toBeTruthy();
    expect(
      screen.getByText(/Failed: appointment was cancelled by customer/),
    ).toBeTruthy();
    // Stepper STAYS enabled — dispatcher can edit + retry.
    const sideA = screen.getByTestId("review-row-swap:10:20-a");
    const incMin = screen.getAllByLabelText("Increase Min").find((node) => {
      let cur: typeof node | null = node;
      while (cur) {
        if (cur === sideA) return true;
        cur = cur.parent ?? null;
      }
      return false;
    });
    expect(incMin).toBeTruthy();
    // accessibilityState.disabled is either undefined OR false on enabled.
    expect(incMin!.props.accessibilityState?.disabled).not.toBe(true);
    fireEvent.press(incMin!);
    expect(onAdjustTime).toHaveBeenCalled();
    // Remove also stays enabled — dispatcher can back out entirely.
    const removeBtn = screen.getByLabelText("Remove Mary Johnson from plan");
    expect(removeBtn.props.accessibilityState?.disabled).not.toBe(true);
    fireEvent.press(removeBtn);
    expect(onRemove).toHaveBeenCalledWith("swap:10:20");
  });

  // ─── B2-6 — Discard plan affordance ─────────────────────────────

  it("Discard plan link renders when rows > 0 and fires onDiscardPlan", () => {
    const onDiscardPlan = jest.fn();
    renderSheet([makeSwapRow()], { onDiscardPlan });
    const discardBtn = screen.getByTestId("review-plan-discard");
    expect(discardBtn).toBeTruthy();
    // Label reflects the row count so screen readers carry the
    // stakes ("Discard 1 pending change" vs "Discard 2 pending
    // changes").
    expect(discardBtn.props.accessibilityLabel).toBe(
      "Discard 1 pending change",
    );
    fireEvent.press(discardBtn);
    expect(onDiscardPlan).toHaveBeenCalledTimes(1);
  });

  it("Discard plan label pluralizes for multiple rows", () => {
    renderSheet([makeSwapRow(), makeInsertRow()]);
    const discardBtn = screen.getByTestId("review-plan-discard");
    expect(discardBtn.props.accessibilityLabel).toBe(
      "Discard 2 pending changes",
    );
  });

  it("Discard plan link is hidden when there are no staged rows", () => {
    renderSheet([]);
    expect(screen.queryByTestId("review-plan-discard")).toBeNull();
  });

  it("Discard plan link is hidden while a commit is in flight", () => {
    // isSubmitting === true means the parent's sequential commit
    // pipeline is mid-walk; nuking the plan client-side would
    // orphan per-row status badges and hide in-flight failures
    // from the dispatcher. Sheet enforces that by hiding the
    // link entirely while isSubmitting is true.
    renderSheet([makeSwapRow()], { isSubmitting: true });
    expect(screen.queryByTestId("review-plan-discard")).toBeNull();
  });

  // ─── B2-7 — per-side duration stepper ──────────────────────────

  it("duration stepper renders the current duration value under each side", () => {
    renderSheet([makeSwapRow()]);
    const aValue = screen.getByTestId("review-row-swap:10:20-a-duration-value");
    const bValue = screen.getByTestId("review-row-swap:10:20-b-duration-value");
    expect(aValue.props.children.join("")).toBe("60 min");
    expect(bValue.props.children.join("")).toBe("60 min");
  });

  it("tapping the extend chevron fires onAdjustDuration with the next 15-min step", () => {
    const onAdjustDuration = jest.fn();
    renderSheet([makeSwapRow()], { onAdjustDuration });
    // Two sides → two buttons; first is side A.
    const [extendA] = screen.getAllByLabelText(
      "Extend appointment by 15 minutes",
    );
    fireEvent.press(extendA);
    expect(onAdjustDuration).toHaveBeenCalledWith("swap:10:20", "a", 75);
  });

  it("tapping the shorten chevron fires onAdjustDuration with the prior step", () => {
    const onAdjustDuration = jest.fn();
    renderSheet([makeSwapRow()], { onAdjustDuration });
    const [shortenA] = screen.getAllByLabelText(
      "Shorten appointment by 15 minutes",
    );
    fireEvent.press(shortenA);
    expect(onAdjustDuration).toHaveBeenCalledWith("swap:10:20", "a", 45);
  });

  it("shorten chevron is disabled at the 15-min floor", () => {
    const onAdjustDuration = jest.fn();
    renderSheet(
      [
        makeSwapRow({
          aSide: {
            name: "Mary Johnson",
            originalHHMM: "09:00",
            proposedStartHHMM: "11:00",
            durationMinutes: 15,
            baseDurationMinutes: 15,
            windowEdges: { startHHMM: "08:00", endHHMM: "13:00" },
            windowLabel: "8:00 AM – 1:00 PM",
          },
        }),
      ],
      { onAdjustDuration },
    );
    const [shortenA] = screen.getAllByLabelText(
      "Shorten appointment by 15 minutes",
    );
    expect(shortenA.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(shortenA);
    expect(onAdjustDuration).not.toHaveBeenCalled();
  });

  it("extend chevron is disabled when the next step would exceed the room from current start", () => {
    const onAdjustDuration = jest.fn();
    renderSheet(
      [
        makeSwapRow({
          aSide: {
            // 60-min appt starting 12:00 with a window ending 13:00 →
            // room from current start is 60. Extending by 15 would
            // become 75 > 60, so the up-chevron must be disabled.
            name: "Mary Johnson",
            originalHHMM: "09:00",
            proposedStartHHMM: "12:00",
            durationMinutes: 60,
            baseDurationMinutes: 60,
            windowEdges: { startHHMM: "08:00", endHHMM: "13:00" },
            windowLabel: "8:00 AM – 1:00 PM",
          },
        }),
      ],
      { onAdjustDuration },
    );
    const [extendA] = screen.getAllByLabelText(
      "Extend appointment by 15 minutes",
    );
    expect(extendA.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(extendA);
    expect(onAdjustDuration).not.toHaveBeenCalled();
  });

  it("duration value renders green when durationMinutes differs from baseDurationMinutes", () => {
    renderSheet([
      makeSwapRow({
        aSide: {
          name: "Mary Johnson",
          originalHHMM: "09:00",
          proposedStartHHMM: "11:00",
          durationMinutes: 75, // overridden
          baseDurationMinutes: 60, // base
          windowEdges: { startHHMM: "08:00", endHHMM: "13:00" },
          windowLabel: "8:00 AM – 1:00 PM",
        },
      }),
    ]);
    const aValue = screen.getByTestId("review-row-swap:10:20-a-duration-value");
    // Flatten styles into a single object — RN passes either an
    // array or an object depending on how the component wrote them.
    const flatStyle = Array.isArray(aValue.props.style)
      ? Object.assign({}, ...aValue.props.style.filter(Boolean))
      : aValue.props.style;
    expect(flatStyle?.color).toBe("#22C55E");
  });

  it("duration stepper arrows are disabled when the row is in-flight", () => {
    const onAdjustDuration = jest.fn();
    renderSheet(
      [makeSwapRow({ status: { kind: "inFlight" } })],
      { onAdjustDuration },
    );
    const [extendA] = screen.getAllByLabelText(
      "Extend appointment by 15 minutes",
    );
    const [shortenA] = screen.getAllByLabelText(
      "Shorten appointment by 15 minutes",
    );
    expect(extendA.props.accessibilityState?.disabled).toBe(true);
    expect(shortenA.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(extendA);
    fireEvent.press(shortenA);
    expect(onAdjustDuration).not.toHaveBeenCalled();
  });

  it("duration stepper arrows STAY enabled when the row is failed (retry edit path)", () => {
    const onAdjustDuration = jest.fn();
    renderSheet(
      [
        makeSwapRow({
          status: { kind: "failed", message: "Network error" },
        }),
      ],
      { onAdjustDuration },
    );
    const [extendA] = screen.getAllByLabelText(
      "Extend appointment by 15 minutes",
    );
    expect(extendA.props.accessibilityState?.disabled).not.toBe(true);
    fireEvent.press(extendA);
    expect(onAdjustDuration).toHaveBeenCalledWith("swap:10:20", "a", 75);
  });
});
