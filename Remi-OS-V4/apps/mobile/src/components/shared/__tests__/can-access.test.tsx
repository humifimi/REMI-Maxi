/**
 * LDM-WAVE-1 CHUNK-2 — Hermetic tests for the `<CanAccess>` component.
 *
 * Covers the four behaviors from the chunk-2 spec:
 *
 *   - mode="hide" (default): renders children when the cap is present.
 *   - mode="hide" + cap absent: renders `null` (or `fallback` when one
 *     is provided).
 *   - mode="disable" + cap present: renders children unwrapped.
 *   - mode="disable" + cap absent: still renders children, but wrapped
 *     in a `<View opacity=0.4 pointerEvents="none">` so the UI dims
 *     and stops forwarding touches.
 *
 * The `useCapability` hook is mocked so these tests do not depend on
 * the auth store or the query client. We toggle the mocked boolean per
 * test rather than mocking `useCapabilities` directly because
 * `<CanAccess>` consumes only the boolean wrapper — see
 * `use-capability.test.tsx` for the underlying fail-closed contract.
 */

import { render } from "@testing-library/react-native";
import { Text, View } from "react-native";

import { CanAccess } from "../can-access";
import { useCapability } from "@technician/hooks/auth/use-capability";

jest.mock("@technician/hooks/auth/use-capability");

const mockedUseCapability = useCapability as jest.MockedFunction<
  typeof useCapability
>;

afterEach(() => {
  jest.resetAllMocks();
});

describe("CanAccess — mode=\"hide\" (default)", () => {
  it("renders children when the capability is present", () => {
    mockedUseCapability.mockReturnValue(true);

    const node = render(
      <CanAccess capability="dispatch.reassign">
        <Text testID="child">Reassign</Text>
      </CanAccess>,
    );

    expect(node.getByTestId("child")).toBeTruthy();
  });

  it("renders nothing when the capability is absent and no fallback is provided", () => {
    mockedUseCapability.mockReturnValue(false);

    const node = render(
      <CanAccess capability="dispatch.reassign">
        <Text testID="child">Reassign</Text>
      </CanAccess>,
    );

    expect(node.queryByTestId("child")).toBeNull();
  });

  it("renders the fallback when the capability is absent", () => {
    mockedUseCapability.mockReturnValue(false);

    const node = render(
      <CanAccess
        capability="dispatch.reassign"
        fallback={<Text testID="fallback">No access</Text>}
      >
        <Text testID="child">Reassign</Text>
      </CanAccess>,
    );

    expect(node.queryByTestId("child")).toBeNull();
    expect(node.getByTestId("fallback")).toBeTruthy();
  });

  it("does not render the fallback when the capability is present", () => {
    mockedUseCapability.mockReturnValue(true);

    const node = render(
      <CanAccess
        capability="dispatch.reassign"
        fallback={<Text testID="fallback">No access</Text>}
      >
        <Text testID="child">Reassign</Text>
      </CanAccess>,
    );

    expect(node.getByTestId("child")).toBeTruthy();
    expect(node.queryByTestId("fallback")).toBeNull();
  });
});

describe("CanAccess — mode=\"disable\"", () => {
  it("renders children unwrapped when the capability is present", () => {
    mockedUseCapability.mockReturnValue(true);

    const node = render(
      <CanAccess capability="dispatch.reassign" mode="disable">
        <Text testID="child">Reassign</Text>
      </CanAccess>,
    );

    expect(node.getByTestId("child")).toBeTruthy();

    // No dimming wrapper when granted — children render straight through.
    const tree = node.toJSON();
    const treeStr = JSON.stringify(tree);
    expect(treeStr).not.toContain('"opacity":0.4');
  });

  it("renders children wrapped in a dimmed, non-interactive View when the capability is absent", () => {
    mockedUseCapability.mockReturnValue(false);

    const node = render(
      <CanAccess capability="dispatch.reassign" mode="disable">
        <Text testID="child">Reassign</Text>
      </CanAccess>,
    );

    // Child is still mounted (the whole point of "disable" mode — the
    // user sees the control exists, they just can't operate it).
    expect(node.getByTestId("child")).toBeTruthy();

    // The wrapper View must dim to 0.4 opacity and refuse pointer events.
    const tree = node.toJSON();
    const treeStr = JSON.stringify(tree);
    expect(treeStr).toContain('"opacity":0.4');
    // `pointerEvents="none"` lands either as a prop on the View or as
    // a style key depending on the RN version; check both for
    // forward-compat across the RN 0.81 props→style migration.
    expect(
      treeStr.includes('"pointerEvents":"none"') ||
        treeStr.includes("pointerEvents=\"none\""),
    ).toBe(true);
  });

  it("ignores the fallback prop in disable mode", () => {
    // Per spec: `fallback` is a `mode=\"hide\"` concept. In
    // `mode=\"disable\"` the children are always rendered (just dimmed
    // when absent), so any fallback passed should be a no-op.
    mockedUseCapability.mockReturnValue(false);

    const node = render(
      <CanAccess
        capability="dispatch.reassign"
        mode="disable"
        fallback={<Text testID="fallback">No access</Text>}
      >
        <Text testID="child">Reassign</Text>
      </CanAccess>,
    );

    expect(node.getByTestId("child")).toBeTruthy();
    expect(node.queryByTestId("fallback")).toBeNull();
  });
});

describe("CanAccess — composition", () => {
  it("works with multiple children (Fragment passthrough)", () => {
    mockedUseCapability.mockReturnValue(true);

    const node = render(
      <CanAccess capability="dispatch.reassign">
        <View testID="wrapper">
          <Text testID="a">A</Text>
          <Text testID="b">B</Text>
        </View>
      </CanAccess>,
    );

    expect(node.getByTestId("a")).toBeTruthy();
    expect(node.getByTestId("b")).toBeTruthy();
  });
});
