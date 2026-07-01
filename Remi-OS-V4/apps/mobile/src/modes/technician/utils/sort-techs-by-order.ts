/**
 * Shared sort helper for the calendar's tech roster ordering. The
 * day-view header reorder gesture writes a `techOrder: number[]` into
 * `useCalendarStore` (see `src/stores/calendar.ts`), and every surface
 * that renders a tech rail / avatar selector / column strip needs to
 * sort its own roster by that order so the day-view reorder propagates
 * to the workweek + landscape views.
 *
 * Semantics (must match the inline sort that previously lived in
 * `mapDayResponseToResources` and `availableWorkweekTechs`):
 *
 *   1. Techs whose id appears in `techOrder` come first, in
 *      `techOrder`'s sequence.
 *   2. Techs whose id is missing from `techOrder` come after, sorted
 *      ascending by numeric id (NOT input order). This matches the
 *      day-view's prior fallback of "sort by technician_id" and keeps
 *      the workweek rail deterministic when techOrder is empty / has
 *      not been seeded yet.
 *   3. `techOrder` entries that don't match any input id are silently
 *      ignored. Stale ids in the persisted store don't sort anything
 *      to the front of the list.
 *   4. With an empty `techOrder` (or undefined), behavior is "sort by
 *      id ascending" — i.e. an empty roster passes through, and a
 *      non-empty roster is returned as a stable id-sorted copy.
 *
 * Pure function; safe to call in `useMemo` selectors and Reanimated
 * worklets alike. Does not mutate the input.
 */
export function sortTechsByOrder<T extends { id: number }>(
  techs: ReadonlyArray<T>,
  techOrder: ReadonlyArray<number> | undefined,
): T[] {
  if (techs.length === 0) return [];

  const order = techOrder ?? [];
  const orderIndex = new Map<number, number>();
  order.forEach((id, idx) => {
    if (!orderIndex.has(id)) orderIndex.set(id, idx);
  });

  return [...techs].sort((a, b) => {
    const aIdx = orderIndex.get(a.id);
    const bIdx = orderIndex.get(b.id);
    if (aIdx != null && bIdx != null) return aIdx - bIdx;
    if (aIdx != null) return -1;
    if (bIdx != null) return 1;
    return a.id - b.id;
  });
}
