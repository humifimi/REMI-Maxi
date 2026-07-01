/**
 * Translates a body-grid lane order (the list of tech ids the vendored
 * Calendar is *actually painting* mini-cols lanes for, in paint order)
 * into the `lanesByTechId` shape that `computeMoveChainArrows.ts`
 * consumes.
 *
 * Why this helper exists
 * ----------------------
 * The vendored library renders mini-cols with:
 *   `techsToRender.map((trid, i) => left: i * laneWidth)`
 * where `techsToRender == bodyResourceIds == resources.map(r => r.id)
 *   .filter(id => selectedResourceIds.includes(id))` — i.e.
 * **resources-prop order, filtered by selection**.
 *
 * Pre-2026-05-12 the consumer (`LandscapeWorkweekView`) built
 * `lanesByTechId` from `selectedTechIds` (the *selection-order* array
 * tracked by the calendar store). When the user toggled techs in any
 * order other than ascending `resources`-prop order, the two arrays
 * diverged and the arrow X coordinates pointed at the wrong sub-lane —
 * "too short / too long / wrong-angle arrows for the left-side techs".
 *
 * Post-fix the host pulls the library's `bodyResourceIds` back through
 * the FORK Phase 37 `onBodyResourceIdsChange` callback and passes that
 * exact array here, so the lane mapping always reflects what the body
 * grid is *painting*.
 *
 * PLAN-DEVIATION: 2026-05-12-arrow-lane-order-from-vendor —
 * docs/PLAN-DEVIATIONS.md#2026-05-12-arrow-lane-order-from-vendor.
 *
 * Contract
 * --------
 * - Returns `undefined` (= "use day-column geometry, no sub-lanes")
 *   when there's no measurable width, no days, or fewer than 2 lanes
 *   (single-tech mode never slices the column).
 * - Otherwise returns a Map keyed by tech id whose values give the
 *   lane index (0-based, ascending left → right) and the per-lane
 *   width in points. `compute-move-chain-arrows.ts` uses
 *   `colStart + laneIndex * laneWidth + laneWidth/2` for the lane
 *   center.
 */
export type LaneEntry = {
  laneIndex: number;
  laneWidth: number;
};

/**
 * Default time-label column width used by the vendored Calendar — kept
 * in sync with `TIME_LABEL_WIDTH` inside the library. Exported so
 * tests can pin to the same constant and the host can override it if
 * the contract ever changes.
 */
export const DEFAULT_TIME_LABEL_WIDTH = 50;

export function buildLanesByTechId(
  laneOrder: readonly number[],
  measuredCalendarWidth: number,
  daysCount: number,
  timeLabelWidth: number = DEFAULT_TIME_LABEL_WIDTH,
): Map<number, LaneEntry> | undefined {
  if (!Number.isFinite(measuredCalendarWidth) || measuredCalendarWidth <= 0) {
    return undefined;
  }
  if (!Number.isFinite(daysCount) || daysCount <= 0) {
    return undefined;
  }
  if (laneOrder.length < 2) {
    return undefined;
  }
  const colWidth = (measuredCalendarWidth - timeLabelWidth) / daysCount;
  if (!Number.isFinite(colWidth) || colWidth <= 0) {
    return undefined;
  }
  const laneWidth = colWidth / laneOrder.length;
  const map = new Map<number, LaneEntry>();
  laneOrder.forEach((techId, idx) => {
    map.set(techId, { laneIndex: idx, laneWidth });
  });
  return map;
}
