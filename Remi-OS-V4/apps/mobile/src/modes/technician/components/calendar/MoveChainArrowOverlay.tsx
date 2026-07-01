/**
 * `MoveChainArrowOverlay` — SVG layer that draws chain-colored
 * arrows from each source tile to its destination ghost tile.
 *
 * Sits absolutely positioned over the calendar body. `pointerEvents`
 * is "none" so taps still hit the underlying tiles. The overlay is
 * gated on `selectedChainId != null` — Show all baseline renders
 * nothing.
 *
 * Coordinate system matches `compute-move-chain-arrows.ts` (body
 * coordinates, x=0 at the time-label gutter's left edge, y=0 at the
 * top of the body grid). The wiring layer in each calendar view is
 * responsible for translating that frame into screen coordinates by
 * positioning the overlay container.
 *
 * Curve shape: a quadratic Bezier with a control point offset from
 * the segment midpoint perpendicular to the source→dest line. Keeps
 * arrows from cutting straight through other tiles when source and
 * dest are far apart, while staying close to a straight line when
 * they're near each other. Arrowhead is drawn as a small triangle at
 * the destination end, oriented along the tangent of the curve at
 * `t=1`.
 *
 * Off-screen handling: when an endpoint is `null` (its date/tech
 * isn't in the visible columns), the arrow is skipped silently. A
 * later iteration can render an edge-stub indicator; for now we
 * prefer "nothing" over "lying about where the arrow goes".
 *
 * PR-UX-2 PASS 2.2 (2026-05-05).
 *
 * PR-UX-2 PASS 2.3 (2026-05-05): pulse moved off the arrows and onto
 * the calendar tiles themselves (FORK Phase 25 + the
 * `getEventOpacity` resolver). Per direct user feedback: the arrows
 * should be a *steady* directional indicator, not a competing
 * animation. The arrow paths/polygons render with constant 1.0
 * stroke + fill opacity.
 *
 * PR-UX-2 PASS 2.3.1 (2026-05-05): the pulse-singleton subscription
 * also moved OUT of this file. It used to live here as
 * `useMoveChainPulse(active)`, gating the pulse refcount on the
 * overlay's mount lifetime. Problem: the overlay correctly returns
 * null when `arrows.length === 0` — which is the right thing for
 * chains that contain ONLY ghost tiles (e.g. a chain whose only
 * intent is `create`, with no source appointment to draw FROM).
 * Returning null unmounted the hook, unsubscribed the singleton,
 * froze the SV at MAX, and dest-phase ghosts then rendered at the
 * static MIN end of the band — looking exactly like "no pulse".
 * The subscription is now hosted by the calendar VIEW components
 * (resource-calendar-day-view, resource-calendar-workweek-view,
 * landscape/LandscapeWorkweekView) so the pulse runs whenever a
 * chain is selected, regardless of whether any arrows render.
 */

import { memo, useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path, Polygon } from "react-native-svg";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

import type { MoveChainPulse } from "@technician/components/calendar/use-move-chain-pulse";
import type { MoveChainArrowSegment } from "@technician/components/calendar/compute-move-chain-arrows";
import { TERMINAL_GREY_CONTINUATION_COLOR } from "@technician/components/calendar/compute-move-chain-arrows";
import { VERBOSE_CALENDAR_LOGS } from "@technician/utils/calendar-debug-logs";
import {
  captureCalendarAnomaly,
  traceCalendar,
} from "@technician/utils/sentry-diagnostics";

/** Arrow stroke width in points. */
const STROKE_WIDTH = 2.5;
/** Arrowhead triangle "length" along the curve tangent. */
const ARROWHEAD_LEN = 10;
/** Arrowhead triangle half-base perpendicular to the tangent. */
const ARROWHEAD_HALF_BASE = 5;
/**
 * How far to offset the curve's control point from the chord
 * midpoint, perpendicular to the chord. Expressed as a fraction of
 * the chord length so curvature scales with distance.
 */
