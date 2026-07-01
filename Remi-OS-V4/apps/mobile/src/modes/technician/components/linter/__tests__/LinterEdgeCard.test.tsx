/**
 * Tests for `LinterEdgeCard` (P3-FE-5; visual reconciliation pass:
 * P3-FE-10).
 *
 * Coverage:
 *   - Snapshot of the standalone (`showKindLabel: true`) error
 *     variant with an auto-fix payload — full chrome (border,
 *     radius, shadow) + header pill + KIND_LABEL + message +
 *     affected list + enabled CTA. This is the chrome the dev
 *     screen `LinterPrimitivesExample` and any future popover
 *     surface mount.
 *   - Snapshot of the standalone (`showKindLabel: true`) warning
 *     variant with no payload and no `onApplyAutoFix` (CTA
 *     hidden entirely).
 *   - Snapshot of the nested (`showKindLabel: false`, default)
 *     production case used by `app/pending-reality/review.tsx` —
 *     no outer border/radius/shadow, no header row, severity
 *     conveyed by left accent + tint + top separator (P3-FE-10
 *     contract).
 *   - Tapping an affected appointment ID calls `router.push` with
 *     the canonical `/order/${id}` route.
 *   - Tapping the enabled auto-fix CTA forwards to the parent's
 *     `onApplyAutoFix`.
 */

import { fireEvent, render } from "@testing-library/react-native";

import { LinterEdgeCard } from "../linter-edge-card";
import type { LinterIssue } from "@technician/utils/logistics-linter";

// Jest hoists `jest.mock()` calls above imports. Anything referenced
// inside the factory must therefore either be inlined or be a
// variable whose name starts with `mock` (case-insensitive) — that's
// jest's escape hatch for shared spies. See the "out-of-scope
// variables" check in `babel-plugin-jest-hoist`.
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: mockPush }),
}));

const ERROR_ISSUE: LinterIssue = {
  severity: "error",
  kind: "time_conflict",
  affectedAppointmentIds: [101, 102],
  humanMessage:
    "Two changes in this session put technician 5 into overlapping work on 2026-05-04: 10:00-11:00 and 10:30-11:30.",
  suggestedAutoFix: {
    kind: "reschedule",
    new_scheduled_date: "2026-05-04",
    new_start_time: "11:05",
    new_end_time: "12:05",
    new_technician_id: 5,
  },
};

// `LinterEdgeCard` runs `humanMessage` through `humanizeLinterMessage`
// (`src/utils/format-display.ts`), which substitutes `YYYY-MM-DD`
// substrings with their `Sun, Apr 26` formatted equivalent. The
// assertions below match the rendered (humanized) text, not the raw
// wire `humanMessage`. Keep this constant in lockstep with
// `ERROR_ISSUE.humanMessage` whenever the wire string changes.
const ERROR_ISSUE_RENDERED_MESSAGE =
  "Two changes in this session put technician 5 into overlapping work on Mon, May 4: 10:00-11:00 and 10:30-11:30.";

const WARNING_ISSUE: LinterIssue = {
  severity: "warning",
  kind: "fleet_capacity",
  affectedAppointmentIds: [200],
  humanMessage:
    "Reassigning fleet 100's appointment to technician 9 would put them at 4/3 fleet jobs this week.",
};

