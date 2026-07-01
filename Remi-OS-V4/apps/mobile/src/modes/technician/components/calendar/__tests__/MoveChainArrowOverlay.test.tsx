/**
 * Tests for `MoveChainArrowOverlay` — pointerEvents regression guard
 * (avatar-reorder regression fix, 2026-05-05).
 *
 * The user reported the avatar long-press → reorder gesture broke
 * after PR-UX-2 PASS 2.x landed (FORK Phase 24/25 + chain overlays).
 * One of the four hypotheses captured in the bug-investigation prompt
 * was:
 *
 *   "A. Overlay swallows touches: A new absolutely-positioned overlay
 *    (likely MoveChainArrowOverlay or a pulse-related wrapper) covers
 *    the resource header strip without pointerEvents='none', swallowing
 *    the LongPress before it reaches the avatar."
 *
 * Hypothesis A could not be reproduced via static analysis — both
 * `View`s in the overlay tree explicitly carry `pointerEvents="none"`.
 * This spec locks that contract in so a future refactor that strips
 * the prop (or replaces "none" with "box-none" / "auto") fails CI loud
 * instead of silently re-introducing the regression.
 *
 * The wider regression fix (PASS 25.3) lives in the vendored
 * `EventBlock` — moving the render-time `lastPhaseRef` mutation behind
 * a `useEffect`. That fix is verified by the existing pulse/border
 * suites; this file specifically guards the overlay's
 * pointer-transparency contract.
 */

import React from "react";
import { processColor } from "react-native";
import { render } from "@testing-library/react-native";

import { MoveChainArrowOverlay } from "@technician/components/calendar/MoveChainArrowOverlay";
import type { MoveChainArrowSegment } from "@technician/components/calendar/compute-move-chain-arrows";

/**
 * Helper for the PR-UX-21 color-contract tests below.
 *
 * `react-native-svg` runs string colors through RN's `processColor`
 * (returning a single integer) and wraps the result in a tagged
 * `{ payload: number, type: 0 }` object representing a "solid color"
 * brush. The host node's `stroke` / `fill` props therefore arrive as
 * that brush object, not the original `"#F59E0B"` string. This helper
 * recovers the original numeric payload for comparison.
 */
function expectedSolidColor(hex: string): { payload: number; type: 0 } {
  const payload = processColor(hex);
  if (typeof payload !== "number") {
    throw new Error(
      `processColor(${hex}) did not return a number — RN environment ` +
        "shape changed and the brush comparison helper needs updating.",
    );
  }
  return { payload, type: 0 };
}

// `MoveChainArrowOverlay` returns null when there are no resolved
// arrows (no segments / both endpoints null), so we feed it ONE
// fully-resolved segment so the overlay actually mounts and we can
// assert on the mounted node's props.
const SEGMENT: MoveChainArrowSegment = {
  intentId: 1,
  chainId: "chain-1",
  color: "#8B5CF6",
  from: { x: 10, y: 20 },
  to: { x: 100, y: 200 },
  fromOffscreen: null,
  toOffscreen: null,
};

describe("MoveChainArrowOverlay — pointerEvents contract", () => {
  it("renders the outer wrapper with pointerEvents='none' so taps fall through to the avatar header / event tiles", () => {
    const { getByTestId } = render(
      <MoveChainArrowOverlay
        segments={[SEGMENT]}
        width={400}
        height={600}
        bodyTopOffset={80}
        active
      />,
    );

    const wrapper = getByTestId("move-chain-arrow-overlay");
    // RN's `pointerEvents` lands on the host node's props as
    // `pointerEvents` (RN ≥0.70 normalizes the prop and style form).
    expect(wrapper.props.pointerEvents).toBe("none");
  });

  it("renders nothing when active=false (no overlay node, no touch surface)", () => {
    const { queryByTestId } = render(
      <MoveChainArrowOverlay
        segments={[SEGMENT]}
        width={400}
        height={600}
        bodyTopOffset={80}
        active={false}
      />,
    );

    // When the overlay is inactive it should not be in the tree at
    // all — there is no node to leak touches.
    expect(queryByTestId("move-chain-arrow-overlay")).toBeNull();
  });

  it("renders nothing when there are no resolvable arrows", () => {
    const { queryByTestId } = render(
      <MoveChainArrowOverlay
        segments={[]}
        width={400}
        height={600}
        bodyTopOffset={80}
        active
      />,
    );

    expect(queryByTestId("move-chain-arrow-overlay")).toBeNull();
  });
});

