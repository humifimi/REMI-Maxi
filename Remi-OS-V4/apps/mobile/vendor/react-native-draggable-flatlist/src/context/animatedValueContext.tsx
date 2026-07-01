import React, { useMemo, useEffect, useCallback, useContext } from "react";
import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { State as GestureState } from "react-native-gesture-handler";
import { useProps } from "./propsContext";

const AnimatedValueContext = React.createContext<
  ReturnType<typeof useSetupAnimatedValues> | undefined
>(undefined);

export default function AnimatedValueProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const value = useSetupAnimatedValues();
  return (
    <AnimatedValueContext.Provider value={value}>
      {children}
    </AnimatedValueContext.Provider>
  );
}

export function useAnimatedValues() {
  const value = useContext(AnimatedValueContext);
  if (!value) {
    throw new Error(
      "useAnimatedValues must be called from within AnimatedValueProvider!"
    );
  }
  return value;
}

function useSetupAnimatedValues<T>() {
  const props = useProps<T>();

  const DEFAULT_VAL = useSharedValue(0);

  const containerSize = useSharedValue(0);
  const scrollViewSize = useSharedValue(0);

  const panGestureState = useSharedValue<GestureState>(
    GestureState.UNDETERMINED
  );
  const touchTranslate = useSharedValue(0);

  const isTouchActiveNative = useSharedValue(false);

  const hasMoved = useSharedValue(0);
  const disabled = useSharedValue(false);

  const horizontalAnim = useSharedValue(!!props.horizontal);

  const activeIndexAnim = useSharedValue(-1); // Index of hovering cell
  const spacerIndexAnim = useSharedValue(-1); // Index of hovered-over cell

  // FORK Phase 1 (REMI snap-zone fork) — see vendor/react-native-draggable-flatlist/README-FORK.md.
  // PLAN-DEVIATION: 2026-05-21-dfl-fork-for-snap-zones — see docs/PLAN-DEVIATIONS.md.
  //
  // Gate the cells' autonomous "shift to make room" behavior. When a consumer
  // sets this true (via onAnimValInit + a JS-side or worklet-side write), the
  // gated spacerIndexAnim write in useCellTranslate is skipped AND, on the
  // moment of assertion, spacerIndexAnim is actively reset to activeIndexAnim
  // so any in-flight shifts spring back to origin. With no new writes, every
  // cell's shouldTranslate evaluates against the reset spacer (translation 0
  // for non-active cells), and the list visually "freezes" while the user
  // keeps dragging.
  //
  // Use case: a horizontal chip bar that wants to distinguish a "swap with this
  // chip" gesture (don't shift others — show a highlight ring instead) from
  // DFL's native "insert between two chips" gesture (shift to open a gap). The
  // consumer's worklet decides which zone the dragged center is in and toggles
  // this flag accordingly. Default false = legacy behavior, untouched.
  const disableSpacerTracking = useSharedValue(false);

  // FORK Phase 2 (REMI split-shift fork) — see README-FORK.md "Phase 2".
  // PLAN-DEVIATION: 2026-05-21-dfl-fork-for-snap-zones — same entry as Phase 1.
  //
  // When set to a non-negative cell index by the consumer's worklet, the
  // matching cell translates by exactly −cellSize/2 (LEFT) or +cellSize/2
  // (RIGHT), overriding DFL's spacer-based translation entirely. This is
  // the "split-shift" visual: two chips part by half a cellSize each to
  // open a single-cell gap centered on the user's intended drop point.
  // Default −1 = inactive (no override; DFL's normal logic — or Phase 1's
  // freeze when disableSpacerTracking is on — runs).
  //
  // These are intended to be used WITH disableSpacerTracking=true so the
  // non-overridden cells stay frozen instead of fighting DFL's default
  // mid-drag shifting. They're independent shared values (rather than a
  // combined "gap descriptor") because bookend cases naturally express as
  // "one side −1, other side a valid index" — e.g., insert before slot 0:
  // splitShiftLeftCellIdx=-1, splitShiftRightCellIdx=0 → only chip 0 moves
  // RIGHT, no left-side chip exists.
  const splitShiftLeftCellIdx = useSharedValue(-1);
  const splitShiftRightCellIdx = useSharedValue(-1);

  // FORK Phase 3 (REMI off-end shift-all fork) — see README-FORK.md "Phase 3".
  // PLAN-DEVIATION: 2026-05-22-dfl-fork-shift-all-off-end — see docs/PLAN-DEVIATIONS.md.
  //
  // When set to a non-negative cell index by the consumer's worklet, EVERY
  // non-active cell on the corresponding side of that index translates by
  // exactly ±cellSize (a full cell-width, not half):
  //
  //   - `shiftAllBeforeIdx >= 0` → cells with `cellIndex < shiftAllBeforeIdx`
  //     translate +cellSize (slide RIGHT). Used for the front-insert
  //     dramatic visual: cells 0..(activeIdx-1) all slide right by one
  //     cell, leaving a chip-wide empty slot at the front for the dragged
  //     chip.
  //   - `shiftAllAfterIdx >= 0` → cells with `cellIndex > shiftAllAfterIdx`
  //     translate −cellSize (slide LEFT). Symmetric back-insert dramatic
  //     visual.
  //
  // Default −1 = inactive (no override; Phase 2 split-shift or Phase 1
  // freeze logic runs as before). Precedence: Phase 3 override > Phase 2
  // override > Phase 1 freeze > DFL default.
  //
  // Why this is separate from Phase 2's split-shift (instead of e.g.
  // letting a single shared value drive both visuals): split-shift opens a
  // ONE-CELL gap by moving two chips ±cellSize/2 each (one cell of
  // displacement total). Shift-all opens a one-cell gap by moving N
  // chips ±cellSize each (N cells of displacement, but visually the
  // same one-cell gap appears). The two visuals occupy different value
  // ranges per-cell, so a single mechanism would have to be told both
  // "which cell" and "how much" — at which point you have two parameters
  // anyway. Independent shared values + a "the latest one wins" precedence
  // in useCellTranslate is the simplest correct shape.
  //
  // Bookend insert classification — see `chip-bar-snap-zone.ts`'s
  // `dramaticShift` directive (Phase 7c, 2026-05-22) for the consumer
  // semantics: only off-end drops set these values; interior inserts
  // continue to use Phase 2's split-shift.
  const shiftAllBeforeIdx = useSharedValue(-1);
  const shiftAllAfterIdx = useSharedValue(-1);

  const activeCellSize = useSharedValue(0); // Height or width of acctive cell
  const activeCellOffset = useSharedValue(0); // Distance between active cell and edge of container

  const scrollOffset = useSharedValue(0);
  const scrollInit = useSharedValue(0);

  const viewableIndexMin = useSharedValue(0);
  const viewableIndexMax = useSharedValue(0);

  // If list is nested there may be an outer scrollview
  const outerScrollOffset = props.outerScrollOffset || DEFAULT_VAL;
  const outerScrollInit = useSharedValue(0);

  useAnimatedReaction(
    () => {
      return activeIndexAnim.value;
    },
    (cur, prev) => {
      if (cur !== prev && cur >= 0) {
        scrollInit.value = scrollOffset.value;
        outerScrollInit.value = outerScrollOffset.value;
      }
    },
    [outerScrollOffset]
  );

  const placeholderOffset = useSharedValue(0);

  const isDraggingCell = useDerivedValue(() => {
    return isTouchActiveNative.value && activeIndexAnim.value >= 0;
  }, []);

  const autoScrollDistance = useDerivedValue(() => {
    if (!isDraggingCell.value) return 0;
    const innerScrollDiff = scrollOffset.value - scrollInit.value;
    // If list is nested there may be an outer scroll diff
    const outerScrollDiff = outerScrollOffset.value - outerScrollInit.value;
    const scrollDiff = innerScrollDiff + outerScrollDiff;
    return scrollDiff;
  }, []);

  const touchPositionDiff = useDerivedValue(() => {
    const extraTranslate = isTouchActiveNative.value
      ? autoScrollDistance.value
      : 0;
    return touchTranslate.value + extraTranslate;
  }, []);

  const touchPositionDiffConstrained = useDerivedValue(() => {
    const containerMinusActiveCell =
      containerSize.value - activeCellSize.value + scrollOffset.value;

    const offsetRelativeToScrollTop =
      touchPositionDiff.value + activeCellOffset.value;
    const constrained = Math.min(
      containerMinusActiveCell,
      Math.max(scrollOffset.value, offsetRelativeToScrollTop)
    );

    // FORK Phase 2 (REMI split-shift fork) — extend the drag range by
    // half a cell-width on each end so the dragged cell's CENTER can
    // reach positions "before slot 0" and "after slot N-1". Without
    // this, hoverOffset is clamped so the dragged cell's left edge
    // can't go below 0 (= slot 0's left edge); that puts the dragged
    // center at minimum cellSize/2 from the container's left, which
    // coincides with slot 0's center → "insert before first" is
    // unreachable as a distinct zone from "swap with slot 0". The
    // same applies symmetrically on the right. Extending by exactly
    // cellSize/2 makes the bookend insert zones the same effective
    // width as interior insert zones. Consumers who don't drive a
    // bookend-aware worklet won't notice the extension; the dragged
    // cell would just clamp to the same effective range as before.
    //
    // Visual side-effect: with the extension active, the dragged cell
    // can render up to cellSize/2 past the original chip-strip bounds
    // on each side. For the chip-bar consumer this lands inside the
    // surrounding bar's padding on the left and against the Tech /
    // dismiss buttons on the right; layouts that hug the strip tight
    // may want to add their own padding to absorb the overflow.
    const halfCellSize = activeCellSize.value / 2;
    const maxTranslateNegative = -activeCellOffset.value - halfCellSize;
    const maxTranslatePositive =
      scrollViewSize.value -
      (activeCellOffset.value + activeCellSize.value) +
      halfCellSize;

    // Only constrain the touch position while the finger is on the screen. This allows the active cell
    // to snap above/below the fold once let go, if the drag ends at the top/bottom of the screen.
    const constrainedBase = isTouchActiveNative.value
      ? constrained - activeCellOffset.value
      : touchPositionDiff.value;

    // Make sure item is constrained to the boundaries of the scrollview
    return Math.min(
      Math.max(constrainedBase, maxTranslateNegative),
      maxTranslatePositive
    );
  }, []);

  const dragItemOverflow = props.dragItemOverflow;
  const hoverAnim = useDerivedValue(() => {
    if (activeIndexAnim.value < 0) return 0;
    return dragItemOverflow
      ? touchPositionDiff.value
      : touchPositionDiffConstrained.value;
  }, []);

  const hoverOffset = useDerivedValue(() => {
    return hoverAnim.value + activeCellOffset.value;
  }, [hoverAnim, activeCellOffset]);

  useDerivedValue(() => {
    // Reset spacer index when we stop hovering
    const isHovering = activeIndexAnim.value >= 0;
    if (!isHovering && spacerIndexAnim.value >= 0) {
      spacerIndexAnim.value = -1;
    }
  }, []);

  // Note: this could use a refactor as it combines touch state + cell animation
  const resetTouchedCell = useCallback(() => {
    activeCellOffset.value = 0;
    hasMoved.value = 0;
  }, []);

  const value = useMemo(
    () => ({
      activeCellOffset,
      activeCellSize,
      activeIndexAnim,
      containerSize,
      // FORK Phase 1 — see disableSpacerTracking declaration above.
      disableSpacerTracking,
      // FORK Phase 2 — see splitShiftLeft/RightCellIdx declarations above.
      splitShiftLeftCellIdx,
      splitShiftRightCellIdx,
      // FORK Phase 3 — see shiftAllBefore/AfterIdx declarations above.
      shiftAllBeforeIdx,
      shiftAllAfterIdx,
      disabled,
      horizontalAnim,
      hoverAnim,
      hoverOffset,
      isDraggingCell,
      isTouchActiveNative,
      panGestureState,
      placeholderOffset,
      resetTouchedCell,
      scrollOffset,
      scrollViewSize,
      spacerIndexAnim,
      touchPositionDiff,
      touchTranslate,
      autoScrollDistance,
      viewableIndexMin,
      viewableIndexMax,
    }),
    [
      activeCellOffset,
      activeCellSize,
      activeIndexAnim,
      containerSize,
      disableSpacerTracking,
      splitShiftLeftCellIdx,
      splitShiftRightCellIdx,
      shiftAllBeforeIdx,
      shiftAllAfterIdx,
      disabled,
      horizontalAnim,
      hoverAnim,
      hoverOffset,
      isDraggingCell,
      isTouchActiveNative,
      panGestureState,
      placeholderOffset,
      resetTouchedCell,
      scrollOffset,
      scrollViewSize,
      spacerIndexAnim,
      touchPositionDiff,
      touchTranslate,
      autoScrollDistance,
      viewableIndexMin,
      viewableIndexMax,
    ]
  );

  useEffect(() => {
    props.onAnimValInit?.(value);
  }, [value]);

  return value;
}
