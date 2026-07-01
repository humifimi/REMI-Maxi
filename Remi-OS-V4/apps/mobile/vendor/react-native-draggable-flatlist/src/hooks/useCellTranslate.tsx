import Animated, { useDerivedValue, withSpring } from "react-native-reanimated";
import { useAnimatedValues } from "../context/animatedValueContext";
import { useDraggableFlatListContext } from "../context/draggableFlatListContext";
import { useRefs } from "../context/refContext";

type Params = {
  cellIndex: number;
  cellSize: Animated.SharedValue<number>;
  cellOffset: Animated.SharedValue<number>;
};

export function useCellTranslate({ cellIndex, cellSize, cellOffset }: Params) {
  const {
    activeIndexAnim,
    activeCellSize,
    hoverOffset,
    spacerIndexAnim,
    placeholderOffset,
    hoverAnim,
    viewableIndexMin,
    viewableIndexMax,
    // FORK Phase 1 (REMI snap-zone fork) — see README-FORK.md.
    // PLAN-DEVIATION: 2026-05-21-dfl-fork-for-snap-zones — see docs/PLAN-DEVIATIONS.md.
    disableSpacerTracking,
    // FORK Phase 2 (REMI split-shift fork) — see README-FORK.md "Phase 2".
    splitShiftLeftCellIdx,
    splitShiftRightCellIdx,
    // FORK Phase 3 (REMI off-end shift-all fork) — see README-FORK.md "Phase 3".
    // PLAN-DEVIATION: 2026-05-22-dfl-fork-shift-all-off-end — see docs/PLAN-DEVIATIONS.md.
    shiftAllBeforeIdx,
    shiftAllAfterIdx,
  } = useAnimatedValues();

  const { activeKey } = useDraggableFlatListContext();

  const { animationConfigRef } = useRefs();

  const translate = useDerivedValue(() => {
    const isActiveCell = cellIndex === activeIndexAnim.value;
    const isOutsideViewableRange =
      !isActiveCell &&
      (cellIndex < viewableIndexMin.value ||
        cellIndex > viewableIndexMax.value);
    if (!activeKey || activeIndexAnim.value < 0 || isOutsideViewableRange) {
      return 0;
    }

    // Determining spacer index is hard to visualize. See diagram: https://i.imgur.com/jRPf5t3.jpg
    const isBeforeActive = cellIndex < activeIndexAnim.value;
    const isAfterActive = cellIndex > activeIndexAnim.value;

    const hoverPlusActiveSize = hoverOffset.value + activeCellSize.value;
    const offsetPlusHalfSize = cellOffset.value + cellSize.value / 2;
    const offsetPlusSize = cellOffset.value + cellSize.value;
    let result = -1;

    if (isAfterActive) {
      if (
        hoverPlusActiveSize >= cellOffset.value &&
        hoverPlusActiveSize < offsetPlusHalfSize
      ) {
        // bottom edge of active cell overlaps top half of current cell
        result = cellIndex - 1;
      } else if (
        hoverPlusActiveSize >= offsetPlusHalfSize &&
        hoverPlusActiveSize < offsetPlusSize
      ) {
        // bottom edge of active cell overlaps bottom half of current cell
        result = cellIndex;
      }
    } else if (isBeforeActive) {
      if (
        hoverOffset.value < offsetPlusSize &&
        hoverOffset.value >= offsetPlusHalfSize
      ) {
        // top edge of active cell overlaps bottom half of current cell
        result = cellIndex + 1;
      } else if (
        hoverOffset.value >= cellOffset.value &&
        hoverOffset.value < offsetPlusHalfSize
      ) {
        // top edge of active cell overlaps top half of current cell
        result = cellIndex;
      }
    }

    // FORK Phase 1 (REMI snap-zone fork) — see vendor/react-native-draggable-flatlist/README-FORK.md.
    // PLAN-DEVIATION: 2026-05-21-dfl-fork-for-snap-zones — see docs/PLAN-DEVIATIONS.md.
    //
    // Gate the per-cell "I'm now the spacer, shift to make room" write on
    // disableSpacerTracking. When the consumer (the snap-zone-aware chip bar)
    // flips this true, we ALSO actively reset spacerIndexAnim back to the
    // active cell's index — this is required for the freeze to be visible.
    //
    // Why the reset is required (the bug we shipped in the initial Phase 1c
    // and fixed here on 2026-05-21 evening): DFL's per-cell worklet starts
    // shifting neighbor cells the moment the dragged chip's edge crosses
    // their half-line (hoverOffset ≥ neighborCellOffset + cellSize/2). Our
    // swap-zone detection in the consumer doesn't fire until the dragged
    // chip's CENTER reaches the neighbor's center — by which time the
    // neighbor has been animating away for ~10-12px of drag. If the gate
    // only stopped FUTURE writes (the originally-shipped behavior), the
    // already-shifted cells stayed in their shifted positions and the amber
    // swap-target ring (positioned at the cached pre-drag chip center) landed
    // in empty space. Resetting spacerIndexAnim to activeIndexAnim forces
    // shouldTranslate to evaluate FALSE for every non-active cell on the
    // next frame, so each one's withSpring animates back to translationAmt=0
    // (its original position). The chip bar's ring then lands cleanly on
    // the (now stationary) target chip and the user sees a visible freeze.
    //
    // When the gate releases, normal DFL behavior resumes immediately — the
    // result computation below re-evaluates against the current hoverOffset
    // and spacerIndexAnim takes whatever value the dragged chip's current
    // position dictates.
    if (disableSpacerTracking.value) {
      if (spacerIndexAnim.value !== activeIndexAnim.value) {
        spacerIndexAnim.value = activeIndexAnim.value;
      }
    } else if (result !== -1 && result !== spacerIndexAnim.value) {
      spacerIndexAnim.value = result;
    }

    if (spacerIndexAnim.value === cellIndex) {
      const newPlaceholderOffset = isAfterActive
        ? cellSize.value + (cellOffset.value - activeCellSize.value)
        : cellOffset.value;
      placeholderOffset.value = newPlaceholderOffset;
    }

    // Active cell follows touch
    if (isActiveCell) {
      return hoverAnim.value;
    }

    // FORK Phase 3 (REMI off-end shift-all fork) — see README-FORK.md "Phase 3".
    // PLAN-DEVIATION: 2026-05-22-dfl-fork-shift-all-off-end — see docs/PLAN-DEVIATIONS.md.
    //
    // When the consumer wants a "chip-wide empty slot at the front (or back)"
    // visual for an off-end insert, it sets shiftAllBeforeIdx (front) or
    // shiftAllAfterIdx (back) to the active cell's index. Every non-active
    // cell whose `cellIndex` is on the corresponding side of that pivot
    // translates by exactly ±cellSize (a full cell-width). Visually, the
    // dragged chip (rendered at hoverAnim) appears to hover over a freshly
    // opened empty slot at the bookend.
    //
    // Precedence: this override runs BEFORE the Phase 2 split-shift checks
    // so an off-end frame produces a clean shift-all visual even if the
    // consumer's worklet failed to clear the split-shift indices for some
    // reason — the off-end visual owns the bar. The active cell is excluded
    // by the early return on isActiveCell above, so a worklet that
    // accidentally points either index at activeIdx is silently no-op for
    // the dragged chip itself.
    //
    // These two are mutually exclusive in normal use (an off-end drop is
    // either front or back, not both), but a frame where both are set
    // would translate every non-active cell — interior cells become
    // ambiguous (they're both before activeIdx AND after activeIdx if the
    // two pivots straddle them). Consumers SHOULD treat the values as a
    // single discriminated union: set one, clear the other.
    if (shiftAllBeforeIdx.value >= 0 && cellIndex < shiftAllBeforeIdx.value) {
      return withSpring(cellSize.value, animationConfigRef.value);
    }
    if (shiftAllAfterIdx.value >= 0 && cellIndex > shiftAllAfterIdx.value) {
      return withSpring(-cellSize.value, animationConfigRef.value);
    }

    // FORK Phase 2 (REMI split-shift fork) — see README-FORK.md "Phase 2".
    // PLAN-DEVIATION: 2026-05-21-dfl-fork-for-snap-zones — see docs/PLAN-DEVIATIONS.md.
    //
    // When the consumer sets splitShiftLeftCellIdx or splitShiftRightCellIdx
    // to this cell's index, override the translation to exactly ±cellSize/2.
    // This implements the "two chips part to make room" visual for an insert
    // drop. Designed to be used with disableSpacerTracking=true so the
    // non-overridden cells stay frozen at translation 0 (their original
    // positions) while the two adjacent cells animate apart.
    //
    // Precedence: split-shift OVERRIDES the spacer-based translation below,
    // so even if Phase 1 had been written by an earlier frame, the override
    // wins. The branches return immediately to keep the code path readable
    // — there is no scenario where a cell should be BOTH a split-shift
    // target AND a Phase-1 freeze target (the worklet sets these
    // mutually-exclusively per cellIndex). The active cell is excluded
    // above (early return on isActiveCell), so a worklet that accidentally
    // sets splitShiftLeftCellIdx = activeIdx is silently no-op.
    if (cellIndex === splitShiftLeftCellIdx.value) {
      return withSpring(-cellSize.value / 2, animationConfigRef.value);
    }
    if (cellIndex === splitShiftRightCellIdx.value) {
      return withSpring(cellSize.value / 2, animationConfigRef.value);
    }

    // Translate cell down if it is before active index and active cell has passed it.
    // Translate cell up if it is after the active index and active cell has passed it.

    const shouldTranslate = isAfterActive
      ? cellIndex <= spacerIndexAnim.value
      : cellIndex >= spacerIndexAnim.value;

    const translationAmt = shouldTranslate
      ? activeCellSize.value * (isAfterActive ? -1 : 1)
      : 0;

    return withSpring(translationAmt, animationConfigRef.value);
  }, [activeKey, cellIndex]);

  return translate;
}
