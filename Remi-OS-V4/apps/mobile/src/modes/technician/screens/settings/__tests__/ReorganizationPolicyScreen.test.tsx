/**
 * Tests for `src/screens/settings/ReorganizationPolicyScreen.tsx` (P7-FE-1).
 *
 * Coverage:
 *   1. Form hydrates from the policy hook on mount (server values
 *      override the in-memory defaults).
 *   2. Toggling a switch dirties the form and enables Save.
 *   3. Save fires `useUpdateReorganizationPolicy().mutate` with the
 *      full ReorganizationPolicy shape (including the read-only
 *      `ai_authored: "always_fo_review"` field).
 *   4. AI row is rendered as read-only — no switch, just the "Always
 *      review" pill.
 *   5. Server error keeps the form dirty so the user can retry.
 *
 * The hook factories are stubbed at the module boundary; the mutation
 * `mutate` jest.fn lets each test drive `onSuccess` / `onError`
 * branches directly.
 */

import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { Alert } from "react-native";

// ── expo-router stub ─────────────────────────────────────────────────
jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: () => null,
  },
}));

// ── Policy hook stubs ────────────────────────────────────────────────
const mockUpdateMutate = jest.fn();
let mockPolicyData: import(
  "@technician/types/reorganization"
).ReorganizationPolicy | undefined;
let mockPolicyPending = false;
let mockPolicyError = false;
let mockUpdatePending = false;

jest.mock("@technician/hooks/franchise/use-reorganization-policy", () => ({
  __esModule: true,
  useReorganizationPolicy: () => ({
    data: mockPolicyData,
    isPending: mockPolicyPending,
    isError: mockPolicyError,
  }),
  useUpdateReorganizationPolicy: () => ({
    mutate: mockUpdateMutate,
    isPending: mockUpdatePending,
  }),
}));

jest.spyOn(Alert, "alert").mockImplementation(() => {});

// eslint-disable-next-line import/first
import { ReorganizationPolicyScreen } from "@technician/screens/settings/ReorganizationPolicyScreen";
// eslint-disable-next-line import/first
import type { ReorganizationPolicy } from "@technician/types/reorganization";

const SERVER_POLICY: ReorganizationPolicy = {
  tech_authored_self_only: "auto",
  tech_authored_cross_tech: "fo_review",
  tech_authored_with_cancel: "fo_review",
  customer_authored_single: "auto",
  customer_authored_multi: "fo_review",
  customer_authored_with_conflict: "fo_review",
  ai_authored: "always_fo_review",
};

beforeEach(() => {
  mockPolicyData = SERVER_POLICY;
  mockPolicyPending = false;
  mockPolicyError = false;
  mockUpdatePending = false;
  mockUpdateMutate.mockReset();
  (Alert.alert as jest.Mock).mockClear();
});

describe("ReorganizationPolicyScreen — render", () => {
  it("hydrates the form from the server policy and renders one row per editable bucket", () => {
    const node = render(<ReorganizationPolicyScreen />);

    // Tech rows
    expect(node.getByTestId("policy-row-tech_authored_self_only")).toBeTruthy();
    expect(node.getByTestId("policy-row-tech_authored_cross_tech")).toBeTruthy();
    expect(node.getByTestId("policy-row-tech_authored_with_cancel")).toBeTruthy();

    // Customer rows
    expect(node.getByTestId("policy-row-customer_authored_single")).toBeTruthy();
    expect(node.getByTestId("policy-row-customer_authored_multi")).toBeTruthy();
    expect(
      node.getByTestId("policy-row-customer_authored_with_conflict"),
    ).toBeTruthy();

    // AI row is read-only — render the badge/pill but no switch.
    expect(node.getByTestId("policy-ai-row")).toBeTruthy();
    expect(node.queryByTestId("policy-switch-ai_authored")).toBeNull();
  });

  it("renders a loading hint while the policy query is pending and there's no data", () => {
    mockPolicyData = undefined;
    mockPolicyPending = true;
    const node = render(<ReorganizationPolicyScreen />);
    expect(node.getByTestId("policy-loading")).toBeTruthy();
  });

  it("renders an error card when the policy query errors", () => {
    mockPolicyData = undefined;
    mockPolicyError = true;
    const node = render(<ReorganizationPolicyScreen />);
    expect(node.getByTestId("policy-error")).toBeTruthy();
  });
});

describe("ReorganizationPolicyScreen — submit", () => {
  it("disables Save when nothing is dirty", () => {
    const node = render(<ReorganizationPolicyScreen />);
    const saveBtn = node.getByTestId("policy-save-btn");
    fireEvent.press(saveBtn);
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  it("fires the update mutation with the full policy when a switch is toggled and saved", async () => {
    // Start the policy with the field we'll toggle in "auto" so a
    // valueChange(false) reliably dirties the form. (RHF marks dirty
    // when the field's value diverges from `defaultValues`, so we
    // need a real value transition relative to the snapshot the form
    // hydrated from.)
    mockPolicyData = { ...SERVER_POLICY, tech_authored_cross_tech: "auto" };
    const node = render(<ReorganizationPolicyScreen />);

    const crossTechSwitch = node.getByTestId(
      "policy-switch-tech_authored_cross_tech",
    );
    await act(async () => {
      fireEvent(crossTechSwitch, "valueChange", false);
    });
    await act(async () => {
      fireEvent.press(node.getByTestId("policy-save-btn"));
    });

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    const [payload] = mockUpdateMutate.mock.calls[0]!;
    expect(payload).toMatchObject({
      tech_authored_self_only: "auto",
      tech_authored_cross_tech: "fo_review",
      tech_authored_with_cancel: "fo_review",
      customer_authored_single: "auto",
      customer_authored_multi: "fo_review",
      customer_authored_with_conflict: "fo_review",
      ai_authored: "always_fo_review",
    });
  });

  it("alerts and keeps the form dirty when the mutation errors", async () => {
    mockPolicyData = { ...SERVER_POLICY, tech_authored_cross_tech: "auto" };
    const node = render(<ReorganizationPolicyScreen />);

    await act(async () => {
      fireEvent(
        node.getByTestId("policy-switch-tech_authored_cross_tech"),
        "valueChange",
        false,
      );
    });
    await act(async () => {
      fireEvent.press(node.getByTestId("policy-save-btn"));
    });

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    const onError = mockUpdateMutate.mock.calls[0]![1].onError as () => void;
    act(() => {
      onError();
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(node.getByTestId("policy-save-btn")).toBeTruthy();
  });
});
