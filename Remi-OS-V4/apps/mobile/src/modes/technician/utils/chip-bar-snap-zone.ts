/**
 * `chip-bar-snap-zone` (Phase 7b, 2026-05-22) — pure classifier
 * that decides what a chip-bar drag frame means, given the dragged
 * chip's position relative to its peers.
 *
 * Extracted from the `useDerivedValue` worklet in
 * `route-reorder-chip-bar.tsx` so the geometry — especially the
 * off-end (drag-to-front / drag-to-back) cases that Phase 7b is
 * about — can be unit-tested without standing up reanimated,
 * DFL's shared values, or the GestureHandlerRootView.
 *
 * Coordinate model:
 *
 *   - DFL's `hoverOffset` is the dragged chip's TOP-LEFT x in the
 *     DFL container's local coordinate space — absolute, not a
 *     delta from the chip's origin.
 *   - `slotApprox = hoverOffset / cellSize` is therefore the
 *     dragged chip's current absolute slot index (fractional). A
 *     `slotApprox === activeIdx` means the chip is back at its
 *     pre-drag origin; `slotApprox < 0` means the chip's top-left
 *     is dragged past the bar's left edge; `slotApprox > N - 1`
 *     means it's dragged past the visual last chip.
 *   - `cellSize` is DFL's per-cell width (chip + horizontal
 *     margin). The chip bar caches a fallback (`CHIP_CELL_FALLBACK`
 *     = 54) for the first frame of a drag when DFL hasn't measured
 *     yet.
 *
 * Decision shape:
 *
 *   - `swap` — dragged chip's center is within `swapZoneHalfWidthPx`
 *     of another chip's center → that chip is the target. Caller
 *     opens the dual-picker mini-sheet in swap mode.
 *   - `insert` — dragged chip is over a between-slots gap, or far
 *     enough past the first/last chip to clamp into the front or
 *     back gap. `landingSlot` is the 0-indexed splice-after-removal
 *     position the chip will land at (range `[0, N - 1]`).
 *     `leftCellIdx` / `rightCellIdx` are the two cells the chip
 *     bar's split-shift renders should push apart by half a
 *     cellSize each to visualize an interior gap. Either may be
 *     `-1` when the half-cell split-shift isn't appropriate — in
 *     practice they're both `-1` whenever `dramaticShift !==
 *     "none"` (the off-end visual owns the whole bar in that
 *     case; see below) and one of them is `-1` for cells adjacent
 *     to the active cell where the other side has no chip to push.
 *   - `dramaticShift: "front" | "back" | "none"` — set when the
 *     drop genuinely lands at the very front (slot 0) or very
 *     back (slot N-1) AND the drag is far enough past the bar's
 *     bookend that the half-cell split-shift can't visualize the
 *     intent. Consumer is expected to wire it to the DFL fork's
 *     `shiftAllBeforeIdx` / `shiftAllAfterIdx` shared values
 *     (FORK Phase 3) so EVERY chip on the dragged origin's near
 *     side slides a full cellSize, opening a chip-wide empty slot
 *     at the front/back. See "Off-end dramatic-shift visual"
 *     below.
 *   - `noop` — drag is at origin or in a zone that wouldn't change
 *     the order. Caller leaves the chip bar alone.
 *
 * Off-end behavior (Phase 7b — the reason this helper exists):
 *
 *   - Drag a middle chip past the FIRST chip: `slotApprox` goes
 *     negative, `nearestSlot` becomes negative, the SWAP zone
 *     fails the `>= 0` bound, and the INSERT branch clamps
 *     `gapPosition` to 0 → `landingSlot = 0`. That maps 1:1 onto
 *     `computeInsertWindow(pendingOrder, draggedStopId, 0)`, which
 *     returns `window.startHHMM = DISPATCH_DAY_START_HHMM` because
 *     there's no left neighbor.
 *   - Drag a middle chip past the LAST chip: symmetric —
 *     `slotApprox > N - 0.5`, `gapPosition` clamps to `N`,
 *     `landingSlot = N - 1`. `computeInsertWindow` returns
 *     `window.endHHMM = DISPATCH_DAY_END_HHMM`.
 *   - Drag the LAST chip to the FRONT (or FIRST chip to the BACK):
 *     same math, just with the active chip's own index appearing
 *     on the "far side" of `gapPosition`. The `landingSlot !==
 *     activeIdx` check correctly fires and the insert proceeds.
 *   - Drag a chip past its own edge with no other chip on that
 *     side (i.e., dragging chip 0 further left, or chip N-1
 *     further right): `landingSlot` collapses onto `activeIdx`
 *     after clamping → `noop`. The user can't move a chip to a
 *     position different from its current one in that direction.
 *
 * Off-end dramatic-shift visual (Phase 7c, 2026-05-22):
 *
 *   The Phase 7b math was correct but the visual was anemic. With
 *   the half-cell split-shift mechanism, dropping at the very
 *   front opened a `cellSize/2` gap by nudging only chip 0 right
 *   half a cell — leaving the dragged chip visually atop chip 0,
 *   indistinguishable from a SWAP-with-chip-0 from the user's
 *   perspective. Phase 7c does two things to fix it:
 *
 *   1. SWAP zone CARVE-OUT at the bookends. SWAP-with-chip-0
 *      only fires when `slotApprox >= 0` (i.e., the dragged
 *      chip's left edge has NOT crossed the bar's left edge).
 *      SWAP-with-chip-(N-1) only fires when `slotApprox <= N-1`.
 *      The off-end side is reserved for the front/back-insert
 *      classification — a generous trigger zone that doesn't
 *      require pixel precision.
 *
 *   2. `dramaticShift` FLAG. When the INSERT lands at slot 0 with
 *      `slotApprox <= 0`, decision.dramaticShift = "front" and
 *      `leftCellIdx` / `rightCellIdx` are forced to `-1`. The
 *      consumer (chip bar) sees the flag, sets `shiftAllBeforeIdx
 *      = activeIdx` on the DFL fork, and clears the split-shift
 *      indices. Every chip with `cellIndex < activeIdx` slides
 *      right by one cellSize → a chip-wide empty slot opens at
 *      position 0, with the dragged chip clearly hovering over it.
 *      Symmetric for `dramaticShift = "back"` (landing slot N-1,
 *      `slotApprox >= N-1`): `shiftAllAfterIdx = activeIdx`, every
 *      chip with `cellIndex > activeIdx` slides left.
 *
 *   The carve-out doesn't change interior behavior at all — every
 *   slot from 1 through N-2 retains a symmetric SWAP zone. The
 *   asymmetry only kicks in at the bookends, where there's no
 *   physical room for a symmetric off-end zone anyway.
 *
 * Marked `'worklet'` so the chip bar's `useDerivedValue` can call
 * it on the UI thread without an additional bridge hop. Reanimated
 * inlines the function body into the worklet at compile time. The
 * pure-JS shape is also what the unit tests exercise on the JS
 * thread.
 */