const CURVE_BOW = 0.18;
/**
 * Absolute pixel cap on the perpendicular offset of the Bezier
 * control point.
 *
 * 2026-05-05 (PR-UX-2 PASS 2.14): without a cap, an inter-day
 * cascade arrow whose source is at the bottom of one column and
 * whose destination is at the top of the next column produces a
 * chord ~400+ px long. `CURVE_BOW * 400 = 72` px of perpendicular
 * deflection, which combined with the steep angle sweeps the
 * control point well outside any tile rect — the arrow renders as
 * a wild, distracting arc that the user reported as "the last
 * arrow is going crazy". Capping the bow at a modest absolute
 * value keeps the arc gentle for long chords while leaving short
 * arrows (where `CURVE_BOW * len` is already < the cap) untouched.
 *
 * 40px was picked because: (a) it's roughly half a calendar tile's
 * width (`APPOINTMENT_BLOCK_WIDTH ≈ 86`), so the arc never
 * intrudes into adjacent columns by more than half a tile; (b) the
 * canonical reference image at
 * `docs/assets/move-chain-flow-canonical-2026-05-05.png` shows
 * arrows with comparable gentle curvature for cross-column
 * segments.
 */
const MAX_CURVE_BOW = 40;

// PR-UX-2 PASS 2.3 (2026-05-05): Path/Polygon are now plain
// (un-animated) since the pulse moved to the tiles. AnimatedPath /
// AnimatedPolygon kept as commented-out reference in case a future
// pass wants per-arrow visual feedback (e.g. flash on hover).

interface MoveChainArrowOverlayProps {
  segments: readonly MoveChainArrowSegment[];
  /** Pixel width of the SVG viewport — typically the calendar body width. */
  width: number;
  /** Pixel height of the SVG viewport — typically the calendar body height. */
  height: number;
  /**
   * Pixel offset from the wrapper's top edge to the calendar's body
   * grid origin. The geometry helper produces y=0 at the body top,
   * but the overlay wraps the entire Calendar (which has its own
   * date/resource header strip taking real estate above the body).
   * The wiring layer measures or estimates this per view (workweek
   * vs day). Defaults to 0 (no offset) which matches the geometry's
   * reference frame.
   */
  bodyTopOffset?: number;
  /** When false, the overlay renders nothing AND pauses the pulse. */
  active: boolean;
  /**
   * Optional override for the pulse hook (test seam). Production
   * callers leave this undefined; the overlay manages its own pulse
   * via `useMoveChainPulse(active)`.
   */
  pulseOverride?: MoveChainPulse;
  /**
   * The calendar's internal `scrollY` SharedValue, exposed via the
   * FORK Phase 24 `<Calendar onScrollYRef>` accessor. Currently used
   * for diagnostic surface only (the render log records its current
   * value), and will be consumed in the next pass to translate the
   * SVG layer in lockstep with body scroll.
   *
   * The actual scroll-delta logging now lives in
   * `useMoveChainScrollLogger` at the view level so it fires
   * independently of whether the overlay is mounted.
   */
  scrollYRef?: SharedValue<number>;
  /**
   * FORK Phase 24-x (2026-05-10 — landscape arrow horizontal anchoring
   * bug fix): the calendar's internal `scrollX` SharedValue exposed via
   * `<Calendar onScrollXRef>`. The library now updates `scrollX.value`
   * unconditionally (multi-day mode included) so this overlay can
   * compensate for horizontal FlashList scroll. Optional — when
   * undefined, only vertical scroll anchoring applies.
   */
  scrollXRef?: SharedValue<number>;
  /**
   * FORK Phase 24-x (2026-05-10 — landscape arrow horizontal anchoring
   * bug fix): the calendar's internal zoom-pan transform SharedValues
   * exposed via `<Calendar onContentTransformRef>`. On iOS the 1-finger
   * pan gesture writes `zoomTX`/`zoomTY` every frame (the simultaneous
   * zoomPanGesture is unconditional), so an external overlay must
   * mirror the same transform to stay glued to the cards. Optional —
   * when undefined, only scroll anchoring applies.
   */
  zoomTXRef?: SharedValue<number>;
  zoomTYRef?: SharedValue<number>;
  /** Optional testID forwarded to the outer wrapper for jest assertions. */
  testID?: string;
}

interface ResolvedArrow {
  intentId: number;
  chainId: string;
  color: string;
  pathD: string;
  arrowheadPoints: string;
  /** Ghost dot painted at the off-screen end if one endpoint is missing. */
  stubAt?: ArrowStub;
}

interface ArrowStub {
  x: number;
  y: number;
  color: string;
  side: "left" | "right" | "above" | "below";
}

