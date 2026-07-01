/**
 * `<RouteReorderChipBar>` (LDM-WAVE-2 CHUNK-4) — bottom-anchored
 * action bar that appears when a route marker is tapped on the
 * landscape map. Renders one colored numbered dot per stop in the
 * tapped tech's route; the tapped stop is enlarged.
 *
 *   - Tap a chip (quick release) → opens a small "thought bubble"
 *     above the chip showing the customer name + scheduled time
 *     (r15, map-based reschedule chunk 2). Tapping the same chip
 *     again or any other chip toggles / moves the tooltip.
 *     Swiping down on the tooltip dismisses it.
 *   - Tap the thought bubble → opens `<QuickTimeSheet>` for that
 *     stop's appointment (r15 chunk 3). Parent receives the
 *     `MapStop` via `onReschedule`.
 *   - Press-and-hold ≥300ms + drag → pick up the chip and drop it
 *     onto another chip's SWAP zone (snap-zone Phase 1c) or into
 *     an INSERT gap between chips. SWAP routes to
 *     `onRequestSwapWithTimes(dragged, target)`; INSERT routes to
 *     `onRequestInsertAtPosition(dragged, insertAtIndex)`. The
 *     parent opens `<DragRescheduleSheet>` in the matching kind,
 *     pickers populate, dispatcher hits Save → BE mutation fires
 *     with explicit times. Each drag = one BE write, no batching.
 *   - Tap the "Tech" button → opens the reassign-tech picker.
 *   - Tap the X → dismiss the bar.
 *
 * Commit model (snap-zone Phase 7a — 2026-05-22 — bar is now stateless):
 *   - r16/r16.1's parent-owned `pendingOrder` + bottom-bar
 *     Commit/Discard buttons are retired. They were redundant
 *     after Phase 4 (SWAP) + Phase 6 (INSERT) shipped — every
 *     drag now commits immediately via its mini-sheet's Save,
 *     and `pendingOrder` collapses to "whatever the cache holds
 *     right now" (which the mutations' optimistic patches keep
 *     in sync). See the plan's Phase 7a section for the unwind
 *     rationale: `docs/implementation-plans/chip-bar-snap-zone-rescheduler-plan.md`.
 *   - PLAN-DEVIATION: 2026-05-21-chip-bar-snap-mini-sheet — bottom-bar
 *     Commit/Discard removal + new `useRouteStopReposition` endpoint
 *     (Option 5b, not 5a) diverge from the plan's mini-sheet section.
 *     See docs/PLAN-DEVIATIONS.md#2026-05-21-chip-bar-snap-mini-sheet.
 *   - PLAN-DEVIATION: 2026-05-22-chip-bar-plan-mode-batch — Plan Mode
 *     batches drag-end into a `PlannedMove` queue instead of opening a
 *     mini-sheet per drop. See `<ReviewPlanSheet>` and
 *     docs/PLAN-DEVIATIONS.md#2026-05-22-chip-bar-plan-mode-batch.
 *   - `pendingOrder: MapStop[]` is still a prop because the chip
 *     bar is presentational — the parent passes the route's
 *     stops in sort order. The legacy `onReorder(newIds)` prop
 *     stays as a fallback for non-route-map consumers (unit
 *     tests, hypothetical future surfaces) that don't supply
 *     the snap-zone mini-sheet handlers; in production today
 *     it's a no-op since the route map always supplies both.
 *
 * Why pending-then-commit at all (vs r15.x immediate commit):
 *   - User report 2026-05-21 morning: "after swapping 2+ chips
 *     around within like 5-10 seconds [the app] lags to re-render
 *     and then seems to close in order to refresh when I open
 *     it back up." Sentry traced this to AIRMap's native iOS
 *     subview-array desyncing during rapid concurrent optimistic
 *     patches — see REMI-TECHNICIAN-20 (NSInvalidArgumentException
 *     nil object) and REMI-TECHNICIAN-28 (NSRangeException
 *     index 40 beyond bounds [0..38]).
 *   - Same user message asked for the UX directly: "we do need a
 *     way to do multiswap with a button to commit the changes...
 *     not just that swap method so I'm not constantly swaping 1 at
 *     a time like it's some sort of puzzle game."
 *
 * Gesture model (unchanged from r15.4):
 *   - Tap a chip (quick release) → tooltip toggles via Pressable's
 *     RN responder system. RNGH's Tap recognizer cannot reliably
 *     reach END state inside DFL's row context (the wrapping pan
 *     handler cancels it), which is why we use Pressable instead.
 *   - Press-and-hold ≥300ms → `Pressable.onLongPress` fires `drag()`,
 *     which hands off to DFL's list-level pan handler.
 *
 * History of failed gesture models on this surface (kept for the
 * next agent who's tempted to "simplify"):
 *   - r12 `onPressIn={drag}` — armed drag instantly on touch,
 *     consumed taps so tooltips never opened.
 *   - r15.1 `onLongPress={drag}` with delayLongPress=120 — too
 *     twitchy. Never shipped (OTA pipe was broken at the time).
 *   - r15.2 `Gesture.Race(LongPress, Tap)` via GestureDetector —
 *     long-press → drag worked, but Tap.onEnd never fired inside
 *     DFL's row context.
 *   - r15.4 (current) — Pressable + onPress + onLongPress(300ms).
 *
 * Layout invariants (r12, still in force):
 *   - Uniform chip width (36×36). Variable widths break DFL's
 *     horizontal CELL_LENGTH cache.
 *   - `overflow: "visible"` on the list wrapper so the
 *     ScaleDecorator pop and tooltip don't get clipped.
 *
 * 2026-05-20 round-3 (still in effect):
 *   - Color is a deterministic function (`colorForRoute` in parent,
 *     delegating to `colorForTech(route.technicianId)`).
 *   - The chip strip filters `route.stops` to located stops only.
 *   - Parent passes `key={`chip-${routeId}`}` so a change of tapped
 *     route forces a remount.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  type LayoutChangeEvent,
} from "react-native";
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
  type DraggableFlatListProps,
} from "react-native-draggable-flatlist";
import {
  GestureHandlerRootView,
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { MapStop, MapRoute } from "@technician/types/api";
import { traceMap } from "@technician/utils/sentry-map-diagnostics";
import { formatTimeRange12h } from "@technician/utils/format-display";
import { classifySnapZone } from "@technician/utils/chip-bar-snap-zone";
import {
  CHIP_BAR_OFF_END_BUFFER_PX,
  CHIP_CELL_FALLBACK as SNAP_ZONE_CHIP_CELL_FALLBACK,
  SWAP_ZONE_HALF_WIDTH_PX as SNAP_ZONE_SWAP_HALF_WIDTH_PX,
} from "@technician/utils/chip-bar-snap-zone-constants";

// r16.12 (2026-05-21) — fixed-width tooltip bubble, positioned
// DIRECTLY (no intermediate overlay-with-alignItems wrapper).
//
// History:
//   r16.10 — overlay+alignItems:center; bubble had minWidth:110;
//            width varied with text → asymmetric centering, some
//            chips drifted right by 2-4px.
//   r16.11 — fixed bubble to width:148 inside a 160-wide overlay
//            with alignItems:center; all chips became uniformly
//            drifted LEFT by some small constant amount. That's
//            the signature of Yoga's flex centering rounding —
//            with a 12px delta (160-148), the (delta/2)=6 offset
//            interacts with iOS subpixel rounding to consistently
//            bias one direction.
//   r16.12 — drop the centering middleman. Bubble is positioned
//            with `left = chipCenterX - listX - TOOLTIP_BUBBLE_WIDTH/2`
//            so the bubble's own left edge math puts its center
//            exactly on the chip. No flex centering anywhere in
//            the chain → no rounding drift.
//   r16.19 — bumped 148 → 168 to accommodate the time range
//            (e.g. "11:30 AM – 12:30 PM" is wider than "5:00 PM").
//            Tail's center position (TOOLTIP_BUBBLE_WIDTH/2 - 5)
//            recomputes automatically since it's derived.
const TOOLTIP_BUBBLE_WIDTH = 168;

// r17.c / Phase 1c (2026-05-21) — snap-zone gesture detection backed by
// a small fork of react-native-draggable-flatlist. See:
//   - vendor/react-native-draggable-flatlist/README-FORK.md
//   - docs/PLAN-DEVIATIONS.md#2026-05-21-dfl-fork-for-snap-zones
//   - .cursor/rules/forked-draggable-flatlist.mdc
//
// PLAN-DEVIATION: 2026-05-21-dfl-fork-for-snap-zones — Phase 1 was
// supposed to be observation-only with no library changes; we shipped
// it as Phase 1c by forking DFL and gating its shift animation in the
// swap zone. See docs/PLAN-DEVIATIONS.md#2026-05-21-dfl-fork-for-snap-zones.
// History on this surface:
//   - r17 (Phase 1a, 2026-05-20) — UI-thread worklet stack at mount;
//     crashed inside AIRMap subview reconciliation. Reverted same day.
//   - r17.b (Phase 1b, 2026-05-21) — rAF-deferred onAnimValInit + a
//     single shared overlay. Stable, but the geometry was wrong (the
//     ring landed 1-2 chips off) AND there was a UX gap: DFL would
//     "shift to make room" while the user was clearly trying to drop
//     ON a chip to swap. No visual differentiation.
//   - r17.c (Phase 1c, this file) — fixes the geometry AND adds the
//     fork-side gate so chips visually FREEZE in the swap zone and
//     SHIFT in the insert zone. Two distinct treatments, one drag.
//
// SWAP_ZONE_HALF_WIDTH_PX — the dragged chip's center must be within
// this many pixels of a target chip's center to count as a SWAP.
// History:
//   - 9px (Phase 1c launch) — inner 50% of a 36px chip. Felt narrow
//     AND fired AFTER DFL began shifting the target (DFL writes
//     spacerIndex when hoverOffset crosses the neighbor's half-line
//     at cellSize/2 — well before the dragged center reaches the
//     neighbor's center). Caused "ring lags chip" confusion.
//   - 13px (Phase 1c follow-up) — matched the plan's "≥65% overlap"
//     spec. Geometrically correct, but in landscape testing it felt
//     too greedy: with cellSize≈48px the SWAP zone consumed 26 of
//     each 48px slot, leaving only 22px of INSERT real estate per
//     gap. Users could not reliably drop a chip BETWEEN two chips —
//     the snap kept grabbing SWAP at fingertip resolution, and at
//     release the worklet's last frame would often land inside a
//     SWAP zone even when the user perceived they had released in
//     the gap.
//   - 9px (current, 2026-05-22 follow-up) — back to the original,
//     now safe because the fork's spacer-reset-on-gate-assert
//     (README-FORK.md "Phase 1") freezes the target chip the
//     instant the gate fires, so the "ring lags chip" failure mode
//     that justified the 13px bump is no longer reachable. Combined
//     with the chip-margin bump below (6 → 9 each side), the INSERT
//     zone is now 30+ px per gap (~60% of the cell) — wide enough
//     to land in at fingertip resolution.
// PHASE 7b (2026-05-22) — the canonical definitions moved to
// `src/utils/chip-bar-snap-zone-constants.ts` so the pure
// `classifySnapZone` helper (and its unit tests) can share them.
// Re-exporting via local consts here keeps the existing call sites
// in this file unchanged.
const SWAP_ZONE_HALF_WIDTH_PX = SNAP_ZONE_SWAP_HALF_WIDTH_PX;
// CHIP_CELL_FALLBACK — DFL's activeCellSize can race-out at 0 during
// the first frame of a drag. 54 = 36px chip + 9px margin × 2 (matches
// styles.chip.marginHorizontal below — keep these in sync if either
// changes).
const CHIP_CELL_FALLBACK = SNAP_ZONE_CHIP_CELL_FALLBACK;
// OVERLAY_DIAMETER — the amber ring that highlights the swap target.
// Slightly larger than the 36px chip so it visibly halos around it.
const OVERLAY_DIAMETER = 44;

// DFL bundles older Reanimated types whose `SharedValue<T>` is
// structurally narrower than this app's `SharedValue<T>` (newer
// version). Both have a `.value: number` at runtime. We type to the
// minimum shape so this file stays compatible without forcing a
// reanimated version unify.
//
// disableSpacerTracking — fork Phase 1 gate. When true, every non-
// active cell freezes at translation 0 (used by SWAP mode to overlay
// the amber ring on a stationary target).
//
// splitShiftLeftCellIdx / splitShiftRightCellIdx — fork Phase 2 split-
// shift overrides. When set to a cell index (>= 0), that cell
// translates exactly −cellSize/2 (LEFT) or +cellSize/2 (RIGHT),
// regardless of the gate. Used by INSERT mode to render "two chips
// part to open a single-cell gap" while every other chip stays put.
// Defaults to −1 = no override; with Phase 2 active the consumer
// drives ALL non-active translations explicitly (the gate stays on
// for the whole drag so DFL's default insertion shift never runs).
//
// shiftAllBeforeIdx / shiftAllAfterIdx — fork Phase 3 off-end shift-all
// overrides (2026-05-22). When set to a cell index (>= 0), EVERY non-
// active cell on the corresponding side of that index translates by
// exactly ±cellSize (a full cell-width, not half):
//   - `shiftAllBeforeIdx = activeIdx` → cells 0..(activeIdx-1) slide
//     RIGHT by one cell, opening a chip-wide empty slot at the front
//     (used when classifier returns `dramaticShift: "front"`).
//   - `shiftAllAfterIdx = activeIdx` → cells (activeIdx+1)..(N-1)
//     slide LEFT by one cell, opening a chip-wide empty slot at the
//     back (used when classifier returns `dramaticShift: "back"`).
// Defaults to −1 = no override. Mutually exclusive with the half-cell
// split-shift overrides above — the classifier forces split indices
// to −1 in dramatic-shift frames, and this consumer mirrors that in
// the worklet (defense-in-depth).
type ChipBarDflAnims = {
  hoverOffset: { value: number };
  activeIndexAnim: { value: number };
  activeCellSize: { value: number };
  disableSpacerTracking: { value: boolean };
  splitShiftLeftCellIdx: { value: number };
  splitShiftRightCellIdx: { value: number };
  shiftAllBeforeIdx: { value: number };
  shiftAllAfterIdx: { value: number };
};

// The worklet's output. Null = no snap target this frame. When set,
// `centerX` is the target chip's window-X (same coordinate system as
// chipPositionsRef cx). The overlay subtracts listAnchor.x to position
// itself, and the JS-side handleDragEnd reads `.stopId` to classify.
type SwapTargetInfo = { stopId: number; centerX: number } | null;

interface RouteReorderChipBarProps {
  route: MapRoute;
  selectedStopId: number;
  color: string;
  /**
   * r16.1 — the ordering to render. Parent owns this; we just
   * display it. When the user drag-reorders we call
   * `onReorder(newIds)` and the parent updates `pendingOrder`
   * (which comes back to us as the next prop). The parent also
   * uses this same ordering to redraw the active route's polyline
   * on the map, keeping the two visualizations in lockstep.
   */
  pendingOrder: MapStop[];
  /**
   * Snap-zone Phase 7a (2026-05-22) — fallback path for drag
   * drops that aren't routed through one of the mini-sheet
   * handlers below. Today (production), the franchise-route-map
   * always supplies BOTH `onRequestSwapWithTimes` and
   * `onRequestInsertAtPosition`, so this prop is effectively a
   * no-op in that wiring. It's kept on the interface so non-
   * route-map consumers (unit tests, hypothetical future
   * surfaces) can still get the legacy "drag-and-drop produces
   * a full new order array" behavior without supplying the snap-
   * zone props.
   *
   * Was `onSwap(a, b)` in r16.1 — replaced because the swap-pair
   * approach didn't match DFL's insertion visual: drag chip A
   * from slot 1 to slot 4 shows you "shift B, C, D left, A goes
   * to slot 4" (insertion: [B, C, D, A]) but recorded swap-only
   * meant the array became [D, B, C, A]. After ~6 drags the
   * accumulated mismatch made the chip numbers ≠ polyline ≠
   * user's mental model. Insertion semantics eliminate the drift.
   */
  onReorder: (newOrderedStopIds: number[]) => void;
  onReassign: () => void;
  onDismiss: () => void;
  onReschedule?: (stop: MapStop) => void;
  /**
   * r16.7 (2026-05-21) — fires whenever the user taps a chip on
   * the bar. Parent uses this to update its `pendingMenu` so the
   * map's marker focus, polyline emphasis, and the chip-bar's
   * `selectedStopId` all stay in lockstep. Without this, the only
   * way to change which chip is "selected" was to tap the matching
   * map marker — confusing once the bar was open.
   *
   * Fires alongside (not instead of) the tooltip toggle below, so
   * a single tap still opens the tooltip on the same chip.
   */
  onSelectChip?: (stop: MapStop) => void;
  /**
   * Phase 4 (2026-05-21) — SWAP-mode drag drop. When supplied,
   * a drag whose snap classification ends as `swap` is routed
   * here (with the dragged + target stopIds) instead of going
   * down the legacy `onReorder` auto-trade path. Parent opens
   * `<DragRescheduleSheet>` in `kind: "swap"` mode, lets the
   * dispatcher pick explicit times, and submits via the
   * extended `swapStops` mutation.
   *
   * When NOT supplied (e.g. unit tests, future surfaces that
   * want only the auto-trade behavior), the chip bar falls
   * back to `onReorder` for swap drops too — so this prop is
   * purely additive and pre-Phase-4 consumers stay unbroken.
   *
   * INSERT-mode drops are routed to `onRequestInsertAtPosition`
   * (Phase 6, see below). When that prop is also unsupplied, both
   * SWAP and INSERT fall through to `onReorder` — the chip bar's
   * behavior pre-Phase-4 is fully preserved.
   */
  onRequestSwapWithTimes?: (
    draggedStopId: number,
    targetStopId: number,
  ) => void;
  /**
   * Phase 6 (2026-05-22) — INSERT-mode drag drop. When supplied,
   * a drag whose snap classification ends as `insert` is routed
   * here (with the dragged stopId + the 0-indexed slot it landed
   * in within the without-dragged sequence) instead of going down
   * the legacy `onReorder` reorder-only path. Parent opens
   * `<DragRescheduleSheet>` in `kind: "insert"` mode, lets the
   * dispatcher pick an explicit start time, and submits via the
   * `repositionStop` mutation.
   *
   * `insertAtIndex` is exactly the splice-after-removal index — it
   * maps 1:1 onto the `computeInsertWindow(pendingOrder,
   * draggedStopId, insertAtIndex)` helper, so the parent doesn't
   * have to translate between drag-coordinate spaces.
   *
   * When NOT supplied the chip bar falls back to `onReorder` for
   * insert drops too, so this prop is purely additive.
   */
  onRequestInsertAtPosition?: (
    draggedStopId: number,
    insertAtIndex: number,
  ) => void;
  /**
   * B2-1 (2026-05-22) — opt-in batch-reorganize mode. When `true`,
   * the chip-bar renders the "Plan: ON" pill in its footer row and
   * (in later B2 chunks) suppresses the per-drop mini-sheet and
   * accumulates pending moves instead. For this chunk the prop is
   * presentational only: the pill renders and toggles, but no
   * downstream behavior changes — wiring lands in B2-2 (drag-end
   * branching) and B2-3 (polyline override).
   *
   * See `docs/implementation-plans/chip-bar-plan-mode-batch.md`.
   *
   * Optional + defaults to `false` so non-route-map consumers
   * (tests, hypothetical future surfaces) keep today's per-drop
   * flow without needing to supply the pair.
   */
  planModeActive?: boolean;
  /**
   * Toggle handler for the "Plan: OFF/ON" pill. Receives the
   * *next* value (so the chip-bar doesn't need to know parent
   * state shape). When `planModeActive` is not supplied, the pill
   * is not rendered and this prop is ignored.
   */
  onTogglePlanMode?: (next: boolean) => void;
  /**
   * B2-4 (2026-05-22) — number of currently staged moves. When
   * `planModeActive` is true AND this is > 0, the Plan pill morphs
   * into a "{N} · Review & commit" CTA that fires
   * `onOpenReviewPlan` instead of toggling plan mode off. Toggle-
   * off in that state has to go through B2-6's confirm-discard
   * prompt (not in scope here — the pill simply opens the review
   * sheet whenever the count is positive).
   *
   * When `0` or undefined the pill renders as the regular
   * "Planning" / "Plan" toggle. Optional + defaults to 0 so non-
   * route-map consumers keep today's pill semantics.
   */
  pendingMoveCount?: number;
  /**
   * Fires when the user taps the morphed "Review & commit" CTA.
   * Required ONLY when `pendingMoveCount > 0` — otherwise the
   * pill behaves as a plain toggle and this prop is ignored.
   */
  onOpenReviewPlan?: () => void;
}