describe("LinterEdgeCard", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("renders standalone error variant with kind label, humanMessage, affected IDs, and enabled CTA", () => {
    const onApplyAutoFix = jest.fn();
    const node = render(
      <LinterEdgeCard
        issue={ERROR_ISSUE}
        onApplyAutoFix={onApplyAutoFix}
        showKindLabel
      />,
    );

    expect(node.getByText("Time conflict")).toBeTruthy();
    expect(node.getByText(ERROR_ISSUE_RENDERED_MESSAGE)).toBeTruthy();
    expect(node.getByText("#101,")).toBeTruthy();
    expect(node.getByText("#102")).toBeTruthy();
    expect(node.getByText("Apply suggested fix")).toBeTruthy();
    expect(node.toJSON()).toMatchSnapshot();
  });

  it("renders standalone warning variant with no CTA when `onApplyAutoFix` is omitted", () => {
    const node = render(<LinterEdgeCard issue={WARNING_ISSUE} showKindLabel />);

    expect(node.getByText("Fleet capacity exceeded")).toBeTruthy();
    expect(node.getByText(WARNING_ISSUE.humanMessage)).toBeTruthy();
    expect(node.getByText("#200")).toBeTruthy();
    // CTA hidden entirely when parent does not pass a handler.
    expect(node.queryByText("Apply suggested fix")).toBeNull();
    expect(node.queryByText("No auto-fix available")).toBeNull();
    expect(node.toJSON()).toMatchSnapshot();
  });

  it("renders nested production variant (default) with no header row — severity conveyed by left accent + tint", () => {
    const onApplyAutoFix = jest.fn();
    const node = render(
      <LinterEdgeCard issue={ERROR_ISSUE} onApplyAutoFix={onApplyAutoFix} />,
    );

    // Body content still present.
    expect(node.getByText(ERROR_ISSUE_RENDERED_MESSAGE)).toBeTruthy();
    expect(node.getByText("#101,")).toBeTruthy();
    expect(node.getByText("#102")).toBeTruthy();
    expect(node.getByText("Apply suggested fix")).toBeTruthy();
    // Header row dropped — KIND_LABEL and the standalone
    // SeverityBadge "Error" pill are NOT rendered in nested mode
    // (the parent `IntentCard` already names the target).
    expect(node.queryByText("Time conflict")).toBeNull();
    expect(node.queryByText("Error")).toBeNull();
    expect(node.toJSON()).toMatchSnapshot();
  });

  it("linkifies affected appointment IDs to `/order/${id}` via expo-router", () => {
    const node = render(
      <LinterEdgeCard issue={ERROR_ISSUE} onApplyAutoFix={jest.fn()} />,
    );

    fireEvent.press(node.getByTestId("linter-edge-card-id-101"));
    expect(mockPush).toHaveBeenCalledWith("/order/101");

    fireEvent.press(node.getByTestId("linter-edge-card-id-102"));
    expect(mockPush).toHaveBeenCalledWith("/order/102");
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it("forwards the enabled CTA press to `onApplyAutoFix`", () => {
    const onApplyAutoFix = jest.fn();
    const node = render(
      <LinterEdgeCard issue={ERROR_ISSUE} onApplyAutoFix={onApplyAutoFix} />,
    );

    fireEvent.press(node.getByText("Apply suggested fix"));

    expect(onApplyAutoFix).toHaveBeenCalledTimes(1);
  });

  it("renders a disabled CTA when `onApplyAutoFix` is supplied but the issue has no payload", () => {
    const onApplyAutoFix = jest.fn();
    const node = render(
      <LinterEdgeCard issue={WARNING_ISSUE} onApplyAutoFix={onApplyAutoFix} />,
    );

    expect(node.getByText("No auto-fix available")).toBeTruthy();
    fireEvent.press(node.getByText("No auto-fix available"));
    expect(onApplyAutoFix).not.toHaveBeenCalled();
  });

  // 2026-05-10 smoke fix: "Affects:" pill row must dedup so a single
  // logical conflict surfaces as a single pill per affected entity.
  // Two passes:
  //   1. By appointment ID (defense in depth — handles any future
  //      linter rule that ships a non-deduped affected array).
  //   2. By display label (when both colliding entries have a
  //      `customer_name` resolved by the day-view lookup map). The
  //      user-reported "Daniel Kim, Daniel Kim" symptom was two
  //      DIFFERENT appointment IDs both belonging to customer
  //      "Daniel Kim" — collapsing them keeps the chip row readable.
  describe("dedups the Affects pill row", () => {
    it("collapses duplicate appointment IDs (defense against undeduped linter input)", () => {
      const issue: LinterIssue = {
        severity: "error",
        kind: "time_conflict",
        // Same id appears twice — the linter currently dedups at
        // source, but the renderer should not trust that contract.
        affectedAppointmentIds: [101, 101, 102],
        humanMessage: "Two changes overlap.",
      };

      const node = render(<LinterEdgeCard issue={issue} showKindLabel />);

      // Only one pill per unique id renders. queryAllByText would
      // double-count if the pill repeated — checking the trailing
      // comma form ("#101,") narrows the match to a single chip.
      expect(node.queryAllByText("#101,")).toHaveLength(1);
      expect(node.queryAllByText("#102")).toHaveLength(1);
    });

    it("collapses two distinct IDs that resolve to the same customer label", () => {
      // Reproducer for the user-reported "Daniel Kim, Daniel Kim"
      // bug: appointment 51354 and the proposed reschedule both
      // belong to the same customer.
      const issue: LinterIssue = {
        severity: "error",
        kind: "time_conflict",
        affectedAppointmentIds: [51354, 51999],
        humanMessage:
          "Proposed time 12:35 PM-1:20 PM overlaps committed appointment #51354.",
      };
      const lookups = {
        appointmentLabels: new Map<number, string>([
          [51354, "Daniel Kim"],
          [51999, "Daniel Kim"],
        ]),
        technicianNames: new Map<number, string>(),
      };

      const node = render(
        <LinterEdgeCard
          issue={issue}
          showKindLabel
          displayLookups={lookups}
        />,
      );

      // Only ONE "Daniel Kim" pill renders, not two. (No trailing
      // comma because only one entry remains after dedup.)
      expect(node.queryAllByText("Daniel Kim")).toHaveLength(1);
      // Bare-id pill never renders because both ids resolved.
      expect(node.queryByText("#51354")).toBeNull();
      expect(node.queryByText("#51999")).toBeNull();
    });

    it("keeps two pills when one id resolves to a customer name and the other doesn't", () => {
      // Mirror of the user's second screenshot row: "Affects: Emily
      // Watson, #51442". One id resolved by the day-view cache, the
      // other (off-canvas appointment) didn't — both should render,
      // not collapse.
      const issue: LinterIssue = {
        severity: "error",
        kind: "time_conflict",
        affectedAppointmentIds: [51000, 51442],
        humanMessage:
          "Proposed time 9:45 AM-10:30 AM overlaps committed appointment #51442.",
      };
      const lookups = {
        appointmentLabels: new Map<number, string>([[51000, "Emily Watson"]]),
        technicianNames: new Map<number, string>(),
      };

      const node = render(
        <LinterEdgeCard
          issue={issue}
          showKindLabel
          displayLookups={lookups}
        />,
      );

      expect(node.queryByText("Emily Watson,")).toBeTruthy();
      expect(node.queryByText("#51442")).toBeTruthy();
    });

    it("does NOT collapse two bare-id pills with different ids (no labels available)", () => {
      // Defense against the obvious mistake: collapsing by display
      // name when both displays are bare `#NNN` would collapse
      // distinct ids that just happened to share an unlucky id.
      // (`#101` and `#102` are visually distinct strings, so the
      // dedup rule only fires when LABELS collide, not raw ids.)
      const issue: LinterIssue = {
        severity: "error",
        kind: "time_conflict",
        affectedAppointmentIds: [101, 102],
        humanMessage: "Bare-id case.",
      };

      const node = render(<LinterEdgeCard issue={issue} showKindLabel />);

      expect(node.queryByText("#101,")).toBeTruthy();
      expect(node.queryByText("#102")).toBeTruthy();
    });
  });
});
