/**
 * Snap-zone tuning constants used by both the chip bar's worklet
 * (`route-reorder-chip-bar.tsx`) and the pure classifier
 * (`chip-bar-snap-zone.ts`).
 *
 * Kept in a constants-only module so the classifier (which is
 * marked `'worklet'`) can import them without dragging in any of
 * the chip bar's React Native / reanimated imports — keeps the
 * Jest unit-test path clean and the worklet bundle lean.
 *
 * If you change either value, update the corresponding comment
 * block in `route-reorder-chip-bar.tsx` (the one above the
 * original definition) — those comments document the tuning
 * history and the failure modes the values were chosen to avoid.
 */

/**
 * The dragged chip's center must be within this many pixels of a
 * target chip's center to count as a SWAP. 9px ≈ 33% of a 36px
 * chip width. See the tuning-history comment in
 * `route-reorder-chip-bar.tsx` for the 9 → 13 → 9 swing.
 */
export const SWAP_ZONE_HALF_WIDTH_PX = 9;

/**
 * Fallback for DFL's `activeCellSize` when it hasn't measured
 * yet (race during the first frame of a drag). 54 = 36px chip +
 * 9px horizontal margin × 2.
 */
export const CHIP_CELL_FALLBACK = 54;

/**
 * Phase 7i follow-up (2026-05-22) — empty buffer gutters at the left
 * and right of the chip strip, dedicated drop targets for front- and
 * back-insert with the dramatic-shift visual.
 *
 * Applied as `contentContainerStyle: { paddingHorizontal:
 * CHIP_BAR_OFF_END_BUFFER_PX }` on the chip bar's `<DraggableFlatList>`.
 * The bar's visible chips are pushed inward by this amount on both
 * sides, exposing a chip-wide empty zone the user can drag into. The
 * worklet subtracts this constant from `hoverOffset` before
 * computing `slotApprox`, so `slotApprox` is still "0 = aligned with
 * chip 0's position" — but to *reach* the dramatic-shift trigger
 * (`slotApprox <= 0`) the user only has to drop into the visible
 * gutter, not drag the chip partway off the bar.
 *
 * Without this buffer the Phase 7c carve-out preserved a SWAP zone
 * on the interior side of the bookend chips (slot 0 / N-1) that the
 * user kept hitting first — they'd see the amber ring fire at
 * `slotApprox = [0, +0.167]` and stop, never pushing further left to
 * `slotApprox < 0` where the dramatic shift was. User report
 * 2026-05-22: "I'm not seeing the dramatic shift for the left side
 * (#1). I still just see the amber circle." The buffer puts a
 * generous fingertip-width of physical real estate between the
 * bar's edge and the first SWAP-eligible chip, so the gestures
 * stop sharing the same physical area.
 *
 * 36 = one chip-width. Makes the empty slot read as "a chip would
 * fit there" — matches the size of the chip that lands after the
 * drop, and gives the dragged chip a coherent landing zone visually.
 * Shrinking this below ~24 makes the gutter feel like a stripe
 * (which doesn't read as "drop here"). Growing it past ~54 (one
 * cellSize) starts to look like accidental padding instead of a
 * call-to-action.
 */
export const CHIP_BAR_OFF_END_BUFFER_PX = 36;
