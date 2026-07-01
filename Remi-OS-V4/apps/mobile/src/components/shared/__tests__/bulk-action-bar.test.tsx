/**
 * Phase 4 Chunk 4.5 — tests for `BulkActionBar`'s per-action
 * `disabled?: boolean` extension. The Receipts button gates itself
 * during the ~10s wall-time of an N=20 batch PDF render, so the user
 * can't double-tap; this suite locks in:
 *
 *   - Pre-existing behavior: ALL buttons disabled when selectedCount === 0.
 *   - New per-action behavior: a specific button is disabled when its
 *     `disabled` field is true, even though selectedCount > 0.
 *   - Isolation: other buttons remain enabled when only one's `disabled`
 *     is true (no cross-contamination).
 *   - Default behavior preserved: omitting `disabled` is identical to
 *     `disabled: false`.
 */

// eslint-disable-next-line import/no-unresolved -- @testing-library/react-native lands with the jest-expo runner.
import { fireEvent, render } from "@testing-library/react-native";
import { BulkActionBar, type BulkAction } from "../bulk-action-bar";

const noopAction = (key: string, override?: Partial<BulkAction>): BulkAction => ({
  key,
  icon: "swap-horiz",
  label: key,
  color: "#3B82F6",
  onPress: jest.fn(),
  ...override,
});

describe("BulkActionBar — disabled-state behavior", () => {
  it("disables ALL action buttons when selectedCount === 0 (existing behavior preserved)", () => {
    const actions = [
      noopAction("a"),
      noopAction("b"),
      noopAction("c"),
    ];
    const node = render(
      <BulkActionBar
        selectedCount={0}
        actions={actions}
        onSelectAll={jest.fn()}
        onDone={jest.fn()}
      />,
    );

    // Tap each button — none should fire because all are disabled.
    fireEvent.press(node.getByText("a"));
    fireEvent.press(node.getByText("b"));
    fireEvent.press(node.getByText("c"));

    expect(actions[0].onPress).not.toHaveBeenCalled();
    expect(actions[1].onPress).not.toHaveBeenCalled();
    expect(actions[2].onPress).not.toHaveBeenCalled();
  });

  it("disables only the action with `disabled: true` when selectedCount > 0", () => {
    const actions = [
      noopAction("alpha"),
      noopAction("beta", { disabled: true }),
      noopAction("gamma"),
    ];
    const node = render(
      <BulkActionBar
        selectedCount={3}
        actions={actions}
        onSelectAll={jest.fn()}
        onDone={jest.fn()}
      />,
    );

    fireEvent.press(node.getByText("alpha"));
    fireEvent.press(node.getByText("beta"));
    fireEvent.press(node.getByText("gamma"));

    // alpha + gamma fire; beta does NOT.
    expect(actions[0].onPress).toHaveBeenCalledTimes(1);
    expect(actions[1].onPress).not.toHaveBeenCalled();
    expect(actions[2].onPress).toHaveBeenCalledTimes(1);
  });

  it("treats omitted `disabled` field as false (non-breaking default)", () => {
    // Build actions with NO `disabled` field at all — these must
    // behave identically to the pre-Chunk-4.5 button declarations.
    const actions: BulkAction[] = [
      { key: "x", icon: "swap-horiz", label: "x", color: "#3B82F6", onPress: jest.fn() },
      { key: "y", icon: "event", label: "y", color: "#3B82F6", onPress: jest.fn() },
    ];
    const node = render(
      <BulkActionBar
        selectedCount={2}
        actions={actions}
        onSelectAll={jest.fn()}
        onDone={jest.fn()}
      />,
    );

    fireEvent.press(node.getByText("x"));
    fireEvent.press(node.getByText("y"));

    expect(actions[0].onPress).toHaveBeenCalledTimes(1);
    expect(actions[1].onPress).toHaveBeenCalledTimes(1);
  });

  it("re-enables a previously-disabled action when its `disabled` field flips back to false", () => {
    const actions = [noopAction("flippy", { disabled: true })];
    const node = render(
      <BulkActionBar
        selectedCount={1}
        actions={actions}
        onSelectAll={jest.fn()}
        onDone={jest.fn()}
      />,
    );

    fireEvent.press(node.getByText("flippy"));
    expect(actions[0].onPress).not.toHaveBeenCalled();

    // Flip disabled false (simulates `exportReceipts.isPending` toggling
    // back from true → false after the mutation resolves).
    const enabledActions = [{ ...actions[0], disabled: false }];
    node.rerender(
      <BulkActionBar
        selectedCount={1}
        actions={enabledActions}
        onSelectAll={jest.fn()}
        onDone={jest.fn()}
      />,
    );

    fireEvent.press(node.getByText("flippy"));
    expect(enabledActions[0].onPress).toHaveBeenCalledTimes(1);
  });
});