/** Stub-only resolution: source visible, dest off-screen (or vice versa). */
function resolveStubArrow(
  seg: MoveChainArrowSegment,
  width: number,
  height: number,
): ResolvedArrow | null {
  const { from, to, fromOffscreen, toOffscreen } = seg;
  // Pick the visible endpoint and the off-screen direction.
  let visible: { x: number; y: number } | null = null;
  let direction: "left" | "right" | "above" | "below" | null = null;
  let pointsAtVisible: boolean;

  if (from && !to && toOffscreen) {
    visible = from;
    direction = toOffscreen;
    pointsAtVisible = false; // arrow points AWAY from the visible source toward the off-screen dest
  } else if (!from && to && fromOffscreen) {
    visible = to;
    direction = fromOffscreen;
    pointsAtVisible = true; // arrow points TOWARD the visible dest from the off-screen source
  } else {
    return null;
  }

  // Stub endpoint at the calendar edge in the off-screen direction,
  // at the same y as the visible endpoint (clamped to body bounds).
  const STUB_INSET = 8;
  let stubX = visible.x;
  let stubY = visible.y;
  if (direction === "left") stubX = STUB_INSET;
  else if (direction === "right") stubX = Math.max(0, width - STUB_INSET);
  else if (direction === "above") stubY = STUB_INSET;
  else if (direction === "below") stubY = Math.max(0, height - STUB_INSET);

  const start = pointsAtVisible
    ? { x: stubX, y: stubY }
    : { x: visible.x, y: visible.y };
  const end = pointsAtVisible
    ? { x: visible.x, y: visible.y }
    : { x: stubX, y: stubY };

  // Straight line; arrowhead at `end`.
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const baseX = end.x - ux * ARROWHEAD_LEN;
  const baseY = end.y - uy * ARROWHEAD_LEN;
  const baseLeftX = baseX + -uy * ARROWHEAD_HALF_BASE;
  const baseLeftY = baseY + ux * ARROWHEAD_HALF_BASE;
  const baseRightX = baseX - -uy * ARROWHEAD_HALF_BASE;
  const baseRightY = baseY - ux * ARROWHEAD_HALF_BASE;
  const pathD = `M ${start.x} ${start.y} L ${baseX} ${baseY}`;
  const arrowheadPoints = `${end.x},${end.y} ${baseLeftX},${baseLeftY} ${baseRightX},${baseRightY}`;

  return {
    intentId: seg.intentId,
    chainId: seg.chainId,
    color: seg.color,
    pathD,
    arrowheadPoints,
    stubAt: { x: stubX, y: stubY, color: seg.color, side: direction },
  };
}

/** Quadratic-Bezier path string + arrowhead triangle for one segment. */
function resolveArrow(seg: MoveChainArrowSegment): ResolvedArrow | null {
  const { from, to } = seg;
  if (!from || !to) return null;

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) return null; // identical endpoints — nothing to draw

  // Control point: chord midpoint shifted perpendicular by CURVE_BOW * len.
  // Perpendicular vector to (dx, dy) is (-dy, dx) (rotated 90° CCW).
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const perpX = -dy / len;
  const perpY = dx / len;
  // PR-UX-2 PASS 2.14 (2026-05-05): clamp the absolute offset so
  // long chords (e.g. inter-day cascade segments) don't sweep the
  // control point off-screen. See `MAX_CURVE_BOW` for context.
  const bow = Math.min(CURVE_BOW * len, MAX_CURVE_BOW);
  const cx = midX + perpX * bow;
  const cy = midY + perpY * bow;

  // Pull the path's destination short of the actual destination
  // center so the arrowhead's tip lands ON the destination point
  // rather than overshooting it. Use the curve tangent at t=1 to
  // figure out the unit vector pointing INTO the destination.
  // For a quadratic Bezier B(t) = (1-t)²P0 + 2(1-t)t·C + t²P1,
  // B'(1) = 2(P1 - C). Normalize and step back ARROWHEAD_LEN/2.
  const tangentX = 2 * (to.x - cx);
  const tangentY = 2 * (to.y - cy);
  const tangentLen = Math.hypot(tangentX, tangentY) || 1;
  const ux = tangentX / tangentLen;
  const uy = tangentY / tangentLen;
  const tipX = to.x;
  const tipY = to.y;
  const baseX = tipX - ux * ARROWHEAD_LEN;
  const baseY = tipY - uy * ARROWHEAD_LEN;
  // Triangle vertices: tip, base + half-base perpendicular, base - half-base perpendicular.
  const baseLeftX = baseX + -uy * ARROWHEAD_HALF_BASE;
  const baseLeftY = baseY + ux * ARROWHEAD_HALF_BASE;
  const baseRightX = baseX - -uy * ARROWHEAD_HALF_BASE;
  const baseRightY = baseY - ux * ARROWHEAD_HALF_BASE;

  // Path ends at the arrowhead's base so the stroke doesn't bleed
  // through the triangle's interior.
  const pathD = `M ${from.x} ${from.y} Q ${cx} ${cy} ${baseX} ${baseY}`;
  const arrowheadPoints = `${tipX},${tipY} ${baseLeftX},${baseLeftY} ${baseRightX},${baseRightY}`;

  return {
    intentId: seg.intentId,
    chainId: seg.chainId,
    color: seg.color,
    pathD,
    arrowheadPoints,
  };
}

