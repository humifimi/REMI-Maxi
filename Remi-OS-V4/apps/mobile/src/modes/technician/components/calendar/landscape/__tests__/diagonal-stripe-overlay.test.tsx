/**
 * Tests for `DiagonalStripeOverlay` (P2-FE-4) — used to differentiate
 * personal events from work events in landscape overlay mode (master
 * plan §5.1.4).
 *
 * NOTE (executable spec): see the header in
 * `LandscapeWorkweekView.test.tsx` for the runner caveat — this file
 * is excluded from `tsc --noEmit` via `**\/__tests__\/**` in
 * `tsconfig.json` and is treated as executable specification until
 * the `jest-expo` scaffold lands.
 */

// eslint-disable-next-line import/no-unresolved -- @testing-library/react-native lands with the jest-expo runner.
import { render } from "@testing-library/react-native";

import { DiagonalStripeOverlay } from "../diagonal-stripe-overlay";

// `react-native-svg` ships native modules; mock to plain Views so the
// renderer can introspect props without bridging into the native side.
jest.mock("react-native-svg", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Svg = ({ children, ...rest }: { children?: React.ReactNode }) => (
    <View testID="svg-root" {...rest}>{children}</View>
  );
  const Line = (props: Record<string, unknown>) => (
    <View testID="svg-line" data-props={JSON.stringify(props)} />
  );
  return { __esModule: true, default: Svg, Line };
});

describe("DiagonalStripeOverlay", () => {
  it("renders a non-empty set of diagonal lines (default 200×200 viewport)", () => {
    const node = render(<DiagonalStripeOverlay stripeColor="#FF0000" />);
    const lines = node.getAllByTestId("svg-line");
    expect(lines.length).toBeGreaterThan(0);
  });

  it("respects a custom spacing — fewer lines as spacing grows", () => {
    const tight = render(
      <DiagonalStripeOverlay stripeColor="#000" spacing={4} />,
    );
    const loose = render(
      <DiagonalStripeOverlay stripeColor="#000" spacing={32} />,
    );
    expect(tight.getAllByTestId("svg-line").length).toBeGreaterThan(
      loose.getAllByTestId("svg-line").length,
    );
  });
});