/**
 * PR-UX-21 (2026-05-09) — landscape-arrows test surface.
 *
 * The arrow overlay was originally written for portrait day / portrait
 * workweek and is mounted in `landscape/LandscapeWorkweekView.tsx` via
 * the same `<MoveChainArrowOverlay>` instance with the workweek-shape
 * geometry helper. Per the PR-UX-21 prompt: "earlier attempts" wired
 * arrows in landscape but they drifted on scroll because they were
 * positioned via `measureInWindow` (window-relative), so as soon as the
 * calendar's vertical ScrollView moved underneath the body content, the
 * overlay stayed glued to the viewport instead of the events.
 *
 * The current shape mounts the overlay as a sibling of `<Calendar>`
 * inside the same parent `<View ref={calendarWrapperRef}>` — a parent
 * that ALSO contains the vendored Calendar's internal scroll
 * container — and uses Reanimated's `scrollYRef` SharedValue (handed
 * back via `<Calendar onScrollYRef>`) to translate the inner SVG layer
 * by `-scrollY` on every scroll tick. This lets the overlay's painted
 * coordinates stay in body space (y=0 at the body grid origin) while
 * the painted output visually tracks the body content at 60Hz.
 *
 * These tests pin that contract without driving a real scroll. They
 * verify:
 *
 *   (a) The overlay renders one Path per resolvable segment, with a
 *       stable React key per (chainId, intentId) — so a chain with N
 *       links produces exactly N path nodes.
 *   (b) Each rendered Path's stroke matches the segment's `color` —
 *       the `compute-move-chain-arrows.ts` layer is the source of
 *       truth for chain colors (per-step ordinal palette today; the
 *       overlay has no opinion).
 *   (c) The translatable inner layer mounts whenever the overlay
 *       mounts, so the `useAnimatedStyle`'s `translateY: -scrollY`
 *       worklet has somewhere to land its transform when the host
 *       feeds in a `scrollYRef`. This is the structural guarantee
 *       behind the "scrolls with the body" behavior — the test
 *       framework's worklet harness doesn't run real Reanimated
 *       transforms, but a missing translatable layer would break the
 *       contract loudly on-device.
 *
 * What we deliberately do NOT test here:
 *
 *   - Drift-on-scroll geometry (requires an on-device frame pipeline;
 *     covered by the user's manual smoke pass per PR-UX-21).
 *   - Per-chain de-emphasis opacity (PR-UX-21 leaves arrow opacity at
 *     1.0 — the chain spotlight is rendered through the tile-pulse
 *     resolver, not the arrow stroke; non-selected chains are never
 *     present in `arrowSegments` at the call site so a 0.5-opacity
 *     fallback would be unreachable).
 *   - Multi-tech landscape (current call site restricts the overlay
 *     to `selectedTechIds.length === 1`; cross-tech overlay-mode is a
 *     separate follow-up).
 */
function makeSegment(
  intentId: number,
  chainId: string,
  color: string,
  options: Partial<MoveChainArrowSegment> = {},
): MoveChainArrowSegment {
  return {
    intentId,
    chainId,
    color,
    from: { x: 60, y: 100 + intentId * 80 },
    to: { x: 220, y: 180 + intentId * 80 },
    fromOffscreen: null,
    toOffscreen: null,
    ...options,
  };
}

