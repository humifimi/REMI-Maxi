/**
 * Tests for `SeverityBadge` (P3-FE-5).
 *
 * One snapshot per severity to lock the color / label / shape
 * contract in `severity-badge.tsx`. Snapshots are intentionally
 * scoped to this primitive — the parent `LinterEdgeCard` also has
 * a snapshot test, but that one focuses on layout composition, not
 * the badge styling itself.
 */

// eslint-disable-next-line import/no-unresolved -- @testing-library/react-native lands with the jest-expo runner.
import { render } from "@testing-library/react-native";

import { SeverityBadge } from "../severity-badge";

describe("SeverityBadge", () => {
  it("renders error severity with red color and 'Error' label by default", () => {
    const node = render(<SeverityBadge severity="error" />);
    expect(node.getByText("Error")).toBeTruthy();
    expect(node.toJSON()).toMatchSnapshot();
  });

  it("renders warning severity with yellow color and 'Warning' label by default", () => {
    const node = render(<SeverityBadge severity="warning" />);
    expect(node.getByText("Warning")).toBeTruthy();
    expect(node.toJSON()).toMatchSnapshot();
  });

  it("uses the `label` prop when provided (custom badge text)", () => {
    const node = render(<SeverityBadge severity="error" label="Blocking" />);
    expect(node.getByText("Blocking")).toBeTruthy();
    // Default text should NOT appear when overridden.
    expect(node.queryByText("Error")).toBeNull();
  });

  it("renders the `small` size variant with reduced padding/font", () => {
    const node = render(<SeverityBadge severity="warning" size="small" />);
    expect(node.toJSON()).toMatchSnapshot();
  });
});