import { CHIP_CELL_FALLBACK, SWAP_ZONE_HALF_WIDTH_PX } from "./chip-bar-snap-zone-constants";

export type SnapZoneDecision =
  | { kind: "noop" }
  | { kind: "swap"; targetIdx: number }
  | {
      kind: "insert";
      landingSlot: number;
      leftCellIdx: number;
      rightCellIdx: number;
      /**
       * Phase 7c off-end dramatic-shift directive (2026-05-22).
       *
       * - `"none"` — interior INSERT. The half-cell split-shift
       *   indices (`leftCellIdx` / `rightCellIdx`) are the
       *   visual hint. Consumer leaves DFL fork's
       *   `shiftAllBeforeIdx` / `shiftAllAfterIdx` at -1.
       * - `"front"` — landing at slot 0 with the drag past the
       *   bar's left edge. Consumer should set
       *   `shiftAllBeforeIdx = activeIdx` and clear the
       *   half-cell indices. Every chip at `cellIndex <
       *   activeIdx` translates +cellSize → empty slot opens at
       *   the front.
       * - `"back"` — landing at slot N-1 with the drag past the
       *   bar's right edge. Consumer should set
       *   `shiftAllAfterIdx = activeIdx` and clear the
       *   half-cell indices. Every chip at `cellIndex >
       *   activeIdx` translates -cellSize → empty slot opens at
       *   the back.
       *
       * When `dramaticShift !== "none"`, `leftCellIdx` and
       * `rightCellIdx` are both -1 (the off-end visual owns the
       * whole bar; the half-cell split-shift would fight it).
       */
      dramaticShift: "none" | "front" | "back";
    };