describe("MoveChainArrowOverlay — PR-UX-21 landscape-arrows contract", () => {
  it("renders exactly one path + arrowhead per resolvable segment (multi-link chain)", () => {
    // 3-link chain: link[0]→link[1], link[1]→link[2], link[2]→link[3].
    // The compute layer emits one segment per intent inside the chain,
    // so a chain of 3 reschedules emits 3 segments. The overlay must
    // paint one path + one arrowhead per segment, no more, no fewer.
    const segments = [
      makeSegment(1001, "chain-a", "#8B5CF6"),
      makeSegment(1002, "chain-a", "#8B5CF6"),
      makeSegment(1003, "chain-a", "#8B5CF6"),
    ];

    const { getAllByTestId } = render(
      <MoveChainArrowOverlay
        segments={segments}
        width={400}
        height={600}
        bodyTopOffset={44}
        active
      />,
    );

    // PR-UX-21 testIDs are `move-chain-arrow-path-${chainId}-${intentId}`
    // and `move-chain-arrow-head-${chainId}-${intentId}` so duplicate
    // chain ids (or duplicate intent ids across chains) never collide.
    const paths = getAllByTestId(/^move-chain-arrow-path-/);
    const heads = getAllByTestId(/^move-chain-arrow-head-/);
    expect(paths).toHaveLength(3);
    expect(heads).toHaveLength(3);
  });

  it("paints each arrow with the segment's color (no overlay-side recoloring)", () => {
    // Two segments with distinct per-step colors — the overlay must
    // NOT collapse them onto a single chain-color or fall back to
    // anything else. The `seg.color` field is the contract; the
    // compute layer (compute-move-chain-arrows.ts) owns the choice
    // between per-step palette / colorForTech / grey-continuation.
    const segments = [
      makeSegment(2001, "chain-z", "#F59E0B"), // amber
      makeSegment(2002, "chain-z", "#10B981"), // emerald
    ];

    const { getByTestId } = render(
      <MoveChainArrowOverlay
        segments={segments}
        width={400}
        height={600}
        bodyTopOffset={44}
        active
      />,
    );

    const path1 = getByTestId("move-chain-arrow-path-chain-z-2001");
    const path2 = getByTestId("move-chain-arrow-path-chain-z-2002");
    expect(path1.props.stroke).toEqual(expectedSolidColor("#F59E0B"));
    expect(path2.props.stroke).toEqual(expectedSolidColor("#10B981"));

    const head1 = getByTestId("move-chain-arrow-head-chain-z-2001");
    const head2 = getByTestId("move-chain-arrow-head-chain-z-2002");
    expect(head1.props.fill).toEqual(expectedSolidColor("#F59E0B"));
    expect(head2.props.fill).toEqual(expectedSolidColor("#10B981"));
  });

  it("renders the translatable inner layer that hosts the scroll-tracking transform", () => {
    // Structural guarantee for the "scrolls with body content" promise.
    // The outer wrapper is `position: absolute, top: bodyTopOffset` —
    // it does NOT translate. The inner `<Animated.View>` IS what gets
    // the worklet-driven `translateY: -scrollY` style. If a future
    // refactor accidentally collapses the two wrappers, the on-device
    // arrows would stop tracking scroll silently. This test pins the
    // structural boundary so that regression is caught in CI.
    const { getByTestId } = render(
      <MoveChainArrowOverlay
        segments={[SEGMENT]}
        width={400}
        height={600}
        bodyTopOffset={44}
        active
      />,
    );

    expect(getByTestId("move-chain-arrow-overlay-translatable")).toBeTruthy();
  });

  it("uses stable per-(chainId, intentId) keys so two chains with the same intent id never key-collide", () => {
    // Defensive: the underlying `MoveChainArrowSegment.intentId` is the
    // BE intent row id and is unique in practice, but the React key
    // includes `chainId` too so that a future change to id allocation
    // (or a synthetic test fixture like this one) can't collide.
    const segments = [
      makeSegment(1, "chain-a", "#8B5CF6"),
      makeSegment(1, "chain-b", "#10B981"),
    ];

    const { getByTestId } = render(
      <MoveChainArrowOverlay
        segments={segments}
        width={400}
        height={600}
        bodyTopOffset={44}
        active
      />,
    );

    // Both segments render — no React key collision crash.
    expect(getByTestId("move-chain-arrow-path-chain-a-1")).toBeTruthy();
    expect(getByTestId("move-chain-arrow-path-chain-b-1")).toBeTruthy();
  });
});

/**
 * 2026-05-10 follow-up — SVG paint width covers off-screen body_x
 * (Bug 1 of the same-day smoke pass).
 *
 * 286333f exposed the calendar's `scrollX` SharedValue and made the
 * overlay's `useAnimatedStyle` worklet apply `translateX = zoomTX -
 * scrollX`. The wiring was correct but the user kept reporting drift
 * on horizontal pan in portrait DAY view. Diagnosis: when a chain
 * link's source or destination tile lives on a tech that has
 * scrolled OFF the right edge of the FlashList (or never fit in the
 * viewport because `effectiveColumns < dayResourceCount`), the
 * segment's body-coord X exceeds `width`. The SVG was sized at
 * `width width svgPaintHeight` with `react-native-svg`'s default
 * `overflow: hidden`, which clips paths drawn at body_x > width
 * INSIDE the SVG. translateX moves the SVG element but the path
 * was already clipped at the SVG-internal viewBox boundary, so the
 * arrow visibly stops at the (pre-translate) viewport right edge
 * even when the destination card scrolls into view.
 *
 * Fix: extend `svgPaintWidth` to `max(width, max-segment-x +
 * arrowhead + stroke padding)`. The outer container stays sized at
 * `width` with `overflow: hidden` so the visible viewport is
 * unchanged — only the inner painting canvas grows so off-screen
 * paths survive the worklet's transform.
 */
