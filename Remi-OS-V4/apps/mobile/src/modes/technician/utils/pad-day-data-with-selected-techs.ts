/**
 * `padDayDataWithSelectedTechs` (2026-05-09 — Bug A fix follow-up
 * to PR-UX-6).
 *
 * The franchise day-view's column count is driven by
 * `dayData.technicians.length`. When the BE returns 0 technicians
 * for a date the user has navigated to (e.g. past the seed window
 * after Reset Demo Data), the column count collapses to 0 even
 * though the user has techs in their `selectedTechIds` roster.
 * The vendored calendar library divides by the column count for
 * its layout math
 * (`APPOINTMENT_BLOCK_WIDTH = (width - TIME_LABEL_WIDTH) /
 * numberOfColumns`); 0 produces `Infinity` / `NaN` and the grid
 * blanks. The user reported this as "the calendar stays broken
 * even after navigating back to a date with appointments, until
 * I restart the app."
 *
 * The fix: the user's selected roster IS the source of truth for
 * "which columns to render." This helper pads the BE-returned tech
 * list with a placeholder column for any `selectedTechIds` entry
 * the BE didn't include. Names are sourced from `techNameLookup`
 * (typically built from week + day query data); when no name is
 * available anywhere, the placeholder uses `Tech ${id}` so the
 * column still renders and the user can still tap into it.
 *
 * Cold-start behavior (selectedTechIds empty): the helper returns
 * the BE response unchanged. The `pendingAutoSelectFirstTech` flow
 * elsewhere populates `selectedTechIds[0]` once the first response
 * lands; until then we render whatever the BE returned (possibly
 * nothing — but that's the cold-start case, not the empty-day
 * case the user reported).
 *
 * Composition with the calendar library's `selectedResourceIds`
 * body filter: the library's filter HIDES unselected techs from
 * the body while keeping their avatars in the header. This helper
 * ADDS selected techs the BE didn't include, on the OPPOSITE side
 * of the equation. Both consume the same `selectedTechIds` array;
 * neither interferes with the other.
 */

import type {
  CalendarAppointmentItem,
  CalendarDayResponse,
  PersonalEvent,
} from "@technician/types/calendar";

export interface TechNameLookupEntry {
  name: string;
  profile_image_url: string | null;
}

/**
 * Produce a `CalendarDayResponse` whose `technicians` list is the
 * union of (a) what the BE returned and (b) every tech in
 * `selectedTechIds` that wasn't already in (a). Tech name + avatar
 * for placeholder columns come from `techNameLookup`; when no
 * lookup entry exists the placeholder uses `Tech ${id}` and a null
 * avatar URL.
 *
 * Returns the original response by reference when no padding is
 * needed (selectedTechIds empty, or every selected tech is already
 * in the response). This preserves React memo stability for the
 * common case where the BE response covers the user's roster.
 *
 * Returns `undefined` when the input is `undefined`, mirroring the
 * `dayQuery.data` shape.
 */
export function padDayDataWithSelectedTechs(
  dayData: CalendarDayResponse | undefined,
  selectedTechIds: number[],
  techNameLookup: ReadonlyMap<number, TechNameLookupEntry>,
): CalendarDayResponse | undefined {
  if (!dayData) return dayData;
  if (selectedTechIds.length === 0) return dayData;
  const existing = new Set(
    dayData.technicians.map((t) => t.technician_id),
  );
  const missing = selectedTechIds.filter((id) => !existing.has(id));
  if (missing.length === 0) return dayData;
  const placeholders = missing.map((id) => {
    const lookup = techNameLookup.get(id);
    return {
      technician_id: id,
      technician_name: lookup?.name ?? `Tech ${id}`,
      profile_image_url: lookup?.profile_image_url ?? null,
      job_count: 0,
      completed_count: 0,
      appointments: [] as CalendarAppointmentItem[],
      personal_events: [] as PersonalEvent[],
    };
  });
  return {
    ...dayData,
    technicians: [...dayData.technicians, ...placeholders],
  };
}