function ChipSurface({
  isSelected,
  isActive,
  disabled,
  color,
  numberLabel,
  stopId,
  routeId,
  drag,
  onTap,
}: {
  isSelected: boolean;
  isActive: boolean;
  disabled: boolean;
  color: string;
  numberLabel: number;
  stopId: number;
  routeId: number;
  drag: () => void;
  onTap: () => void;
}) {
  // r16.4 (2026-05-21) — instrumented for tap-not-firing bug.
  // User reports tap on chip doesn't open tooltip. Could be:
  //   a) Pressable never sees the touch (DFL pan intercepts)
  //   b) touch registers as long-press (drag fires, tap doesn't)
  //   c) onPress fires but state doesn't update (renderChip dep loop)
  // The onPressIn / onPressOut traceMap calls disambiguate (a) and (b):
  //   - onPressIn fires → Pressable IS getting the touch
  //   - onPressOut + onPress fires → tap completed normally
  //   - onPressIn fires but onPress doesn't → long-press path won
  //   - neither fires → DFL is consuming the touch entirely
  const handlePressIn = useCallback(() => {
    traceMap("chip_bar_press_in", { routeId, stopId, disabled });
  }, [routeId, stopId, disabled]);
  const handlePressOut = useCallback(() => {
    traceMap("chip_bar_press_out", { routeId, stopId, disabled });
  }, [routeId, stopId, disabled]);
  const handlePress = useCallback(() => {
    traceMap("chip_bar_press_fired", { routeId, stopId, disabled });
    if (disabled) return;
    onTap();
  }, [routeId, stopId, disabled, onTap]);
  const handleLongPress = useCallback(() => {
    traceMap("chip_bar_long_press_fired", { routeId, stopId, disabled });
    if (disabled) return;
    drag();
  }, [routeId, stopId, disabled, drag]);
  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={300}
      // hitSlop extends tap zone beyond the visible 36×36 chip so a
      // slightly-off touch still registers on the right chip.
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: color },
        isSelected && styles.chipSelected,
        isActive && styles.chipActive,
        disabled && styles.chipDisabled,
        // Visual press feedback — confirms Pressable IS receiving
        // touches even when downstream state doesn't update.
        pressed && !disabled && styles.chipPressed,
      ]}
    >
      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
        {numberLabel}
      </Text>
    </Pressable>
  );
}