describe("MoveChainArrowOverlay — SVG paint canvas covers off-screen body coords", () => {
  it("widens the SVG when a segment endpoint exceeds the viewport width", () => {
    // Viewport 350pt; segment endpoint at body_x=600 (way off-screen).
    // The previous implementation sized the SVG at `width=350` and
    // `viewBox=0 0 350 ...`, which clipped the path. The fix expands
    // the SVG so the path is drawn into the SVG's painting area; the
    // outer container (kept at `width=350`, overflow: hidden) clips
    // it back to the viewport so visible pixels are unchanged.
    const segments = [
      makeSegment(1, "chain-far", "#8B5CF6", {
        from: { x: 60, y: 100 },
        to: { x: 600, y: 200 },
      }),
    ];

    const { getByTestId } = render(
      <MoveChainArrowOverlay
        segments={segments}
        width={350}
        height={600}
        bodyTopOffset={44}
        active
      />,
    );

    // Find the inner SVG via the path's parent chain. We assert two
    // things: (a) the SVG width is >= max segment.to.x (the geometry
    // reaches body_x=600), and (b) the viewBox on the SVG is wide
    // enough to contain that x-coord. Both are required — width
    // alone without a matching viewBox would still clip via the
    // viewBox's coordinate system, and viewBox alone without
    // matching width would let the SVG element be too narrow.
    const path = getByTestId("move-chain-arrow-path-chain-far-1");
    // Walk up to the Svg ancestor. RN-svg's Svg renders as a host
    // node with a `width` prop and a `viewBox` prop.
    let node: { parent?: typeof path; props: Record<string, unknown> } = path;
    let svgNode: typeof path | null = null;
    while (node?.parent) {
      // The viewBox prop is a defining marker for the Svg root.
      if (typeof node.parent.props?.viewBox === "string") {
        svgNode = node.parent;
        break;
      }
      node = node.parent;
    }
    expect(svgNode).not.toBeNull();
    const svgWidth = svgNode!.props.width as number;
    const viewBox = svgNode!.props.viewBox as string;
    // Width should be > viewport width (350) AND big enough to cover
    // the segment's far endpoint at x=600 plus arrowhead + stroke
    // padding. Allow a small tolerance for the padding constants.
    expect(svgWidth).toBeGreaterThanOrEqual(600);
    // viewBox shape: "0 0 W H". Parse W and assert it matches.
    const parts = viewBox.split(/\s+/);
    expect(parts).toHaveLength(4);
    const viewBoxW = Number(parts[2]);
    expect(viewBoxW).toEqual(svgWidth);
  });

  it("keeps the SVG sized at the viewport width when no segment exceeds it", () => {
    // No segment goes beyond x=300; viewport is 350. The SVG should
    // stay at width=350 (no over-allocation), preserving the
    // pre-fix behavior for the on-screen-only case.
    const segments = [
      makeSegment(1, "chain-near", "#8B5CF6", {
        from: { x: 60, y: 100 },
        to: { x: 220, y: 200 },
      }),
    ];

    const { getByTestId } = render(
      <MoveChainArrowOverlay
        segments={segments}
        width={350}
        height={600}
        bodyTopOffset={44}
        active
      />,
    );

    const path = getByTestId("move-chain-arrow-path-chain-near-1");
    let node: { parent?: typeof path; props: Record<string, unknown> } = path;
    let svgNode: typeof path | null = null;
    while (node?.parent) {
      if (typeof node.parent.props?.viewBox === "string") {
        svgNode = node.parent;
        break;
      }
      node = node.parent;
    }
    expect(svgNode).not.toBeNull();
    expect(svgNode!.props.width).toEqual(350);
  });
});