export const MoveChainArrowOverlay = memo(function MoveChainArrowOverlay({
  segments,
  width,
  height,
  bodyTopOffset = 0,
  active,
  pulseOverride,
  scrollYRef,
  scrollXRef,
  zoomTXRef,
  zoomTYRef,
  testID,
}: MoveChainArrowOverlayProps) {
  // PR-UX-2 PASS 2.3.1 (2026-05-05): pulse subscription moved OUT of
  // this overlay and into the calendar view components themselves
  // (resource-calendar-day-view, resource-calendar-workweek-view,
  // landscape/LandscapeWorkweekView). Reason: the overlay returns
  // null when `arrows.length === 0` — which is the correct behavior
  // for chains that have ghost tiles but no arrows (e.g. chains
  // composed entirely of `create` intents with no source
  // appointment). When the overlay returns null it unmounts, which
  // unmounts the hook, which unsubscribes from the pulse singleton,
  // which freezes the SV at MAX. The ghost tile then renders dest
  // opacity = MAX + MIN - MAX = MIN (0.3) and just sits there static.
  //
  // Putting the subscription at the view level decouples pulse
  // lifecycle from arrow-render lifecycle. The pulse runs whenever a
  // chain is selected, regardless of whether any arrows exist.
  // `pulseOverride` is preserved on the props for back-compat with
  // the existing test seam but is no longer consulted.
  void pulseOverride;

  // Render counter — monotonic across the lifetime of this overlay
  // instance. Useful for distinguishing "no render fired during
  // scroll" (the misalignment bug) from "many renders fired but
  // nothing visible changed" (a different class of bug). Gated on
  // VERBOSE_CALENDAR_LOGS so the in-render mutation stays dead in
  // production bundles (the gated render-log below is the only
  // consumer).
  const renderCountRef = useRef(0);
  if (VERBOSE_CALENDAR_LOGS) {
    renderCountRef.current += 1;
  }

  // Body-grid height available for arrows (everything below the
  // calendar's own header strip). Hoisted above the memo so the stub
  // resolver can clamp to it.
  const bodyHeight = Math.max(0, height - bodyTopOffset);

  // Prepare the resolved geometry up-front (cheap, off the worklet).
  const arrows = useMemo<ResolvedArrow[]>(() => {
    if (!active) return [];
    const out: ResolvedArrow[] = [];
    for (const seg of segments) {
      const r = resolveArrow(seg) ?? resolveStubArrow(seg, width, bodyHeight);
      if (!r) continue;
      // PR-UX-3 (2026-05-07): grey terminal continuation segments
      // override the resolved arrow's color with the muted palette
      // entry. The compute layer also pre-fills `seg.color` with
      // the same value so legacy callers still render correctly,
      // but the explicit override here codifies the design contract
      // ("the overlay reads the flag and overrides stroke/fill")
      // and makes a future refactor safer.
      //
      // 2026-05-10 — portrait-week cross-tech off-view stubs use the
      // same grey treatment via the `crossTechOffview` flag (set by
      // the geometry helper when a chain link's source or
      // destination tile lives on a tech other than the workweek
      // layout's pinned tech, opted into via
      // `emitCrossTechStubs: true`). Same color override path so
      // the visual identity is consistent across both flag origins.
      if (seg.terminalGreyContinuation || seg.crossTechOffview) {
        out.push({
          ...r,
          color: TERMINAL_GREY_CONTINUATION_COLOR,
          stubAt: r.stubAt
            ? { ...r.stubAt, color: TERMINAL_GREY_CONTINUATION_COLOR }
            : undefined,
        });
        continue;
      }
      out.push(r);
    }
    return out;
  }, [active, segments, width, bodyHeight]);

  // FORK Phase 24 fix (PR-UX-2 / move-chain arrow overlay,
  // 2026-05-05): translate the SVG in lockstep with the calendar
  // body's vertical scroll, otherwise the arrows stay glued to the
  // wrapper while the tiles scroll out from under them.
  //
  // FORK Phase 24-x (2026-05-10 — landscape arrow horizontal
  // anchoring bug fix): extend the same anchoring contract to
  // (a) horizontal FlashList scroll via `scrollXRef` and
  // (b) the zoom-pan transform via `zoomTXRef` / `zoomTYRef`.
  //
  // Card screen-X = calendar-left + zoomTX + (col-offset - scrollX)
  // Card screen-Y = calendar-top  + zoomTY + (row-offset - scrollY)
  //
  // The overlay is rooted at calendar-left/calendar-top, so to stay
  // glued to a card it must apply: translateX = zoomTX - scrollX,
  // translateY = zoomTY - scrollY (the geometry helper already
  // produces points in body coords, i.e. relative to the time-gutter
  // origin BEFORE scroll/zoom).
  //
  // Convention recap (preserved):
  //   - `scrollY` increases as the user scrolls "down" — body content
  //     visually moves UP, so overlay also moves UP via -scrollY.
  //   - `zoomTY` increases as the user 1-finger pans down — body
  //     content visually moves DOWN, so overlay also moves DOWN via
  //     +zoomTY. (zoomTY tracks `evt.translationY`, a positive value
  //     for downward finger movement, and the calendar's `zoomStyle`
  //     applies `translateY: zoomTY` so the same sign moves the body.)
  //   - Same logic on the X axis with scrollX (flashList) and zoomTX.
  //
  // When any SV is undefined (older callers, or before the calendar's
  // accessor callbacks fire), the worklet treats it as 0 — the overlay
  // sits at its wrapper-relative origin like before for that axis.
  const animatedTranslateStyle = useAnimatedStyle(() => {
    const sx = scrollXRef?.value ?? 0;
    const sy = scrollYRef?.value ?? 0;
    const zx = zoomTXRef?.value ?? 0;
    const zy = zoomTYRef?.value ?? 0;
    return {
      transform: [
        { translateX: zx - sx },
        { translateY: zy - sy },
      ],
    };
  }, [scrollXRef, scrollYRef, zoomTXRef, zoomTYRef]);

  // PR-UX-2 (2026-05-05): the SVG's intrinsic height has to cover
  // the full body-coord range that any arrow endpoint reaches —
  // not just the visible `bodyHeight`. Geometry coords run from the
  // body's top (minute 0 of the visible day) downward; an
  // off-screen destination tile can produce points well below
  // `bodyHeight`. If the SVG is sized at `bodyHeight` only, those
  // points fall outside the SVG's painting area and never render,
  // even after the scroll-tracking translateY moves them into the
  // visible window.
  //
  // We scan all segments, take the maximum y any endpoint reaches,
  // and pad it with `STROKE_WIDTH * 2` so arrowheads don't get
  // clipped at the edge. Floor of `bodyHeight` keeps the very
  // first frame (when segments is empty) sized sensibly. The
  // overlay's outer `<View>` retains `overflow: "hidden"` +
  // `height: bodyHeight`, so anything outside the visible window
  // is still clipped — we're just expanding the painting canvas,
  // not the visible area.
  //
  // FORK Phase 24-x follow-up (2026-05-10): extend the SAME logic
  // to the X axis. User report after 286333f shipped: "the arrows
  // once again are not anchored to the cards and are moving across
  // the calendar when the screen moves." Diagnosis: when a chain
  // link's source or destination tile lives on a tech column that
  // has scrolled OFF the right edge of the FlashList (or never fit
  // in the viewport at all), the segment's body-coord X exceeds
  // the viewport width. Sized at `width` only, the SVG's viewBox
  // (`0 0 width svgPaintHeight` with `react-native-svg`'s default
  // `overflow: hidden`) clips any path drawn at body_x > width
  // INSIDE the SVG. The translateX = `zoomTX - scrollX` worklet
  // then moves the SVG's painted CONTENT into view — but the
  // content was already clipped at the SVG-internal viewBox, so
  // the user sees a stub of arrow ending at the (pre-translate)
  // viewport right edge, with the destination card visibly
  // unanchored when the scroll brings the destination column into
  // view. Symmetric to the y-axis case the original PASS 2 fix
  // already covered. Only extend to the RIGHT — `scrollX` is
  // always >= 0 (the FlashList can't bounce past its content
  // start) so off-screen-LEFT body coords don't exist in this
  // overlay's coordinate model.
  //
  // The container view stays sized at `width` with
  // `overflow: hidden`, so the visible viewport is unchanged; we
  // only enlarge the painting canvas of the inner translatable
  // SVG so its strokes can survive the scroll-tracking translate.
  const svgPaintHeight = useMemo(() => {
    let maxY = bodyHeight;
    for (const seg of segments) {
      if (seg.from && seg.from.y > maxY) maxY = seg.from.y;
      if (seg.to && seg.to.y > maxY) maxY = seg.to.y;
    }
    return Math.ceil(maxY + STROKE_WIDTH * 2);
  }, [segments, bodyHeight]);
  const svgPaintWidth = useMemo(() => {
    let segmentMaxX = 0;
    for (const seg of segments) {
      if (seg.from && seg.from.x > segmentMaxX) segmentMaxX = seg.from.x;
      if (seg.to && seg.to.x > segmentMaxX) segmentMaxX = seg.to.x;
    }
    // Pad the segment extent by `ARROWHEAD_LEN + STROKE_WIDTH * 2`
    // so the arrowhead triangle (which extends past the path's end
    // point along the tangent) doesn't get clipped at the SVG's
    // right edge for a segment whose `to.x` happens to be the
    // maximum. When NO segment exceeds the viewport width, we
    // leave the SVG at exactly `width` so the on-screen-only case
    // doesn't grow the SVG unnecessarily — same behavior as before
    // this fix.
    const segmentExtent =
      segmentMaxX > 0 ? segmentMaxX + ARROWHEAD_LEN + STROKE_WIDTH * 2 : 0;
    return Math.ceil(Math.max(width, segmentExtent));
  }, [segments, width]);

  // PR-UX-2 logs pass (2026-05-05): mount/unmount log so we can spot
  // exactly when the overlay component appears in the tree (after a
  // chain chip is tapped) vs. disappears (chip toggled off / nav
  // away). The render-counter log fires every render, but a single
  // mount marker is easier to find in a noisy Metro stream.
  useEffect(() => {
    traceCalendar("MoveChainOverlay MOUNT", {
      active,
      segmentsIn: segments.length,
      hasScrollYRef: !!scrollYRef,
    });
    if (__DEV__) {
      console.log("[MoveChain:Overlay] MOUNT", {
        active,
        hasScrollYRef: !!scrollYRef,
      });
    }
    return () => {
      traceCalendar("MoveChainOverlay UNMOUNT", { active });
      if (__DEV__) console.log("[MoveChain:Overlay] UNMOUNT");
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount/unmount only

  // 2026-05-13 — production breadcrumb on every transition of
  // (active, segmentsIn, arrowsResolved). Throttled to "only fire
  // when one of those values changes" via a ref so we don't spam
  // the breadcrumb buffer (Sentry caps at 100). Uses an anomaly
  // event when active && segmentsIn>0 but arrowsResolved===0 OR
  // width<=0 / height<=0, since that's the "Show all loaded but
  // no arrows" failure mode the user reported.
  const lastTransitionRef = useRef<{
    active: boolean;
    segmentsIn: number;
    arrowsResolved: number;
    width: number;
    height: number;
  } | null>(null);
  useEffect(() => {
    const next = {
      active,
      segmentsIn: segments.length,
      arrowsResolved: arrows.length,
      width,
      height,
    };
    const prev = lastTransitionRef.current;
    const changed =
      !prev ||
      prev.active !== next.active ||
      prev.segmentsIn !== next.segmentsIn ||
      prev.arrowsResolved !== next.arrowsResolved ||
      prev.width !== next.width ||
      prev.height !== next.height;
    if (!changed) return;
    lastTransitionRef.current = next;
    traceCalendar("MoveChainOverlay transition", {
      ...next,
      bodyHeight,
      bodyTopOffset,
      svgPaintHeight,
      svgPaintWidth,
      willRender:
        active && arrows.length > 0 && width > 0 && height > 0,
    });
    if (active && segments.length > 0 && arrows.length === 0) {
      // 2026-05-14 — only flag as anomalous when at least one
      // segment has BOTH endpoints resolved. The post-2026-05-13
      // per-entry-staleness gate (PLAN-DEVIATION
      // 2026-05-13-bounds-registry-per-entry-staleness) intentionally
      // produces transient "segments with null from/to" states: the
      // geometry helper emits segments for off-screen / unresolved
      // endpoints (no offscreen tag, no registry rect), and the
      // overlay's resolver correctly returns null for them. That's
      // expected behavior, not an anomaly — gating the capture on
      // "at least one segment that SHOULD have rendered" eliminates
      // the post-toggle false-positive flood the 8fbefa4
      // instrumentation surfaced (4 toggles → 11 anomaly events,
      // all of them benign mid-resolve states).
      const hasRenderableSegment = segments.some((s) => s.from && s.to);
      if (hasRenderableSegment) {
        captureCalendarAnomaly(
          "overlay active with segments but resolved 0 arrows",
          {
            active,
            segmentsIn: segments.length,
            arrowsResolved: arrows.length,
            width,
            height,
          },
          {
            firstSegment: segments[0]
              ? {
                  intentId: segments[0].intentId,
                  chainId: segments[0].chainId,
                  from: segments[0].from,
                  to: segments[0].to,
                  fromOffscreen: segments[0].fromOffscreen,
                  toOffscreen: segments[0].toOffscreen,
                }
              : null,
          },
        );
      }
    }
    if (active && (width <= 0 || height <= 0)) {
      captureCalendarAnomaly(
        "overlay active but viewport is zero",
        { active, width, height, segmentsIn: segments.length },
      );
    }
  }, [
    active,
    segments,
    arrows.length,
    width,
    height,
    bodyHeight,
    bodyTopOffset,
    svgPaintHeight,
    svgPaintWidth,
  ]);

  // 2026-05-08 follow-up #4 (chip-row freeze investigation): gated
  // behind `VERBOSE_CALENDAR_LOGS`. The render log was firing
  // unconditionally on every render of an active chain — for a
  // 4-step cascade the overlay re-renders on every store update
  // (intents change → graph re-derives → segments re-resolve), and
  // each render emitted 1 + N log lines (overlay summary + one per
  // arrow). At 7 staged intents that's 8+ lines per render, several
  // renders per drag, the freeze repro hit dozens of these per
  // second. Default off; flip `EXPO_PUBLIC_VERBOSE_CALENDAR_LOGS=1`
  // for diagnostic captures (matches the gating pattern in 676bf23).
  if (VERBOSE_CALENDAR_LOGS) {
    console.log("[MoveChain:Overlay] render", {
      renderN: renderCountRef.current,
      active,
      width,
      height,
      bodyHeight,
      bodyTopOffset,
      segmentsIn: segments.length,
      arrowsResolved: arrows.length,
      hasScrollYRef: !!scrollYRef,
      currentScrollY: scrollYRef?.value ?? null,
      willRender: active && arrows.length > 0 && width > 0 && height > 0,
      // PR-UX-2 (2026-05-05) — surface the dynamic SVG canvas height
      // so we can verify it's tall enough to contain off-screen
      // arrow endpoints. Should be max(bodyHeight, max-segment-y).
      svgPaintHeight,
      // FORK Phase 24-x follow-up (2026-05-10) — same diagnostic for
      // the X axis. Should be max(width, max-segment-x + arrowhead).
      svgPaintWidth,
    });
    for (const a of arrows) {
      console.log("[MoveChain:Overlay:Arrow]", {
        intentId: a.intentId,
        chainId: a.chainId,
        color: a.color,
        pathD: a.pathD,
        stub: a.stubAt ?? null,
      });
    }
  }

  if (!active || arrows.length === 0 || width <= 0 || height <= 0) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      style={[styles.container, { width, height: bodyHeight, top: bodyTopOffset }]}
      testID={testID ?? "move-chain-arrow-overlay"}
    >
      <Animated.View
        style={[styles.translatable, animatedTranslateStyle]}
        pointerEvents="none"
        testID="move-chain-arrow-overlay-translatable"
      >
      <Svg
        width={svgPaintWidth}
        height={svgPaintHeight}
        viewBox={`0 0 ${svgPaintWidth} ${svgPaintHeight}`}
        preserveAspectRatio="none"
      >
        {arrows.map((a) => (
          // PR-UX-2 PASS 2.3 (2026-05-05): plain Path — no animated
          // props. Arrows are a steady directional indicator; the
          // pulse lives on the tiles via FORK Phase 25.
          //
          // PR-UX-21 (2026-05-09): per-arrow testIDs (key + path) so
          // the landscape-arrows test surface can count rendered
          // segments and assert per-segment color without walking the
          // SVG tree by node type. Compound key pattern
          // (`${chainId}-${intentId}`) is stable across rerenders even
          // when two chains share an intent id by accident (defensive).
          <Path
            key={`p-${a.chainId}-${a.intentId}`}
            testID={`move-chain-arrow-path-${a.chainId}-${a.intentId}`}
            d={a.pathD}
            stroke={a.color}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            fill="none"
          />
        ))}
        {arrows.map((a) => (
          <Polygon
            key={`h-${a.chainId}-${a.intentId}`}
            testID={`move-chain-arrow-head-${a.chainId}-${a.intentId}`}
            points={a.arrowheadPoints}
            fill={a.color}
            stroke={a.color}
            strokeWidth={1}
          />
        ))}
      </Svg>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    overflow: "hidden",
    // 2026-05-10 (arrow paints-through-cards fix, attempt 2):
    //
    // Background: the vendored calendar's `EventBlock` paints every
    // card with a dynamic `zIndex` of `1000 + leftIndex` (see
    // `helpers.ts:370` in the vendored lib). On iOS, React Native
    // translates `zIndex` into `CALayer.zPosition`, which — unlike CSS
    // z-index — does NOT respect view-hierarchy boundaries. A deeply
    // nested child with zPosition: 1010 can paint above a sibling of
    // its ancestor that has zPosition: 0 (or even higher, depending on
    // how the parent layer composites). This is the classic
    // "z-index leak" RN bug on iOS, especially around `FlashList` and
    // hardware-accelerated layers like Reanimated's animated opacity.
    //
    // Attempt 1 (bumping `zIndex` to 10000) made the overlay's wrapper
    // outrank EventBlocks on paper, but the SVG content still got
    // punched through in the middle of long arrows. Diagnosis: when
    // the overlay lives INSIDE an `Animated.View` that has
    // `opacity: <SharedValue>` (the `surfaceLayer` in
    // `LandscapeWorkweekView`), iOS rasterizes that whole subtree into
    // a single composition layer. Inside the rasterized layer, the
    // SVG view's `RNSVGSvgView` renders to its own CGContext and
    // doesn't participate in CALayer.zPosition reordering the same way
    // regular UIViews do. EventBlocks, which DO use zPosition, end up
    // composited above the SVG within that same rasterized layer.
    //
    // The fix has TWO parts that must both land for the arrow line to
    // stay continuous through the middle of long cross-screen arrows:
    //
    // 1. (here) Force the overlay's wrapper to be its own compositing
    //    layer via a transform (any transform creates a new iOS
    //    CALayer with `shouldRasterize`-equivalent semantics). Plus
    //    push the zIndex to an absurd value and add `elevation` for
    //    Android.
    //
    // 2. (in `LandscapeWorkweekView`) Lift the overlay OUT of
    //    `surfaceLayer` so it's not inside the animated-opacity
    //    rasterized layer at all. With the overlay as a sibling of
    //    `surfaceLayer` inside `calendarWrap`, iOS composites the
    //    overlay's layer AFTER the surfaceLayer in tree order, which
    //    puts it above every card in the calendar regardless of the
    //    cards' internal zPosition leak.
    //
    // The combined effect: arrow strokes paint continuously from
    // source to destination, even when the bezier curve passes
    // through the bounding boxes of intervening event cards. Overlay
    // is `pointerEvents="none"` so this z-stacking has no impact on
    // touch handling — taps still hit the underlying tiles.
    zIndex: 999999,
    elevation: 24,
    // `translateX: 0` forces iOS to give this View its own backing
    // CALayer (any transform value triggers `wantsLayer`-equivalent
    // behavior). Without a forced backing layer, the overlay's
    // children inherit their ancestor's rasterization context and
    // the SVG winds up underneath the calendar's animated tiles.
    // No visual movement — the transform is a no-op pixel-wise.
    transform: [{ translateX: 0 }],
  },
  // The translatable layer holds the actual SVG. It sits at (0, 0)
  // inside the container and is translated by the FORK Phase 24
  // scroll-tracking transform in `useAnimatedStyle`. Kept as a
  // separate layer so the container's `overflow: "hidden"` clip
  // continues to mask anything that scrolls out of the body grid.
  translatable: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});

// --- exports for tests ---
// Re-export so test files can import the geometry resolver without
// touching the un-exported internals.
export const __test__ = { resolveArrow };