export function RouteReorderChipBar({
  route,
  selectedStopId,
  color,
  pendingOrder,
  onReorder,
  onReassign,
  onDismiss,
  onReschedule,
  onSelectChip,
  onRequestSwapWithTimes,
  onRequestInsertAtPosition,
  planModeActive,
  onTogglePlanMode,
  pendingMoveCount = 0,
  onOpenReviewPlan,
}: RouteReorderChipBarProps) {
  // r15 (map-based reschedule chunk 2) — tooltip state. Holds the
  // stopId whose "thought bubble" is currently shown.
  const [tooltipStopId, setTooltipStopId] = useState<number | null>(null);

  // r16.5 — tooltip stash for drag.
  const tooltipBeforeDragRef = useRef<number | null>(null);

  // r16.18 — pending reopen timer. After drag-end we wait for DFL's
  // slide animation (~300ms) to settle before showing the moved
  // chip's tooltip, otherwise the bubble flashes at the chip's
  // pre-animation x (which often overlaps a DIFFERENT chip's new
  // slot, creating a "tooltip flashed on the wrong chip" effect).
  // Kept as a ref so chip-tap and drag-begin handlers can cancel
  // it if the user interacts before the timer fires.
  const tooltipReopenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const cancelTooltipReopen = useCallback(() => {
    if (tooltipReopenTimerRef.current != null) {
      clearTimeout(tooltipReopenTimerRef.current);
      tooltipReopenTimerRef.current = null;
    }
  }, []);
  useEffect(() => {
    return () => cancelTooltipReopen();
  }, [cancelTooltipReopen]);

  // r16.10 (2026-05-21) — measured-overlay tooltip positioning.
  //
  // History: r15.4 through r16.6 tried rendering the tooltip INLINE
  // as a child of each chip's wrapper. The chip_bar_tooltip_render
  // breadcrumb confirmed it was being mounted into the React tree
  // but never appeared on screen because DFL wraps a horizontal
  // FlatList → ScrollView, and iOS ScrollViews clip content at
  // their bounds. overflow:visible on every wrapper outside the
  // FlatList doesn't help — the clip happens inside.
  //
  // r16.5 tried an overlay using `chipIndex * STRIDE` math but the
  // math drifted (margins, FlatList padding, etc). r16.9 tried to
  // pass `contentContainerStyle: { overflow: visible }` to DFL,
  // which collapsed the horizontal chip row to a single visible
  // chip (DFL relies on internal contentContainerStyle for its
  // chip layout + drag placeholder bookkeeping).
  //
  // The only thing that DOES work reliably is to measure each
  // chip's actual on-screen position with `measureInWindow` and
  // render the tooltip as a sibling of DraggableFlatList inside
  // the listWrapper, positioned at:
  //   left = chipCenterX - listWrapperX - TOOLTIP_BUBBLE_WIDTH/2
  //   bottom = listWrapperHeight - (chipTopY - listWrapperY) + GAP
  // measureInWindow is called from each chipWrapper's onLayout, so
  // positions stay accurate across drag-end re-renders and bar
  // resizes. `layoutTick` is bumped each measurement to force the
  // overlay to re-render with the latest values.
  const chipNodesRef = useRef<Map<number, View | null>>(new Map());
  const chipPositionsRef = useRef<
    Map<number, { cx: number; topY: number; width: number }>
  >(new Map());
  const listWrapperRef = useRef<View | null>(null);
  const listWrapperPosRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [layoutTick, setLayoutTick] = useState(0);
  const bumpLayoutTick = useCallback(() => {
    setLayoutTick((t) => t + 1);
  }, []);

  // r17.c / Phase 1c (2026-05-21) — snap-zone gesture detection
  // backed by the DFL fork's disableSpacerTracking shared value.
  //
  // The architecture (rAF-deferred onAnimValInit, single shared
  // overlay, no useAnimatedReaction, no per-chip animated style)
  // carries over from r17.b — it's load-bearing for crash-avoidance
  // during AIRMap mount. What changed in r17.c:
  //
  //   1. Geometry — the worklet now uses the user-proposed zone
  //      model with ±SWAP_ZONE_HALF_WIDTH_PX around each non-active
  //      chip's center as the SWAP zone (post-2026-05-21 evening
  //      bump: 13px, matching the plan's ≥65% overlap spec). The
  //      previous "find nearest chip within 35% of cell width" was
  //      both wrong and didn't capture the user's intent.
  //   2. draggedCenter formula — listAnchorX (window) + hoverOffset
  //      (container) + cellSize/2. r17.b used activeCenter
  //      (window) + hoverOffset (container) which mixed coordinate
  //      systems and made the ring land 1-2 chips off.
  //   3. disableSpacerTracking — when the worklet detects a SWAP
  //      target, it flips this shared value true. The vendored
  //      DFL fork's useCellTranslate then (a) skips its per-cell
  //      shift WRITE and (b) actively RESETS spacerIndexAnim to
  //      activeIndexAnim.value, so already-shifted cells animate
  //      back to their original positions via the existing
  //      withSpring path. Combined effect: when the gate fires,
  //      every non-active chip springs back to its pre-drag slot
  //      and the amber ring (positioned at the target chip's
  //      cached pre-drag center) lands cleanly ON the chip rather
  //      than in the empty gap where DFL had previously animated
  //      it away. The reset-on-gate-assert was added 2026-05-21
  //      evening — without it, the gate just freezes cells mid-
  //      animation, the chips stay shifted, and the ring lands in
  //      empty space (the original Phase 1c bug). When the gate
  //      releases, the result computation in useCellTranslate
  //      resumes against the current hoverOffset and DFL's normal
  //      shifting behavior takes over.
  const [dflAnims, setDflAnims] = useState<ChipBarDflAnims | null>(null);
  // rAF defer is the load-bearing piece — see Phase 1a crash note
  // in vendor/react-native-draggable-flatlist/README-FORK.md.
  // Synchronous setDflAnims here would re-render during DFL's first
  // useEffect, in the same commit window as AIRMap's reconciliation.
  const handleAnimValInit = useCallback<
    NonNullable<DraggableFlatListProps<MapStop>["onAnimValInit"]>
  >((vals) => {
    requestAnimationFrame(() => {
      setDflAnims({
        hoverOffset: vals.hoverOffset,
        activeIndexAnim: vals.activeIndexAnim,
        activeCellSize: vals.activeCellSize,
        // Phase 1c — the fork-side gate. Without this, DFL's per-cell
        // worklets would shift chips out of the way even when the
        // dragged center is sitting on a target chip, contradicting
        // the SWAP overlay visually.
        disableSpacerTracking: vals.disableSpacerTracking,
        // Phase 2 (2026-05-21 evening) — the split-shift override
        // cell indices. The worklet writes the two cells adjacent to
        // the dragged chip's center; useCellTranslate's override
        // branch translates them ±cellSize/2 to part for an INSERT.
        // With the gate ALWAYS on during a drag (new model), the
        // non-overridden cells stay frozen and only these two animate.
        splitShiftLeftCellIdx: vals.splitShiftLeftCellIdx,
        splitShiftRightCellIdx: vals.splitShiftRightCellIdx,
        // Phase 3 (2026-05-22) — the off-end shift-all override
        // pivot indices. The worklet writes `shiftAllBeforeIdx =
        // activeIdx` for front-insert dramatic frames (cells before
        // activeIdx all slide +cellSize) and `shiftAllAfterIdx =
        // activeIdx` for back-insert dramatic frames (cells after
        // activeIdx all slide −cellSize). Either is −1 when the
        // classifier reports `dramaticShift: "none"`.
        shiftAllBeforeIdx: vals.shiftAllBeforeIdx,
        shiftAllAfterIdx: vals.shiftAllAfterIdx,
      });
    });
  }, []);

  // Mirror JS-side state into shared values the worklet can iterate
  // without a bridge hop.
  const orderedStopIdsSV = useSharedValue<number[]>([]);
  const chipCentersSV = useSharedValue<{ stopId: number; centerX: number }[]>(
    [],
  );
  const listAnchorXSV = useSharedValue(0);
  // Worklet output: the swap target (or null) this frame. Both the
  // overlay useAnimatedStyle AND handleDragEnd read this.
  const swapTarget = useSharedValue<SwapTargetInfo>(null);
  // Worklet output (Phase 2, 2026-05-21 evening): the slot index in
  // pendingOrder where the dragged chip should land if released right
  // now in INSERT mode. −1 = no INSERT intent this frame (we're in
  // SWAP or NOOP mode instead). handleDragEnd reads this to synthesize
  // the new ordering — DFL's reported from/to are unusable in the
  // always-gate model because the gate forces spacerIndex = activeIdx,
  // making DFL think the drop is at the active slot (from === to).
  const insertLandingSlot = useSharedValue<number>(-1);
  // Phase 7c (2026-05-22) — current frame's dramatic-shift directive
  // as reported by the classifier. 0 = "none", 1 = "front", 2 =
  // "back". Mirrors what the off-end shift-all branch wrote to the
  // DFL fork shared values, for the breadcrumb / debug snapshot only
  // (the actual visual effect is driven entirely through
  // shiftAllBeforeIdx / shiftAllAfterIdx). The numeric encoding
  // sidesteps reanimated's wariness of string shared values.
  const dramaticShiftSV = useSharedValue<0 | 1 | 2>(0);
  // Phase 2 (2026-05-21 evening, follow-up): freeze flag for the release
  // window. The bug we're closing: DFL fires onRelease the moment the
  // user lifts their finger, then runs a ~300ms `withSpring` on
  // touchTranslate before finally firing onDragEnd. During that spring,
  // hoverOffset animates back through slot positions, and the
  // consumer's worklet (which depends on hoverOffset) keeps re-running
  // and rewriting swapTarget / insertLandingSlot / split-shift indices
  // to track the spring-animated chip. By the time onDragEnd reaches
  // JS, the snapshot is gone (insertLandingSlot = −1, splits = −1,
  // chips snapped back). Setting isReleasingSV = true from the
  // onRelease handler makes the worklet bail on its body so the
  // chips stay parted AND the worklet outputs stay frozen until
  // handleDragEnd reads them. Cleared at the end of handleDragEnd and
  // also defensively in handleDragBegin in case a gesture cancels.
  const isReleasingSV = useSharedValue(false);
  // Phase 2 (same follow-up): the JS-side snapshot of the worklet's
  // outputs at the moment of release, populated by handleRelease and
  // consumed by handleDragEnd. Reading the snapshot (not the live
  // shared values) is what guarantees handleDragEnd sees the
  // user's actual drop intent and not whatever the worklet computed
  // mid-spring before isReleasingSV took effect.
  const releaseSnapshotRef = useRef<{
    insertLandingSlot: number;
    swapTarget: SwapTargetInfo;
    // Phase 7c (2026-05-22) — dramatic-shift directive at release
    // time, for the breadcrumb. 0/1/2 = none/front/back.
    dramaticShift: 0 | 1 | 2;
  } | null>(null);

  // Mirror pendingOrder stopIds whenever the prop changes. Cheap;
  // ~6 entries. Also re-bumped on drag-begin defensively below.
  useEffect(() => {
    orderedStopIdsSV.value = pendingOrder.map((s) => s.stopId);
  }, [pendingOrder, orderedStopIdsSV]);

  // Mirror chipPositionsRef → chipCentersSV on every layout bump.
  // Reanimated arrays must be plain (no Map/Set), hence the rebuild.
  useEffect(() => {
    const entries: { stopId: number; centerX: number }[] = [];
    for (const [stopId, pos] of chipPositionsRef.current.entries()) {
      entries.push({ stopId, centerX: pos.cx });
    }
    chipCentersSV.value = entries;
    listAnchorXSV.value = listWrapperPosRef.current?.x ?? 0;
  }, [layoutTick, chipCentersSV, listAnchorXSV]);

  // Phase 1c + Phase 2 (2026-05-21 evening) — snap-zone + split-shift
  // worklet. Runs once per frame while a drag is in flight.
  //
  // MODES (mutually exclusive each frame):
  //   - SWAP:   dragged chip's center is within ±SWAP_ZONE_HALF_WIDTH_PX
  //             of a non-active chip's center. Visual: list frozen, amber
  //             ring on target. swapTarget set, insertLandingSlot = −1,
  //             both split-shift indices = −1.
  //   - INSERT: dragged chip's center is between two slot centers (and not
  //             at the active slot's center). Visual: the two slot-adjacent
  //             non-active chips part ±cellSize/2, everything else freezes.
  //             swapTarget = null, insertLandingSlot = the slot index the
  //             dragged chip will occupy in the new ordering, split-shift
  //             indices = the two adjacent cell indices (or −1 at edges).
  //   - NOOP:   dragged chip is back at its own slot's center (or in active
  //             slot's swap zone). Visual: list frozen, no overlay. All
  //             outputs = null/−1. On release, no onReorder fires.
  //
  // GATE POLICY (changed Phase 2): disableSpacerTracking is ON for the
  // ENTIRE drag, not just SWAP frames. With the gate on, DFL's default
  // per-cell shift never runs and we drive ALL non-active translations
  // ourselves via the split-shift overrides. This is what makes INSERT
  // look like "two chips part" instead of "everyone slides down a slot".
  // The cost: DFL's onDragEnd from/to are now useless (gate forces
  // spacerIndex = activeIdx so from === to always). handleDragEnd reads
  // swapTarget + insertLandingSlot to synthesize the new order instead.
  //
  // GEOMETRY:
  //   hoverOffset is in DFL CONTAINER coords (= listAnchor's local space).
  //   chipCentersSV centers are in WINDOW coords (measureInWindow).
  //   Conversion: draggedCenterWindowX = listAnchorX + hoverOffset + cellSize/2.
  //   For mode classification (zones based on slot positions, which are
  //   uniform within the container) we work in SLOT-UNITS:
  //     slotApprox = hoverOffset / cellSize
  //   so slotApprox=K means the dragged chip's left edge is at slot K's
  //   left edge AND its center is at slot K's center.
  //
  // LANDING-SLOT FORMULA (INSERT mode): given the dragged chip is between
  // original slots floor(slotApprox) and ceil(slotApprox), the "gap
  // position" is gap = ceil(slotApprox) ∈ [0, N]. The dragged chip will
  // occupy this slot in the new ordering, with these special cases for
  // when active is adjacent to (or at) the gap:
  //   - active < gap-1: landingSlot = gap - 1  (gap shifts down by 1 after
  //                     active's removal)
  //   - active === gap-1: landingSlot = gap     (active is the LEFT chip;
  //                       user is "pushing" the right chip into active's
  //                       slot → effectively adjacent move)
  //   - active === gap:   landingSlot = gap - 1 (symmetric — push left chip)
  //   - active > gap:     landingSlot = gap     (no shift, active is to the
  //                       right of the gap)
  // Clamped to [0, N-1]. landingSlot === activeIdx → noop.
  useDerivedValue(() => {
    if (!dflAnims) {
      swapTarget.value = null;
      insertLandingSlot.value = -1;
      return;
    }

    // Phase 2 follow-up (2026-05-21 evening): bail when DFL is in its
    // release-spring window. The JS-side handleRelease sets
    // isReleasingSV=true the moment the user lifts their finger; if we
    // don't bail here, the worklet would keep tracking the spring-
    // animated hoverOffset and overwrite insertLandingSlot / swapTarget
    // / split-shift indices before handleDragEnd has a chance to read
    // them. Bailing means the parted chips also stay parted until
    // handleDragEnd clears the split-shift indices, which makes the
    // visual "the chips moved AND they stayed moved until the reorder
    // committed" instead of "the chips moved, then snapped back, then
    // the reorder failed silently." See the dev-log entry tagged
    // "2026-05-21 — Phase 2 follow-up: release snapshot + frozen worklet".
    if (isReleasingSV.value) {
      return;
    }

    const activeIdx = dflAnims.activeIndexAnim.value;
    const orderedIds = orderedStopIdsSV.value;
    const N = orderedIds.length;

    // Default outputs (NOOP / no-drag).
    let nextSwapTarget: SwapTargetInfo = null;
    let nextInsertLandingSlot = -1;
    let nextLeftCellIdx = -1;
    let nextRightCellIdx = -1;
    // Phase 3 (2026-05-22) — off-end shift-all pivots. activeIdx is
    // written here when the classifier returns dramaticShift !== "none".
    let nextShiftAllBeforeIdx = -1;
    let nextShiftAllAfterIdx = -1;
    let nextDramaticShift: 0 | 1 | 2 = 0;
    let nextGateOn = false;

    if (activeIdx >= 0 && N > 0) {
      // Drag in progress. Phase 2 policy: gate is ON for the whole drag.
      nextGateOn = true;

      const cellSize = dflAnims.activeCellSize.value || CHIP_CELL_FALLBACK;
      const hoverOff = dflAnims.hoverOffset.value;
      // Phase 7b (2026-05-22) — geometry moved to the pure
      // `classifySnapZone` helper in `src/utils/chip-bar-snap-zone.ts`
      // so the SWAP / INSERT / NOOP decision (especially the off-end
      // landing slots: drag-to-front → 0, drag-to-back → N-1) is
      // unit-testable without standing up reanimated. The helper is
      // marked `'worklet'` so reanimated inlines its body here on
      // the UI thread — same instructions, same shared-value reads,
      // just with the math factored out.
      //
      // Phase 7i follow-up (2026-05-22) — buffer subtraction:
      // DFL's `contentContainerStyle: { paddingHorizontal:
      // CHIP_BAR_OFF_END_BUFFER_PX }` shifts chip 0's cellOffset to
      // `BUFFER` (not `0`), so chip 0 is no longer flush with the
      // bar's interior edge. Subtracting BUFFER here keeps the
      // classifier's invariant intact: `slotApprox === 0` still
      // means "dragged chip's left edge aligned with chip 0's left
      // edge." The dramatic-shift trigger (`slotApprox <= 0`) now
      // fires as soon as the user drags into the visible gutter,
      // not only after they drag the chip partway off the bar.
      const decision = classifySnapZone({
        slotApprox: (hoverOff - CHIP_BAR_OFF_END_BUFFER_PX) / cellSize,
        cellSize,
        activeIdx,
        N,
      });

      if (decision.kind === "swap") {
        // SWAP zone. Compute the target's window-X for the amber ring.
        const targetStopId = orderedIds[decision.targetIdx];
        const centers = chipCentersSV.value;
        // Fallback to a computed center if measureInWindow hasn't fired
        // yet for this chip (e.g., right after a reorder). The math
        // mirrors what the layout produces: listAnchorX + DFL content
        // padding (the Phase 7i buffer that puts the front/back-insert
        // gutter on either side of the chip strip) + slot's offset
        // within the container + half a cell to get the center.
        let targetCenterX =
          listAnchorXSV.value +
          CHIP_BAR_OFF_END_BUFFER_PX +
          decision.targetIdx * cellSize +
          cellSize / 2;
        for (let i = 0; i < centers.length; i++) {
          if (centers[i].stopId === targetStopId) {
            targetCenterX = centers[i].centerX;
            break;
          }
        }
        nextSwapTarget = { stopId: targetStopId, centerX: targetCenterX };
      } else if (decision.kind === "insert") {
        nextInsertLandingSlot = decision.landingSlot;
        // Phase 7c (2026-05-22) — discriminate on the dramatic-shift
        // directive. For "front" / "back" we engage the Phase 3 fork
        // override (shiftAllBeforeIdx / shiftAllAfterIdx) and keep the
        // half-cell split-shift indices at -1 (the classifier already
        // forces them, but writing -1 here makes the policy obvious
        // and survives any future classifier change that loosens
        // that invariant). For "none" we use the existing half-cell
        // split-shift visual and keep the shift-all pivots at -1.
        if (decision.dramaticShift === "front") {
          nextShiftAllBeforeIdx = activeIdx;
          nextDramaticShift = 1;
        } else if (decision.dramaticShift === "back") {
          nextShiftAllAfterIdx = activeIdx;
          nextDramaticShift = 2;
        } else {
          nextLeftCellIdx = decision.leftCellIdx;
          nextRightCellIdx = decision.rightCellIdx;
        }
      }
      // decision.kind === "noop" → leave all outputs at defaults.
    }

    swapTarget.value = nextSwapTarget;
    insertLandingSlot.value = nextInsertLandingSlot;
    dramaticShiftSV.value = nextDramaticShift;
    if (dflAnims) {
      dflAnims.disableSpacerTracking.value = nextGateOn;
      dflAnims.splitShiftLeftCellIdx.value = nextLeftCellIdx;
      dflAnims.splitShiftRightCellIdx.value = nextRightCellIdx;
      dflAnims.shiftAllBeforeIdx.value = nextShiftAllBeforeIdx;
      dflAnims.shiftAllAfterIdx.value = nextShiftAllAfterIdx;
    }
  });

  // The overlay's animated style. ONE Animated.View per chip bar
  // (not per chip). pointerEvents="none" on the host so the chip
  // pressables underneath stay tappable / draggable.
  const overlayStyle = useAnimatedStyle(() => {
    const t = swapTarget.value;
    if (t == null) {
      return { opacity: 0, transform: [{ translateX: 0 }] };
    }
    // Position the overlay so its center lands on the target chip.
    // Centers are window coords; subtract the list anchor's window-X
    // to convert into the listAnchor's local coordinate space.
    const left = t.centerX - listAnchorXSV.value - OVERLAY_DIAMETER / 2;
    return { opacity: 1, transform: [{ translateX: left }] };
  });

  // r16.2 (2026-05-21) — `hoverIndex` removed. The previous
  // implementation highlighted the chip we'd swap with on release;
  // that visual was a LIE since the recorded action was a swap-pair
  // while DFL was visually doing insertion. Two contradictory
  // signals at once. With insertion as the only treatment now,
  // DFL's own placeholder gap (the empty slot it leaves where
  // the dragged chip will land) is the correct hover indicator and
  // we don't need to render anything custom.

  // Phase 7a removed the auto-tooltip-close-on-commit effect that
  // used to live here — there's no longer a "commit phase" in the
  // bar's lifecycle (every drag commits via its mini-sheet, and
  // the sheet's own backdrop already steals focus from the
  // tooltip when it opens). See plan §7a.

  // r16.15 / r16.16 (2026-05-21) — force re-measurement of every
  // known chip whenever pendingOrder changes (drag-end, commit
  // settle, parent hydrates new server state, etc.).
  //
  // Why this is necessary: chipPositionsRef is keyed by stopId and
  // is only refreshed when a chip's <View> onLayout fires.  RN's
  // onLayout only fires when a View's frame changes *relative to
  // its direct parent*.  When DraggableFlatList reorders, FlatList
  // re-renders cells in their new horizontal positions but each
  // chip's frame *inside its cell* doesn't change — only the cell's
  // position in the list does.  Result: the chip wrapper's
  // onLayout never re-fires for shifted chips, the cached window
  // coords stay stale, and the tooltip overlay (which reads those
  // coords) renders at the chip's pre-drag location.
  //
  // r16.15 (initial) — single rAF, caught the chip at the first
  // paint after pendingOrder change. Problem: react-native-
  // draggable-flatlist animates cell positions via Animated.Value
  // over ~200-300ms on drag-end. A single rAF fires BEFORE that
  // animation settles, so measureInWindow returns the chip's
  // pre-animation x (off by 42-84px = "one or two chips" — exactly
  // what the user reported).
  //
  // r16.16 (this) — multi-pass: rAF + setTimeouts at 100/250/450ms.
  // Each pass re-measures every chip via measureInWindow, which
  // returns CURRENT window coords on each call. The last pass at
  // 450ms is well past any DFL slide animation, so the tooltip
  // always converges to the chip's final resting position even if
  // the early passes caught it mid-animation. layoutTick is bumped
  // per measurement, so tooltipOverlayPos re-evaluates and the
  // bubble visibly slides into place as the chip animates.
  useEffect(() => {
    const measureAll = () => {
      // Snapshot stopIds first — chipNodesRef can mutate during the
      // measurement loop on rare DFL re-renders.
      const stopIds = Array.from(chipNodesRef.current.keys());
      for (const stopId of stopIds) measureChip(stopId);
      measureListWrapper();
    };
    const rafHandle = requestAnimationFrame(measureAll);
    const t100 = setTimeout(measureAll, 100);
    const t250 = setTimeout(measureAll, 250);
    const t450 = setTimeout(measureAll, 450);
    return () => {
      cancelAnimationFrame(rafHandle);
      clearTimeout(t100);
      clearTimeout(t250);
      clearTimeout(t450);
    };
  }, [pendingOrder, measureChip, measureListWrapper]);

  // r16.10 — measure helpers. measureInWindow is async (the
  // callback fires on next tick); we read into refs then bump the
  // tick so the overlay re-renders with the new coords. Cheap; no
  // state thrash because measurements settle within a frame.
  const measureChip = useCallback(
    (stopId: number) => {
      const node = chipNodesRef.current.get(stopId);
      if (!node) return;
      node.measureInWindow((x, y, width, _height) => {
        // Guard against negative / NaN values RN sometimes hands
        // back during transient unmounts.
        if (!Number.isFinite(x) || !Number.isFinite(y) || width <= 0) return;
        chipPositionsRef.current.set(stopId, {
          cx: x + width / 2,
          topY: y,
          width,
        });
        bumpLayoutTick();
      });
    },
    [bumpLayoutTick],
  );
  const measureListWrapper = useCallback(() => {
    const node = listWrapperRef.current;
    if (!node) return;
    node.measureInWindow((x, y, width, height) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      listWrapperPosRef.current = { x, y, width, height };
      bumpLayoutTick();
    });
  }, [bumpLayoutTick]);

  const handleChipTap = useCallback(
    (stop: MapStop) => {
      // r16.18 — a tap is an explicit user intent; outranks any
      // pending post-drag reopen timer that may still be in flight.
      cancelTooltipReopen();
      // r16.7 — toggle the tooltip on this chip…
      setTooltipStopId((prev) => (prev === stop.stopId ? null : stop.stopId));
      // …AND update the parent's selection so the chip highlights
      // and the map marker focuses to match. Only fires when the
      // tap is selecting a DIFFERENT chip — re-tapping the already
      // selected chip just toggles its tooltip closed and leaves
      // the selection alone (matches the marker-tap idempotency in
      // handleMarkerActionsPress).
      if (onSelectChip && selectedStopId !== stop.stopId) {
        onSelectChip(stop);
      }
      traceMap("chip_bar_chip_tap", {
        routeId: route.routeId,
        stopId: stop.stopId,
        selectionChanged: selectedStopId !== stop.stopId,
        action:
          tooltipStopId === stop.stopId
            ? "close"
            : tooltipStopId === null
              ? "open"
              : "move",
      });
    },
    [
      route.routeId,
      tooltipStopId,
      selectedStopId,
      onSelectChip,
      cancelTooltipReopen,
    ],
  );

  // Swipe-down on the tooltip dismisses it.
  const dismissTooltip = useCallback(() => setTooltipStopId(null), []);
  const tooltipDismissGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([20, 9999])
        .onEnd((event) => {
          "worklet";
          if (event.translationY > 30) {
            runOnJS(dismissTooltip)();
          }
        }),
    [dismissTooltip],
  );

  useEffect(() => {
    traceMap("chip_bar_mount", {
      routeId: route.routeId,
      technicianId: route.technicianId,
      selectedStopId,
      chipCount: pendingOrder.length,
      totalRouteStops: route.stops.length,
      color,
    });
    return () => {
      traceMap("chip_bar_unmount", {
        routeId: route.routeId,
        selectedStopId,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderChip = useCallback(
    ({ item, drag, isActive }: RenderItemParams<MapStop>) => {
      const isSelected = item.stopId === selectedStopId;
      // r16.3 — numberLabel is the STABLE server stop_order.
      const numberLabel = item.stopOrder;
      // r16.10 — chipWrapper holds a ref + onLayout. The tooltip
      // is NOT rendered here anymore (DFL ScrollView clips inline
      // children). The overlay below `<DraggableFlatList>` reads
      // chipPositionsRef to place a single tooltip sibling.
      const handleChipLayout = (_e: LayoutChangeEvent) => {
        measureChip(item.stopId);
      };
      const setChipRef = (node: View | null) => {
        if (node) chipNodesRef.current.set(item.stopId, node);
        else chipNodesRef.current.delete(item.stopId);
      };
      return (
        <ScaleDecorator activeScale={1.2}>
          <View
            ref={setChipRef}
            style={styles.chipWrapper}
            onLayout={handleChipLayout}
            collapsable={false}
          >
            <ChipSurface
              isSelected={isSelected}
              isActive={isActive}
              // Phase 7a removed `disabled={isCommitting}` — there's
              // no longer a commit-chain phase that could leave the
              // bar mid-flight; each mini-sheet's own Save button
              // is what carries the "in flight" disabled state.
              disabled={false}
              color={color}
              numberLabel={numberLabel}
              stopId={item.stopId}
              routeId={route.routeId}
              drag={drag}
              onTap={() => handleChipTap(item)}
            />
          </View>
        </ScaleDecorator>
      );
    },
    [
      selectedStopId,
      color,
      handleChipTap,
      route.routeId,
      measureChip,
    ],
  );

  // r16.10 — derive the active tooltip's overlay position from the
  // measured chip + listWrapper window coords. layoutTick is the
  // dep that forces re-evaluation on each measurement update.
  const tooltipStop = useMemo(() => {
    if (tooltipStopId == null) return null;
    return pendingOrder.find((s) => s.stopId === tooltipStopId) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tooltipStopId, pendingOrder]);
  const tooltipOverlayPos = useMemo<
    { left: number; bottom: number } | null
  >(() => {
    if (tooltipStopId == null) return null;
    const chipPos = chipPositionsRef.current.get(tooltipStopId);
    const listPos = listWrapperPosRef.current;
    if (!chipPos || !listPos) return null;
    // r16.12 — bubble's left edge math directly. No overlay wrapper,
    // no alignItems:center middleman, no rounding drift.
    //   bubble.left (in listAnchor coords)
    //     = chipCenterX (window) - listAnchorX (window) - bubbleWidth/2
    // Bubble's center = bubble.left + bubbleWidth/2 = chipCenterX - listAnchorX
    // Window x of bubble center = listAnchorX + (chipCenterX - listAnchorX) = chipCenterX ✓
    const left = chipPos.cx - listPos.x - TOOLTIP_BUBBLE_WIDTH / 2;
    // bottom-relative inside listWrapper: distance from listWrapper
    // bottom to the chip's top, plus an 8px gap.
    const chipTopRelativeY = chipPos.topY - listPos.y;
    const bottom = listPos.height - chipTopRelativeY + 8;
    return { left, bottom };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tooltipStopId, layoutTick]);

  const handleDragBegin = useCallback(
    (index: number) => {
      // r16.5 (2026-05-21) — hide-on-drag, reopen-at-destination.
      // The user accepted this fallback model when we couldn't
      // make the in-place tooltip follow the chip naturally (DFL
      // clips overflow inside the FlatList container even with
      // overflow:visible on our wrappers). Stash who was open so
      // handleDragEnd can reopen it on the same stop's new slot.
      // r16.18 — also cancel any pending post-drag reopen timer
      // from a previous drag; the new drag supersedes it.
      cancelTooltipReopen();
      tooltipBeforeDragRef.current = tooltipStopId;
      setTooltipStopId(null);
      // Phase 1c + Phase 2 — clear all worklet outputs AND release the
      // DFL-fork gate/split-shift overrides from a previous drag. The
      // worklet will repopulate all of these within ~1 frame once the
      // chip starts moving.
      swapTarget.value = null;
      insertLandingSlot.value = -1;
      dramaticShiftSV.value = 0;
      if (dflAnims) {
        dflAnims.disableSpacerTracking.value = false;
        dflAnims.splitShiftLeftCellIdx.value = -1;
        dflAnims.splitShiftRightCellIdx.value = -1;
        // Phase 3 (2026-05-22) — clear the off-end shift-all pivots
        // alongside the half-cell split-shift indices. Without this,
        // a previous drag's dramatic-shift state could persist into
        // the new drag's first frame before the worklet repopulates.
        dflAnims.shiftAllBeforeIdx.value = -1;
        dflAnims.shiftAllAfterIdx.value = -1;
      }
      // Phase 2 follow-up: defensive clears for the release window.
      // If the previous gesture was canceled before handleDragEnd
      // could clean up (rare but possible — e.g., the screen
      // dimensions changed mid-drag and DFL force-tore down), these
      // would still be set from that drag and the new drag's worklet
      // would never produce outputs (because isReleasingSV gates the
      // body). Belt and suspenders.
      isReleasingSV.value = false;
      releaseSnapshotRef.current = null;
      traceMap("chip_bar_drag_begin", {
        routeId: route.routeId,
        fromIndex: index,
        fromStopId: pendingOrder[index]?.stopId,
        tooltipStashed: tooltipBeforeDragRef.current,
      });
    },
    [
      route.routeId,
      pendingOrder,
      tooltipStopId,
      cancelTooltipReopen,
      swapTarget,
      insertLandingSlot,
      dramaticShiftSV,
      isReleasingSV,
      dflAnims,
    ],
  );

  // Phase 2 follow-up (2026-05-21 evening, second pass). DFL fires
  // onRelease the INSTANT the user lifts their finger, BEFORE the
  // ~300ms release spring runs and BEFORE onDragEnd fires (see
  // DraggableFlatList.tsx line ~303: `runOnJS(onRelease)(activeIndexAnim.value)`
  // is called synchronously before the `touchTranslate = withSpring(...)`
  // call). We use that window to do three things in order:
  //
  //   1. Snapshot the worklet's current outputs (swapTarget +
  //      insertLandingSlot) to a JS ref. handleDragEnd reads from
  //      this ref instead of the live shared values, which by the
  //      time onDragEnd fires would have been overwritten by the
  //      worklet's frame-by-frame tracking of the release spring's
  //      animated hoverOffset.
  //
  //   2. Clear the split-shift indices to -1 NOW (not in
  //      handleDragEnd after the spring). With splits = -1 and the
  //      Phase 1 gate still ON (disableSpacerTracking true,
  //      spacerIndexAnim still pinned to activeIndexAnim by the
  //      Phase 1 reset), every non-active cell's worklet falls
  //      through to the fork's default DFL math and returns
  //      withSpring(0). The two parted chips immediately start
  //      animating back to their natural-slot positions during the
  //      ~300ms release window, well before the data reorders.
  //
  //   3. Set isReleasingSV = true. The CONSUMER worklet (the one in
  //      this file that writes swapTarget / insertLandingSlot /
  //      splitShifts) bails on its body on next frame, so it
  //      doesn't re-engage the split-shift indices as the dragged
  //      chip's hoverOffset spring-animates through other slot
  //      positions. The per-cell worklets in the fork keep running
  //      (they don't read isReleasingSV) — that's intentional, they
  //      need to compute the withSpring(0) cleanup.
  //
  // handleDragEnd later clears swapTarget / insertLandingSlot /
  // disableSpacerTracking / isReleasingSV (in that order, with
  // isReleasingSV last). All of these are also defensively cleared
  // in handleDragBegin in case onRelease fires but onDragEnd doesn't
  // (canceled gesture, screen rotation mid-drag, etc.).
  //
  // Why this ordering matters: a previous iteration cleared splits
  // in handleDragEnd instead of handleRelease. That left the chips
  // visually frozen at +/- cellSize/2 for the entire ~300ms release
  // spring, then handleDragEnd cleared splits and called onReorder
  // back-to-back. The cells' withSpring(0) cleanup animations were
  // mid-flight when the data updated, and the cellOffset jumps from
  // the re-render (a moved chip's cellIndex changes → cellOffset
  // jumps by N * cellSize) raced against the in-flight translations,
  // producing the residual uneven gaps the user saw in the chip bar
  // after committing.
  const handleRelease = useCallback(
    (_index: number) => {
      // 1. Snapshot the worklet outputs to a JS ref so handleDragEnd
      //    can read them later (the live shared values would otherwise
      //    be overwritten by the worklet tracking the spring-animated
      //    hoverOffset back to the active slot during the release window).
      releaseSnapshotRef.current = {
        insertLandingSlot: insertLandingSlot.value,
        swapTarget: swapTarget.value,
        dramaticShift: dramaticShiftSV.value,
      };
      // 2. Clear the split-shift indices NOW (not in handleDragEnd
      //    after the spring). With splits = -1, every non-active cell
      //    falls through to the fork's default DFL math, which — with
      //    disableSpacerTracking still ON (Phase 1 gate active) and
      //    spacerIndexAnim still pinned to activeIndexAnim — computes
      //    translationAmt = 0 and returns withSpring(0). The two
      //    parted chips immediately start animating back to their
      //    natural-slot positions during the ~300ms release window.
      //    By the time onDragEnd fires + onReorder updates the data,
      //    every non-active cell is at translation 0 and re-renders
      //    into the new layout cleanly — no leaked split-shifts.
      //
      //    Previous behavior (2026-05-21 evening, first pass) cleared
      //    splits in handleDragEnd instead. That left ~300ms of
      //    "chips frozen at split positions" during the spring, then
      //    a single moment where handleDragEnd cleared splits AND the
      //    data updated together — the cell-translation springs (from
      //    +/- cellSize/2 toward 0) raced against the cellOffset
      //    jumps from re-render, producing the residual uneven gaps
      //    the user saw in the bar after committing.
      if (dflAnims) {
        dflAnims.splitShiftLeftCellIdx.value = -1;
        dflAnims.splitShiftRightCellIdx.value = -1;
        // Phase 3 (2026-05-22) — clear the off-end shift-all pivots
        // alongside the half-cell split-shift indices. Same rationale
        // as handleDragBegin: the parted/shifted cells need to spring
        // back to translation 0 during the release window so the
        // re-render after onReorder doesn't race against in-flight
        // springs. Without this, dramatic-shift drops would leave
        // every chip in the bar at +/-cellSize while DFL's release
        // spring runs.
        dflAnims.shiftAllBeforeIdx.value = -1;
        dflAnims.shiftAllAfterIdx.value = -1;
      }
      // 3. Freeze the consumer worklet so it doesn't re-engage the
      //    split-shift indices as the dragged chip springs back
      //    through other slot positions. With isReleasingSV true,
      //    the worklet bails on its body, leaving splits at -1.
      //    handleDragEnd clears isReleasingSV at the end of its
      //    cleanup.
      isReleasingSV.value = true;
    },
    [insertLandingSlot, swapTarget, dramaticShiftSV, isReleasingSV, dflAnims],
  );

  // PLAN-DEVIATION: 2026-05-21-chip-bar-snap-mini-sheet — handleDragEnd
  // routes to mini-sheet callbacks (`onRequestSwapWithTimes` /
  // `onRequestInsertAtPosition`) instead of the plan's pre-existing
  // r16.1/r16.2 auto-trade `onReorder` path. See
  // docs/PLAN-DEVIATIONS.md#2026-05-21-chip-bar-snap-mini-sheet.
  // PLAN-DEVIATION: 2026-05-22-chip-bar-plan-mode-batch — when
  // `planMode === true`, the SWAP/INSERT branches below short-circuit
  // to `onPlannedSwap` / `onPlannedInsert` instead of opening the
  // mini-sheet, enqueueing the move into the planned-move queue. See
  // docs/PLAN-DEVIATIONS.md#2026-05-22-chip-bar-plan-mode-batch.
  const handleDragEnd = useCallback(
    ({ from }: { data: MapStop[]; from: number; to: number }) => {
      // Phase 2 (2026-05-21 evening) — DFL's `data`, `to` params are
      // unusable now. With disableSpacerTracking gated ON for the entire
      // drag, DFL's per-cell shift never runs, so its spacerIndexAnim
      // stays pinned to activeIndexAnim and it reports from === to even
      // when the user clearly dragged the chip elsewhere. We rebuild
      // the new ordering ourselves from the worklet's last-written
      // swapTarget + insertLandingSlot snapshots.
      //
      // Phase 2 follow-up: the snapshot we use is the one captured by
      // handleRelease (in the JS ref), NOT a live read of the shared
      // values. By the time onDragEnd fires (~300ms after release,
      // after DFL's spring completes), the live shared values have
      // been overwritten by the worklet tracking the spring-animated
      // hoverOffset back to the active slot. The ref captures the
      // intent at the moment of release, which is what we want.
      //
      // Fallback to a live read if the ref is somehow null (defensive
      // — onRelease should always fire before onDragEnd per DFL's
      // code path, but if a future upstream change reordered them
      // we'd still get the best-effort live read instead of crashing).
      //
      // Mode classification:
      //   - swapTarget set → SWAP: build order by swapping `from` with
      //     swap-target's index.
      //   - insertLandingSlot >= 0 → INSERT: build order by removing
      //     `from` and re-inserting at insertLandingSlot.
      //   - both null/−1 → NOOP: pendingOrder is unchanged.
      const snapshot = releaseSnapshotRef.current;
      const snapTargetSnapshot = snapshot?.swapTarget ?? swapTarget.value;
      const insertLandingSnapshot =
        snapshot?.insertLandingSlot ?? insertLandingSlot.value;
      // Phase 7c (2026-05-22) — capture for the breadcrumb. Not used
      // for control flow; the dramatic-shift visual is purely a
      // landing-slot-0-or-N-1 case and `insertLandingSlot` already
      // drives the data side. The label helps Sentry distinguish
      // "user dragged to true bookend" from "user dragged to
      // interior position that happens to land at slot 0 / N-1".
      const dramaticShiftSnapshot = snapshot?.dramaticShift ?? 0;
      releaseSnapshotRef.current = null;
      const stashed = tooltipBeforeDragRef.current;
      tooltipBeforeDragRef.current = null;
      // Clear the remaining worklet outputs + fork gates. The
      // split-shift indices were already cleared by handleRelease
      // (so the cells could spring back to translation 0 during the
      // release window), but we re-clear them defensively here to
      // keep this cleanup idempotent — if a future code path lifts
      // them in handleDragBegin or somewhere unexpected, this still
      // catches it.
      //
      // Ordering rationale:
      //   - Clear swapTarget / insertLandingSlot first (these are
      //     consumer-owned, no race with cell worklets).
      //   - Clear disableSpacerTracking next. This turns OFF the
      //     Phase 1 gate, so DFL's default per-cell shift math
      //     becomes live again. By this point the cells are already
      //     at translation 0 (cleaned up during the release window),
      //     and the dragged chip has finished its release spring
      //     back to its active slot — so default DFL math doesn't
      //     have anything to shift, and we don't see a flash.
      //   - Clear isReleasingSV LAST so any worklet evaluation that
      //     fires between these JS writes still sees isReleasingSV
      //     true and bails on its body (no chance of a brief
      //     re-write to a just-cleared split-shift).
      swapTarget.value = null;
      insertLandingSlot.value = -1;
      dramaticShiftSV.value = 0;
      if (dflAnims) {
        dflAnims.disableSpacerTracking.value = false;
        dflAnims.splitShiftLeftCellIdx.value = -1;
        dflAnims.splitShiftRightCellIdx.value = -1;
        // Phase 3 (2026-05-22) — defensive clear, same as the
        // split-shift indices. handleRelease already cleared them,
        // but this cleanup is idempotent so a future code path that
        // somehow re-engages them between onRelease and onDragEnd
        // (e.g. a worklet glitch) still gets reset here.
        dflAnims.shiftAllBeforeIdx.value = -1;
        dflAnims.shiftAllAfterIdx.value = -1;
      }
      isReleasingSV.value = false;

      // Build newOrderedIds + classify mode.
      const currentIds = pendingOrder.map((s) => s.stopId);
      let newOrderedIds: number[] = currentIds;
      let snapMode: "swap" | "insert" | "noop" = "noop";
      let movedStopId: number | null = null;
      let toIndex = from;

      if (snapTargetSnapshot != null) {
        // SWAP: find target idx, swap with from.
        const targetIdx = currentIds.indexOf(snapTargetSnapshot.stopId);
        if (targetIdx >= 0 && targetIdx !== from) {
          const next = currentIds.slice();
          const a = next[from];
          next[from] = next[targetIdx];
          next[targetIdx] = a;
          newOrderedIds = next;
          snapMode = "swap";
          movedStopId = a;
          toIndex = targetIdx;
        }
      } else if (insertLandingSnapshot >= 0 && insertLandingSnapshot !== from) {
        // INSERT: remove from, splice in at landing slot.
        const next = currentIds.slice();
        const [moved] = next.splice(from, 1);
        next.splice(insertLandingSnapshot, 0, moved);
        newOrderedIds = next;
        snapMode = "insert";
        movedStopId = moved;
        toIndex = insertLandingSnapshot;
      }

      const isNoop = snapMode === "noop";
      // r16.17 (2026-05-21) — tooltip reopen target.
      //   - noop drag: restore whatever was open before (or nothing).
      //     The user didn't actually move anything; preserve their
      //     prior context.
      //   - real move + a tooltip was open before: show the MOVED
      //     chip's tooltip. The user was actively in "tooltip mode"
      //     and just deliberately moved a chip — confirming the
      //     move on that chip is the natural feedback.
      //   - real move + no tooltip open before: don't surprise the
      //     user with a popup they didn't ask for.
      // Pre-r16.17 we always restored `stashed`, which felt wrong
      // when the user dragged chip B while chip A's tooltip was
      // open — A's tooltip would pop back up over B's new slot,
      // leaving the chip the user actually moved (B) untagged.
      const reopenStopId = isNoop
        ? stashed
        : stashed != null
          ? movedStopId
          : null;
      traceMap("chip_bar_drag_end_local_insert", {
        routeId: route.routeId,
        from,
        to: toIndex,
        movedStopId,
        newOrderedIds,
        isNoop,
        tooltipStashed: stashed,
        tooltipReopen: reopenStopId,
        tooltipReopenDelayed: !isNoop && reopenStopId != null,
        // Phase 1c + Phase 2 — snap-zone classification. With the
        // gate ON for the entire drag, DFL's from/to are unusable;
        // we synthesize `to` and `newOrderedIds` from the worklet's
        // last-written swapTarget / insertLandingSlot snapshots.
        snapMode,
        swapTargetStopId: snapTargetSnapshot?.stopId ?? null,
        insertLandingSlot: insertLandingSnapshot,
        // Phase 7c (2026-05-22) — dramatic-shift classification of
        // the drop frame. "none" = interior (or non-bookend) INSERT
        // /SWAP / NOOP. "front" / "back" = off-end INSERT that
        // engaged the Phase 3 fork's shift-all visual.
        dramaticShift:
          dramaticShiftSnapshot === 1
            ? "front"
            : dramaticShiftSnapshot === 2
              ? "back"
              : "none",
        phase1cObservationOnly: true,
      });
      // Phase 4 (2026-05-21) — SWAP-mode branch. When the dispatcher
      // dropped onto another chip's snap zone AND the parent supplied
      // `onRequestSwapWithTimes`, route the gesture to the parent's
      // dual-picker mini-sheet flow instead of the legacy auto-trade
      // onReorder commit chain. The parent is responsible for:
      //   1. Opening `<DragRescheduleSheet>` in `kind: "swap"`.
      //   2. Submitting via the extended `swapStops` mutation (with
      //      explicit times + notifyCustomer per the dispatcher's
      //      picks).
      //   3. Updating its own `pendingOrder` to reflect the just-
      //      committed swap.
      // For NOOP drags and INSERT-mode drags we still fall through
      // to the legacy onReorder path — INSERT wires up its own
      // mini-sheet in Phase 6.
      // Compute the route-to-mini-sheet payload as a single nullable
      // tuple. Lets TS narrow `dragged` + `target` once at the
      // declaration site instead of re-checking nullability at every
      // call site below.
      const swapMiniSheetPayload: {
        dragged: number;
        target: number;
      } | null =
        snapMode === "swap" &&
        onRequestSwapWithTimes != null &&
        snapTargetSnapshot != null &&
        movedStopId != null
          ? { dragged: movedStopId, target: snapTargetSnapshot.stopId }
          : null;

      // Phase 6 (2026-05-22) — INSERT-mode branch. Mirror of the
      // SWAP payload above: when the dispatcher dropped between two
      // chips AND the parent supplied `onRequestInsertAtPosition`,
      // we route the gesture into the parent's mini-sheet flow
      // instead of committing `onReorder` directly. The parent will:
      //   1. Open `<DragRescheduleSheet>` in `kind: "insert"`,
      //      passing the window + duration from
      //      `computeInsertWindow(pendingOrder, draggedStopId,
      //      insertAtIndex)`.
      //   2. Submit via the `repositionStop` mutation with the
      //      dispatcher's explicit start time + notifyCustomer pick.
      //   3. Let optimistic cache updates from the hook re-derive
      //      the local pendingOrder on its own — same as SWAP.
      // `insertLandingSnapshot` IS the splice-after-removal index
      // and maps 1:1 onto `computeInsertWindow`'s `insertAtIndex`
      // parameter — no off-by-one translation needed at this layer.
      const insertMiniSheetPayload: {
        dragged: number;
        insertAtIndex: number;
      } | null =
        snapMode === "insert" &&
        onRequestInsertAtPosition != null &&
        movedStopId != null &&
        insertLandingSnapshot >= 0
          ? { dragged: movedStopId, insertAtIndex: insertLandingSnapshot }
          : null;

      // r16.18 — for a NOOP drag the chip didn't move, so its cached
      // measurement is still accurate and we can reopen the tooltip
      // immediately. For a real move we must wait for DFL's slide
      // animation (~300ms) to settle before rendering the tooltip,
      // otherwise the bubble paints at the chip's pre-move x for
      // 50-450ms — which usually overlaps a different chip's new
      // slot, hence the "flash on wrong chip" effect.
      cancelTooltipReopen();
      if (reopenStopId == null) {
        if (swapMiniSheetPayload && onRequestSwapWithTimes) {
          onRequestSwapWithTimes(
            swapMiniSheetPayload.dragged,
            swapMiniSheetPayload.target,
          );
        } else if (insertMiniSheetPayload && onRequestInsertAtPosition) {
          onRequestInsertAtPosition(
            insertMiniSheetPayload.dragged,
            insertMiniSheetPayload.insertAtIndex,
          );
        } else if (!isNoop) {
          onReorder(newOrderedIds);
        }
        return;
      }
      if (isNoop) {
        setTooltipStopId(reopenStopId);
        return;
      }
      if (swapMiniSheetPayload && onRequestSwapWithTimes) {
        onRequestSwapWithTimes(
          swapMiniSheetPayload.dragged,
          swapMiniSheetPayload.target,
        );
      } else if (insertMiniSheetPayload && onRequestInsertAtPosition) {
        onRequestInsertAtPosition(
          insertMiniSheetPayload.dragged,
          insertMiniSheetPayload.insertAtIndex,
        );
      } else {
        onReorder(newOrderedIds);
      }
      tooltipReopenTimerRef.current = setTimeout(() => {
        tooltipReopenTimerRef.current = null;
        setTooltipStopId(reopenStopId);
      }, 350);
    },
    [
      route.routeId,
      pendingOrder,
      onReorder,
      onRequestSwapWithTimes,
      onRequestInsertAtPosition,
      cancelTooltipReopen,
      swapTarget,
      insertLandingSlot,
      dramaticShiftSV,
      isReleasingSV,
      dflAnims,
    ],
  );

  // Phase 7a removed `handleCommit` + `handleDiscard` — neither
  // gesture exists anymore. The bottom-bar Commit/Discard
  // buttons that triggered them were redundant after the snap-
  // zone mini-sheets shipped (Phases 4 + 6); every drag commits
  // directly via its sheet's Save and there's no batch to
  // discard. See plan §7a.

  const handleDismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        <GestureHandlerRootView style={styles.listWrapper}>
          <View
            ref={listWrapperRef}
            style={styles.listAnchor}
            onLayout={measureListWrapper}
            collapsable={false}
          >
          <DraggableFlatList
              data={pendingOrder}
            horizontal
            keyExtractor={(item) => String(item.stopId)}
            renderItem={renderChip}
              onDragBegin={handleDragBegin}
            onDragEnd={handleDragEnd}
              // Phase 2 follow-up (2026-05-21 evening): see handleRelease
              // header comment. onRelease fires before DFL's ~300ms
              // release spring; this is our last chance to capture the
              // worklet's outputs and freeze it before the spring
              // animates hoverOffset back through slot positions.
              onRelease={handleRelease}
              onAnimValInit={handleAnimValInit}
              activationDistance={0}
              // Phase 7i follow-up (2026-05-22) — empty gutters on
              // both sides of the chip strip dedicate physical
              // drop-zone real estate to front- and back-insert
              // (dramatic-shift visual). DFL shifts chip 0's cellOffset
              // by `paddingHorizontal`, which the worklet compensates
              // for when computing slotApprox. See the constant's
              // docstring for the user-report rationale.
              contentContainerStyle={{
                paddingHorizontal: CHIP_BAR_OFF_END_BUFFER_PX,
              }}
            />
            {/* r17.b (2026-05-21) — single snap-zone overlay (one
                Animated.View per chip bar). See the long header
                comment near useDerivedValue above for why this is
                ONE overlay and not per-chip. Position is driven by
                a worklet reading swapTarget.value. Invisible at rest
                (opacity:0, no animation running). */}
            <Animated.View
              pointerEvents="none"
              style={[styles.snapOverlay, overlayStyle]}
            />
            {/* r16.12 — tooltip Pressable rendered as direct sibling
                of DraggableFlatList. No overlay wrapper, no flex
                centering. The Pressable is positioned absolutely
                with `left = chipCenterX - listAnchorX - bubbleWidth/2`
                so the bubble's own center lands exactly on the chip.
                Eliminates the consistent left-drift seen in r16.11
                (which came from flex centering between a 160-wide
                overlay and a 148-wide bubble — even though the math
                says "centered," iOS subpixel rounding leaned the
                bubble 5-7px off in a consistent direction). */}
            {tooltipStop && tooltipOverlayPos && (
              <GestureDetector gesture={tooltipDismissGesture}>
                <Pressable
                  style={[
                    styles.tooltip,
                    {
                      left: tooltipOverlayPos.left,
                      bottom: tooltipOverlayPos.bottom,
                    },
                  ]}
                  onPress={() => {
                    if (!onReschedule) return;
                    setTooltipStopId(null);
                    onReschedule(tooltipStop);
                    traceMap("chip_bar_tooltip_tap_reschedule", {
                      routeId: route.routeId,
                      stopId: tooltipStop.stopId,
                      appointmentId: tooltipStop.appointmentId,
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Reschedule ${tooltipStop.customerName ?? "appointment"}`}
                >
                  <Text style={styles.tooltipName} numberOfLines={1}>
                    {tooltipStop.customerName ?? "Customer"}
                  </Text>
                  <Text style={styles.tooltipTime}>
                    {formatTimeRange12h(
                      tooltipStop.scheduledTime,
                      tooltipStop.scheduledEndTime,
                    )}
                  </Text>
                  <View style={styles.tooltipTail} />
                </Pressable>
              </GestureDetector>
            )}
          </View>
        </GestureHandlerRootView>

        {/* B2-1 (2026-05-22, follow-up) — the Plan-mode pill lives
            INSIDE the bar's right-side action cluster, immediately
            before Tech. Original B2-1 placed it under the bar in
            the hint row; user feedback was that it should sit on
            the white bar next to the Tech button, styled the same
            way as that button so the UI feels uniform. Geometry
            (height, padding, border-radius, gap, icon size, label
            weight, on/off colors) intentionally mirrors Tech via
            shared `reassignButton`/`reassignButtonLabel` styles —
            only the icon + label text + active-state colors differ.
            Renders only when the parent passes `planModeActive`;
            non-route-map consumers (unit tests, hypothetical
            future surfaces) get the original button cluster.

            B2-4 (2026-05-22) — the same pill morphs into a
            "{N} · Review" CTA when plan mode is active AND there
            are staged moves. Tapping the CTA opens
            `<ReviewPlanSheet>` instead of toggling plan mode off;
            toggle-off in the staged-plan state needs a confirm-
            discard prompt and that lands in B2-6. Until then,
            the user exits plan mode by either committing all moves
            (B2-5) or removing them one-by-one in the review sheet
            until the pill reverts back to the plain toggle. */}
        {planModeActive != null && onTogglePlanMode ? (
          planModeActive && pendingMoveCount > 0 && onOpenReviewPlan ? (
            <Pressable
              onPress={onOpenReviewPlan}
              style={[
                styles.reassignButton,
                styles.planPillSpacing,
                styles.planPillReviewCTA,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Review ${pendingMoveCount} pending ${pendingMoveCount === 1 ? "change" : "changes"}`}
              testID="chip-bar-review-plan-cta"
            >
              <MaterialIcons
                name="edit-calendar"
                size={18}
                color="#FFFFFF"
              />
              <Text
                style={[
                  styles.reassignButtonLabel,
                  styles.planPillLabelActive,
                ]}
              >
                {`${pendingMoveCount} · Review`}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => onTogglePlanMode(!planModeActive)}
              style={[
                styles.reassignButton,
                styles.planPillSpacing,
                planModeActive && styles.planPillActive,
              ]}
              accessibilityRole="switch"
              accessibilityState={{ checked: planModeActive }}
              accessibilityLabel="Plan mode"
              testID="chip-bar-plan-toggle"
            >
              <MaterialIcons
                name={planModeActive ? "edit-calendar" : "playlist-add"}
                size={18}
                color={planModeActive ? "#FFFFFF" : "#3B82F6"}
              />
              <Text
                style={[
                  styles.reassignButtonLabel,
                  planModeActive && styles.planPillLabelActive,
                ]}
              >
                {planModeActive ? "Planning" : "Plan"}
              </Text>
            </Pressable>
          )
        ) : null}

        <Pressable
          style={styles.reassignButton}
          onPress={onReassign}
          accessibilityRole="button"
          accessibilityLabel="Reassign to different technician"
        >
          <MaterialIcons name="person-add-alt-1" size={18} color="#3B82F6" />
          <Text style={styles.reassignButtonLabel}>Tech</Text>
        </Pressable>

        <Pressable
          style={styles.dismissButton}
          onPress={handleDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <MaterialIcons name="close" size={20} color="#6B7280" />
        </Pressable>
      </View>

      {/* Phase 7a (2026-05-22) — the bottom-bar Commit/Discard
          footer is gone. Every drag commits via its mini-sheet
          now. The hint copy was simplified from "plan a swap"
          to "reschedule" because swap-mode is now one of two
          equal-class drop treatments (SWAP and INSERT).
          B2-1 follow-up (2026-05-22) — the hint copy switches
          when plan mode is on so the user knows the gesture
          target moved. The Plan pill itself lives inside the
          bar's action row now (see comment above), not here. */}
      <Text style={styles.hint}>
        {planModeActive
          ? "Plan mode — stage moves, then review & commit"
          : "Tap a dot for details — hold and drag to reschedule"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 16,
    left: 16,
    right: 16,
    overflow: "visible",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 56,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
    overflow: "visible",
  },
  listWrapper: {
    flex: 1,
    overflow: "visible",
  },
  // r16.10 — anchor view inside listWrapper. The tooltip overlay
  // is its sibling (not the FlatList's child), so it lives OUTSIDE
  // the DFL ScrollView clip region. The View has overflow:visible
  // so the bubble bleeding above the listWrapper bounds is allowed.
  listAnchor: {
    flex: 1,
    position: "relative",
    overflow: "visible",
  },
  // r17.b (2026-05-21) — single snap-zone highlight ring overlay.
  // top: '50%' + marginTop: -OVERLAY_DIAMETER/2 vertically centers
  // the ring on the chip row. translateX drives horizontal position
  // (left: 0 here is the resting origin the transform offsets from).
  snapOverlay: {
    position: "absolute",
    top: "50%",
    left: 0,
    marginTop: -OVERLAY_DIAMETER / 2,
    width: OVERLAY_DIAMETER,
    height: OVERLAY_DIAMETER,
    borderRadius: OVERLAY_DIAMETER / 2,
    borderWidth: 3,
    borderColor: "#F59E0B",
    backgroundColor: "transparent",
    shadowColor: "#F59E0B",
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    zIndex: 5,
  },
  chipWrapper: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  // r16.12 — tooltip Pressable is itself the absolute-positioned
  // element. left + bottom are overridden inline per measurement
  // (computed in tooltipOverlayPos). Fixed width so the bubble's
  // own midpoint is deterministic for tail centering.
  tooltip: {
    position: "absolute",
    width: TOOLTIP_BUBBLE_WIDTH,
    backgroundColor: "#1F2937",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    zIndex: 1000,
    elevation: 12,
  },
  tooltipName: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  tooltipTime: {
    color: "#D1D5DB",
    fontSize: 11,
    marginTop: 2,
  },
  // r16.14 — tail is hardcoded to pixel-center of the bubble instead
  // of `left: "50%"`. Percentage values on absolutely-positioned
  // children inside a Pressable resolve against a containing block
  // that doesn't always match the Pressable's visible bounds (RN
  // wraps Pressables in a host View on some platforms / RN versions,
  // and the percentage can compute against that wrapper instead of
  // the styled box). Since TOOLTIP_BUBBLE_WIDTH is a fixed constant,
  // we compute the tail's left edge directly:
  //   - triangle visual is 10px wide (borderLeftWidth + borderRightWidth)
  //   - to center the 10px triangle on the 148px bubble: left = 74 - 5 = 69
  tooltipTail: {
    position: "absolute",
    bottom: -5,
    left: TOOLTIP_BUBBLE_WIDTH / 2 - 5,
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#1F2937",
  },
  chip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.6)",
    // 2026-05-21 evening: bumped from 3 → 6 (6px gap → 12px gap) so the
    // chips look like distinct droppable targets rather than a packed bar.
    // 2026-05-22 follow-up: bumped from 6 → 9 (18px gap between chips) to
    // give the INSERT zone more fingertip real estate. With SWAP zone now
    // back to ±9px (see SWAP_ZONE_HALF_WIDTH_PX above) the INSERT gap is
    // cellSize − 2*SWAP_ZONE_HALF_WIDTH_PX = 54 − 18 = 36px wide, vs. the
    // 22px gap before this change. Users can now reliably drop between
    // two chips without the snap grabbing SWAP at fingertip resolution.
    // CHIP_CELL_FALLBACK mirrors this: cellSize = 36 + 9*2 = 54px.
    marginHorizontal: 9,
  },
  chipSelected: {
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  chipActive: {
    opacity: 0.85,
  },
  chipPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  chipDisabled: {
    opacity: 0.55,
  },
  chipText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  chipTextSelected: {
    fontSize: 15,
  },
  reassignButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
  },
  reassignButtonLabel: {
    color: "#3B82F6",
    fontSize: 13,
    fontWeight: "600",
  },
  dismissButton: {
    marginLeft: 6,
    padding: 4,
  },
  hint: {
    textAlign: "center",
    marginTop: 6,
    fontSize: 11,
    color: "#9CA3AF",
  },
  // B2-1 follow-up (2026-05-22) — the Plan pill mirrors the Tech
  // pill exactly via shared `reassignButton`/`reassignButtonLabel`
  // styles. `planPillSpacing` only adjusts the marginLeft (the
  // Tech pill's `marginLeft: 8` separates it from the chip list;
  // the Plan pill needs the same separation from the chip list
  // OR from whatever sits to its left, so it inherits `marginLeft`
  // from `reassignButton` and we override here only if we need a
  // different gap to Tech).
  planPillSpacing: {
    // No-op today; placeholder for future spacing tweaks if Plan
    // and Tech need a different gap than chip→Tech. Keeps the
    // style array slot stable.
  },
  planPillActive: {
    backgroundColor: "#3B82F6",
  },
  planPillLabelActive: {
    color: "#FFFFFF",
  },
  // B2-4 (2026-05-22) — green so the morphed CTA reads as the
  // primary commit-path action and visually contrasts with the
  // blue "Planning" toggle state it just replaced. Matches the
  // primary-button green used elsewhere in the chip-bar surface
  // (sheet Save buttons, status-color FINALIZED, etc.).
  planPillReviewCTA: {
    backgroundColor: "#22C55E",
  },
  // Phase 7a (2026-05-22) removed `buttonDisabled`, `footer`,
  // `footerSavingText`, `discardButton`, `discardButtonText`,
  // `commitButton`, `commitButtonText` — see plan §7a for the
  // unwind context.
});
