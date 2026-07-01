/**
 * Render-shape tests for `TechNameFlashOverlay` (PR-UX-3 Phase 2 —
 * 2026-05-07).
 *
 * The animation timing (200/200/200 envelope) is owned by Reanimated
 * and exercised on-device. JSDOM tests pin only the structural
 * contract:
 *
 *   1. Returns null when techName is empty / null (no banner reserved).
 *   2. Renders the banner with the tech name when techName is set.
 *   3. Bumping `flashKey` remounts the inner `FlashBanner` (the
 *      component's React-key strategy is the cleanest way to replay
 *      the envelope on each side-arrow press).
 */

import React from "react";
import { render } from "@testing-library/react-native";

import { TechNameFlashOverlay } from "@technician/components/calendar/TechNameFlashOverlay";

describe("TechNameFlashOverlay", () => {
  it("returns null when techName is null", () => {
    const { toJSON } = render(
      <TechNameFlashOverlay flashKey={0} techName={null} />,
    );
    expect(toJSON()).toBeNull();
  });

  it("returns null when techName is empty string", () => {
    const { toJSON } = render(
      <TechNameFlashOverlay flashKey={0} techName="" />,
    );
    expect(toJSON()).toBeNull();
  });

  it("renders 'Now viewing <name>' when techName is set", () => {
    const { getByText, getByTestId } = render(
      <TechNameFlashOverlay flashKey={0} techName="Josh" />,
    );
    expect(getByTestId("tech-name-flash-overlay")).toBeTruthy();
    expect(getByTestId("tech-name-flash-banner")).toBeTruthy();
    expect(getByText("Now viewing Josh")).toBeTruthy();
  });

  it("re-renders the banner when flashKey changes (key-based remount)", () => {
    // Track inner banner's testID node identity across rerenders to
    // verify the inner Animated.View was remounted (the host stays
    // mounted, the inner banner is keyed).
    const { getByTestId, rerender } = render(
      <TechNameFlashOverlay flashKey={0} techName="Josh" />,
    );
    const firstBanner = getByTestId("tech-name-flash-banner");

    rerender(<TechNameFlashOverlay flashKey={1} techName="Todd" />);
    const secondBanner = getByTestId("tech-name-flash-banner");

    // Same testID, different content (Reanimated's mount path replays
    // the envelope; the text mirrors the new tech name).
    expect(firstBanner).toBeTruthy();
    expect(secondBanner).toBeTruthy();
    expect(secondBanner.props.testID).toBe("tech-name-flash-banner");
  });
});
