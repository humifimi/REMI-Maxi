/**
 * Tests for `AutoFixButton` (P3-FE-5).
 *
 * Coverage:
 *   1. Snapshot of the enabled (primary) state when a payload is
 *      supplied.
 *   2. Snapshot of the disabled state when `suggestedAutoFix` is
 *      undefined.
 *   3. Interaction: pressing the enabled button fires `onApply`.
 *   4. Interaction: pressing the disabled button is a no-op.
 */

// eslint-disable-next-line import/no-unresolved -- @testing-library/react-native lands with the jest-expo runner.
import { fireEvent, render } from "@testing-library/react-native";

import { AutoFixButton } from "../auto-fix-button";
import type { ReorganizationIntentPayload } from "@technician/types/reorganization";

const SAMPLE_PAYLOAD: ReorganizationIntentPayload = {
  kind: "reschedule",
  new_scheduled_date: "2026-05-04",
  new_start_time: "11:05",
  new_end_time: "12:05",
  new_technician_id: 5,
};

describe("AutoFixButton", () => {
  it("renders enabled with 'Apply suggested fix' when a payload is supplied", () => {
    const onApply = jest.fn();
    const node = render(
      <AutoFixButton suggestedAutoFix={SAMPLE_PAYLOAD} onApply={onApply} />,
    );
    expect(node.getByText("Apply suggested fix")).toBeTruthy();
    expect(node.toJSON()).toMatchSnapshot();
  });

  it("renders disabled with 'No auto-fix available' when no payload is supplied", () => {
    const onApply = jest.fn();
    const node = render(
      <AutoFixButton suggestedAutoFix={undefined} onApply={onApply} />,
    );
    expect(node.getByText("No auto-fix available")).toBeTruthy();
    expect(node.toJSON()).toMatchSnapshot();
  });

  it("calls onApply exactly once when the enabled button is pressed", () => {
    const onApply = jest.fn();
    const node = render(
      <AutoFixButton suggestedAutoFix={SAMPLE_PAYLOAD} onApply={onApply} />,
    );

    fireEvent.press(node.getByText("Apply suggested fix"));

    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onApply when the disabled button is pressed", () => {
    const onApply = jest.fn();
    const node = render(
      <AutoFixButton suggestedAutoFix={undefined} onApply={onApply} />,
    );

    fireEvent.press(node.getByText("No auto-fix available"));

    expect(onApply).not.toHaveBeenCalled();
  });

  it("respects a custom `label` only on the enabled state", () => {
    const onApply = jest.fn();
    const node = render(
      <AutoFixButton
        suggestedAutoFix={SAMPLE_PAYLOAD}
        onApply={onApply}
        label="Shift to 11:05"
      />,
    );
    expect(node.getByText("Shift to 11:05")).toBeTruthy();

    // Disabled state ignores the override (intentional — the disabled
    // copy is a fixed system message, not a per-rule string).
    node.rerender(
      <AutoFixButton
        suggestedAutoFix={undefined}
        onApply={onApply}
        label="Shift to 11:05"
      />,
    );
    expect(node.getByText("No auto-fix available")).toBeTruthy();
    expect(node.queryByText("Shift to 11:05")).toBeNull();
  });
});