export interface ClassifySnapZoneParams {
  /**
   * Dragged chip's current top-left x in DFL container coords,
   * divided by cellSize. Read from DFL's `hoverOffset` shared
   * value. Negative means dragged past the bar's left edge;
   * `> N - 1` means dragged past the visual last chip.
   */
  slotApprox: number;
  /**
   * DFL's `activeCellSize` value, falling back to
   * `CHIP_CELL_FALLBACK` when DFL hasn't measured yet.
   */
  cellSize: number;
  /** DFL's `activeIndexAnim` value — the dragged chip's origin slot. */
  activeIdx: number;
  /** Total chips in the bar (including the dragged one). */
  N: number;
  /**
   * Optional override for the SWAP zone radius. Default matches
   * the chip bar's tuned 9px (~33% of a chip width — see the
   * comment block above `SWAP_ZONE_HALF_WIDTH_PX` in
   * `route-reorder-chip-bar.tsx` for the tuning history).
   */
  swapZoneHalfWidthPx?: number;
}

/**
 * Classify the current drag frame. See module header for the
 * coordinate model and decision shape.
 */
export function classifySnapZone(
  params: ClassifySnapZoneParams,
): SnapZoneDecision {
  "worklet";
  const {
    slotApprox,
    cellSize,
    activeIdx,
    N,
    swapZoneHalfWidthPx = SWAP_ZONE_HALF_WIDTH_PX,
  } = params;

  if (activeIdx < 0 || N <= 0) {
    return { kind: "noop" };
  }

  const effectiveCellSize = cellSize > 0 ? cellSize : CHIP_CELL_FALLBACK;
  const nearestSlot = Math.round(slotApprox);
  const distFromNearestSlotCenter = Math.abs(
    slotApprox * effectiveCellSize - nearestSlot * effectiveCellSize,
  );

  // SWAP zone: dragged center within ±swapZoneHalfWidthPx of another
  // chip's center. The `nearestSlot !== activeIdx` guard prevents
  // mistakenly "swapping with self" when the drag has barely moved.
  //
  // Phase 7c bookend carve-out (2026-05-22): at slot 0, suppress SWAP
  // when the drag is past the bar's left edge (`slotApprox < 0`); at
  // slot N-1, suppress SWAP when the drag is past the bar's right
  // edge (`slotApprox > N - 1`). Both reserve the off-end side for
  // front/back-insert classification with the dramatic-shift visual.
  // The interior side of each bookend slot keeps a normal SWAP zone
  // (slotApprox in [0, +swapZoneHalfWidthPx/cellSize] for slot 0;
  // [N-1 - swapZoneHalfWidthPx/cellSize, N-1] for slot N-1), so a
  // user who wants to swap-with-bookend can still drag onto it from
  // the interior. See module header "Off-end dramatic-shift visual".
  if (
    nearestSlot >= 0 &&
    nearestSlot < N &&
    nearestSlot !== activeIdx &&
    distFromNearestSlotCenter <= swapZoneHalfWidthPx &&
    !(nearestSlot === 0 && slotApprox < 0) &&
    !(nearestSlot === N - 1 && slotApprox > N - 1)
  ) {
    return { kind: "swap", targetIdx: nearestSlot };
  }

  // Outside SWAP zone (or in the no-op band around active's own
  // slot). Check if the drag has wandered into a between-slots
  // region — including off-end regions that clamp to gap 0 / gap N.
  if (nearestSlot === activeIdx) {
    // No-op band: chip is back near its own origin (or barely off
    // it but still in active's swap zone). Not a meaningful drag.
    return { kind: "noop" };
  }

  // INSERT classification. `gapPosition` is the 0-indexed boundary
  // between two slots that the dragged chip is hovering over. It
  // ranges over `[0, N]` — 0 = before slot 0, N = after slot N-1.
  const gapPositionRaw = Math.ceil(slotApprox);
  const gapPosition =
    gapPositionRaw < 0 ? 0 : gapPositionRaw > N ? N : gapPositionRaw;

  // Map the gap to a landing slot in "without the dragged chip"
  // coordinates. The dragged chip is removed before the splice;
  // the landing slot is the 0-indexed splice position, so the
  // valid range is `[0, N - 1]`.
  let landingSlotRaw: number;
  if (activeIdx === gapPosition - 1) {
    // Active is the LEFT chip of the gap — pushing the right chip
    // in puts active in the gap's right slot.
    landingSlotRaw = gapPosition;
  } else if (activeIdx === gapPosition) {
    // Active is the RIGHT chip of the gap — pushing the left chip
    // in puts active in the gap's left slot.
    landingSlotRaw = gapPosition - 1;
  } else if (activeIdx < gapPosition) {
    // Active far to the left — the gap "shifts down" 1 after
    // active's removal.
    landingSlotRaw = gapPosition - 1;
  } else {
    // Active far to the right — the gap doesn't shift after
    // active's removal.
    landingSlotRaw = gapPosition;
  }

  // `+ 0` normalizes -0 → +0. `Math.ceil(-0.5)` evaluates to -0
  // in JS, which propagates through the gap-math and produces a
  // landingSlot of -0 for the front-of-route case. Visually
  // identical to +0 in every consumer, but breaks Jest's
  // `toBe(0)` (uses `Object.is`).
  const landingSlot =
    (landingSlotRaw < 0
      ? 0
      : landingSlotRaw > N - 1
        ? N - 1
        : landingSlotRaw) + 0;

  if (landingSlot === activeIdx) {
    // Drag wandered just past active's swap zone but the math
    // collapsed onto active's origin slot — no meaningful move.
    // Most common case: dragging chip 0 a tiny bit further left
    // (no other chip exists to that side), or chip N-1 a tiny bit
    // further right.
    return { kind: "noop" };
  }

  // Phase 7c dramatic-shift classification (2026-05-22). When the
  // drop genuinely lands at the very front (slot 0) or very back
  // (slot N-1) AND the drag is past the bar's bookend, the half-cell
  // split-shift visual is anemic (only one chip nudges by cellSize/2,
  // leaving the dragged chip visually atop the bookend chip). Hand
  // the visual off to the DFL fork's shift-all override instead by
  // setting the directive here; the consumer's worklet reads it and
  // writes shiftAllBeforeIdx (front) or shiftAllAfterIdx (back),
  // clearing the half-cell split-shift indices in the same frame so
  // the two mechanisms don't fight.
  //
  // The `slotApprox <= 0` / `>= N - 1` predicates are strict for the
  // shift-all trigger: an interior insert that happens to land at
  // slot 0 (e.g., dragging chip 1 a tiny bit left) keeps
  // dramaticShift = "none" and uses the half-cell visual, because
  // there's plenty of physical room for the split-shift to read
  // cleanly. The dramatic shift is reserved for the genuine
  // off-end case where the half-cell visual fails.
  let dramaticShift: "none" | "front" | "back" = "none";
  if (landingSlot === 0 && slotApprox <= 0) {
    dramaticShift = "front";
  } else if (landingSlot === N - 1 && slotApprox >= N - 1) {
    dramaticShift = "back";
  }

  // Split-shift indices for the chip bar's "two chips part to open
  // a gap" visual. -1 means "no chip on that side to push" — used
  // when the gap sits at the very front or very back of the bar.
  // `+ 0` normalizes -0 → +0 (same `Math.ceil(-0.5) === -0` JS
  // quirk as the landingSlot block above).
  //
  // Phase 7c: when dramaticShift fires, both indices are forced to
  // -1 — the shift-all override owns the visual and the half-cell
  // split-shift would otherwise translate the same cells in
  // contradictory directions.
  const leftCellIdxRaw = Math.floor(slotApprox) + 0;
  const rightCellIdxRaw = Math.ceil(slotApprox) + 0;
  const leftCellIdx =
    dramaticShift !== "none"
      ? -1
      : leftCellIdxRaw >= 0 &&
          leftCellIdxRaw < N &&
          leftCellIdxRaw !== activeIdx
        ? leftCellIdxRaw
        : -1;
  const rightCellIdx =
    dramaticShift !== "none"
      ? -1
      : rightCellIdxRaw >= 0 &&
          rightCellIdxRaw < N &&
          rightCellIdxRaw !== activeIdx
        ? rightCellIdxRaw
        : -1;

  return {
    kind: "insert",
    landingSlot,
    leftCellIdx,
    rightCellIdx,
    dramaticShift,
  };
}
