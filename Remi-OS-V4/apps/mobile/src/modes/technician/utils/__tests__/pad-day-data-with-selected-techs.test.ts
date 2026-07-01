/**
 * Tests for `padDayDataWithSelectedTechs` (2026-05-09 Bug A
 * regression coverage).
 *
 * Bug A repro: BE returns 0 technicians for a date past the seed
 * window, the day-view's column count collapses to 0, the vendored
 * calendar's layout math divides by zero, the grid blanks, and
 * the calendar stays broken even after navigating back to a date
 * with appointments. The user's `selectedTechIds` roster is the
 * source of truth for "which columns to render"; this helper pads
 * BE-returned data so every selected tech has a column.
 *
 * Coverage axes:
 *   1. Empty BE response + non-empty selectedTechIds → one
 *      placeholder column per selected tech (the headline bug).
 *   2. Partial BE response + selectedTechIds → BE techs preserved,
 *      missing selected techs added as placeholders.
 *   3. BE response covers selectedTechIds → returned by reference
 *      (memo stability for the common case).
 *   4. Empty selectedTechIds → returned by reference (cold-start
 *      / "show whatever the BE says" branch).
 *   5. Names + avatars resolve from techNameLookup; missing entries
 *      fall back to `Tech ${id}` + null avatar.
 *   6. `undefined` input → `undefined` output (matches `dayQuery.data`).
 */

import { padDayDataWithSelectedTechs } from "../pad-day-data-with-selected-techs";
import type { CalendarDayResponse } from "@technician/types/calendar";

function makeBlankDay(date: string): CalendarDayResponse {
  return { date, technicians: [] };
}

function makeDay(
  date: string,
  techs: Array<{ id: number; name: string; profile_image_url?: string | null }>,
): CalendarDayResponse {
  return {
    date,
    technicians: techs.map((t) => ({
      technician_id: t.id,
      technician_name: t.name,
      profile_image_url: t.profile_image_url ?? null,
      job_count: 0,
      completed_count: 0,
      appointments: [],
      personal_events: [],
    })),
  };
}

describe("padDayDataWithSelectedTechs — Bug A regression coverage", () => {
  it("pads an empty BE response with one placeholder column per selected tech", () => {
    const day = makeBlankDay("2026-05-16");
    const lookup = new Map([
      [2054, { name: "Alex", profile_image_url: null }],
      [2055, { name: "Bea", profile_image_url: "/u/2055.png" }],
      [2071, { name: "Cam", profile_image_url: null }],
    ]);

    const result = padDayDataWithSelectedTechs(
      day,
      [2054, 2055, 2071, 2056, 2072, 2073],
      lookup,
    );

    expect(result?.technicians).toHaveLength(6);
    expect(result?.technicians.map((t) => t.technician_id)).toEqual([
      2054, 2055, 2071, 2056, 2072, 2073,
    ]);
    // Names resolve where the lookup has them, fall back to
    // `Tech ${id}` otherwise.
    expect(result?.technicians.map((t) => t.technician_name)).toEqual([
      "Alex",
      "Bea",
      "Cam",
      "Tech 2056",
      "Tech 2072",
      "Tech 2073",
    ]);
    // Profile image URLs come through when the lookup has them,
    // null otherwise.
    expect(result?.technicians.map((t) => t.profile_image_url)).toEqual([
      null,
      "/u/2055.png",
      null,
      null,
      null,
      null,
    ]);
    // Placeholder columns ship empty appointment + personal-event
    // arrays so the calendar grid renders cleanly.
    for (const t of result?.technicians ?? []) {
      expect(t.appointments).toEqual([]);
      expect(t.personal_events).toEqual([]);
      expect(t.job_count).toBe(0);
      expect(t.completed_count).toBe(0);
    }
  });

  it("preserves BE-returned techs and only adds placeholders for missing selected techs", () => {
    const day = makeDay("2026-05-09", [
      { id: 2054, name: "Alex" },
      { id: 2055, name: "Bea" },
    ]);
    const lookup = new Map([
      [2071, { name: "Cam", profile_image_url: null }],
    ]);

    const result = padDayDataWithSelectedTechs(
      day,
      [2054, 2055, 2071, 2056],
      lookup,
    );

    expect(result?.technicians).toHaveLength(4);
    // BE-returned techs come first (in their original order), then
    // missing selected techs in the order they appear in
    // selectedTechIds.
    expect(result?.technicians.map((t) => t.technician_id)).toEqual([
      2054, 2055, 2071, 2056,
    ]);
    expect(result?.technicians.map((t) => t.technician_name)).toEqual([
      "Alex",
      "Bea",
      "Cam",
      "Tech 2056",
    ]);
  });

  it("returns the BE response by reference when every selected tech is already present (memo stability)", () => {
    const day = makeDay("2026-05-09", [
      { id: 2054, name: "Alex" },
      { id: 2055, name: "Bea" },
      { id: 2071, name: "Cam" },
    ]);
    const lookup = new Map<number, { name: string; profile_image_url: string | null }>();

    const result = padDayDataWithSelectedTechs(day, [2054, 2055, 2071], lookup);

    expect(result).toBe(day);
  });

  it("returns the BE response by reference when selectedTechIds is empty (cold-start branch)", () => {
    const day = makeDay("2026-05-09", [
      { id: 2054, name: "Alex" },
    ]);
    const lookup = new Map<number, { name: string; profile_image_url: string | null }>();

    const result = padDayDataWithSelectedTechs(day, [], lookup);

    expect(result).toBe(day);
  });

  it("returns undefined when input is undefined (matches dayQuery.data shape)", () => {
    const lookup = new Map<number, { name: string; profile_image_url: string | null }>();

    const result = padDayDataWithSelectedTechs(undefined, [2054, 2055], lookup);

    expect(result).toBeUndefined();
  });

  it("ensures the column count is non-zero when BE is empty AND selectedTechIds is non-empty (the headline bug)", () => {
    // The exact failure mode from the user's report:
    //   [CAL:api] dayView response { techCount: 0, totals: [] }
    //   Selected roster: [2054, 2055, 2071, 2056, 2072, 2073]
    // Without padding, the day-view's `numberOfColumns` was 0 and
    // the vendored calendar produced `headerABW: Infinity`,
    // `totalW: NaN`. With padding, every selected tech contributes
    // a column.
    const day = makeBlankDay("2026-05-16");
    const lookup = new Map<number, { name: string; profile_image_url: string | null }>();

    const result = padDayDataWithSelectedTechs(
      day,
      [2054, 2055, 2071, 2056, 2072, 2073],
      lookup,
    );

    expect(result?.technicians.length).toBeGreaterThan(0);
    expect(result?.technicians.length).toBe(6);
  });
});
