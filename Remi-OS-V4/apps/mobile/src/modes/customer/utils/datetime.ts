/**
 * Datetime contract helpers — REMI Customer App.
 *
 * This file is a portable mirror of the canonical implementation in
 * REMITechnician (`src/utils/datetime.ts`). The function signatures
 * are intentionally identical so behavior matches across every REMI
 * client (REMITechnician, REMICustomer, REMIDashboard) and the
 * server-side test/seeder helper in REMIBackend. If you change a
 * signature here, update them in lockstep.
 *
 * THE CONTRACT
 * ────────────
 * Backend `timestamptz` columns ALWAYS receive a fully-qualified
 * ISO 8601 string with an explicit timezone marker — either `Z` for
 * UTC or a `±HH:MM` offset. Producers (form submits, scheduler
 * payloads, anything that constructs a string for a `timestamptz`
 * column) MUST NOT build these strings with naive template
 * interpolation like `` `${date}T${time}:00` `` because:
 *
 *   - That string has no timezone marker.
 *   - Postgres `timestamptz` interprets a TZ-less string using the
 *     server's session `timezone` setting (UTC on Render and most
 *     cloud Postgres deployments).
 *   - Result: a user typing "9 AM" in EDT (UTC-4) gets stored as
 *     "9 AM UTC", returned to the client as `"…T09:00:00.000Z"`, and
 *     re-rendered as 5 AM local. The whole calendar drifts by the
 *     UTC offset.
 *
 * `localToBackendISO` is the only sanctioned producer for that string.
 * `backendISOToLocalParts` is its inverse, used when prefilling forms
 * with values returned from the backend. `backendISOToLocalMinutes`
 * is the inverse for grid placement (e.g. resource-calendar
 * pixel-Y coordinates).
 *
 * SIBLING REPOS
 * ─────────────
 * Source of truth: REMITechnician `src/utils/datetime.ts`. When that
 * file changes, mirror the change here in the same PR cycle. See
 * `.cursor/rules/datetime-and-data-format-contracts.mdc` (the rule
 * that codifies this contract repo-wide and forbids the naive
 * pattern).
 */

/**
 * Convert a (date, time) pair captured from a UI form — interpreted as
 * the user's local wall-clock — into a fully-qualified ISO 8601 string
 * suitable for a backend `timestamptz` column.
 *
 * @param date "YYYY-MM-DD" (e.g. "2026-04-21")
 * @param time "HH:MM" (e.g. "09:00")
 * @returns ISO 8601 with the device's current UTC offset
 *          (e.g. "2026-04-21T09:00:00-04:00" in EDT, or
 *          "2026-04-21T09:00:00+00:00" in UTC).
 *
 * Throws if the inputs do not parse to a valid Date.
 */
export function localToBackendISO(date: string, time: string): string {
  // Build a Date from the local wall-clock components. JS treats a
  // string with no `Z`/offset as local time, so this Date represents
  // the moment the user actually meant.
  const local = new Date(`${date}T${time}:00`);
  if (Number.isNaN(local.getTime())) {
    throw new Error(
      `localToBackendISO: invalid date/time inputs date="${date}" time="${time}"`,
    );
  }

  // `getTimezoneOffset()` returns minutes WEST of UTC (e.g. EDT = +240).
  // Flip the sign so positive means east of UTC, matching ISO 8601.
  const offsetMin = -local.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const offH = String(Math.floor(abs / 60)).padStart(2, "0");
  const offM = String(abs % 60).padStart(2, "0");

  return `${date}T${time}:00${sign}${offH}:${offM}`;
}

/**
 * Like `backendISOToLocalParts` but returns minutes-from-local-midnight
 * directly. Use for grid placement (e.g. resource-calendar `from`/`to`
 * pixel-Y coordinates) where we need a single integer.
 *
 * The naive alternative — `parts.split("T").pop().split(":")` — silently
 * returns the UTC hours/minutes when the string has a `Z` suffix, which
 * shifts events on the grid by the user's UTC offset. Use this helper
 * for ANY field declared as a backend `timestamptz`.
 *
 * NOTE: do NOT use for Postgres `TIME` columns (TZ-naive) that arrive
 * as `"06:00:00"`. Use a TZ-naive parser for those. The split is
 * intentional: the column type determines the helper, not the field
 * name.
 *
 * @param iso A fully-qualified ISO 8601 string from the backend.
 * @returns Minutes-from-local-midnight (0..1440).
 */
export function backendISOToLocalMinutes(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`backendISOToLocalMinutes: invalid ISO string "${iso}"`);
  }
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Inverse of `localToBackendISO`: given a backend ISO timestamp,
 * return the local wall-clock {date, time} for prefilling a form.
 *
 * Use for any form that lets the user edit a value the backend
 * originally produced. DO NOT `.slice(0, 5)` an ISO string and call
 * it a time — that returns "2026-" or similar garbage.
 *
 * @param iso A fully-qualified ISO 8601 string from the backend
 *            (e.g. "2026-04-21T13:00:00.000Z").
 * @returns `{ date, time }` in the device's local zone:
 *            `{ date: "2026-04-21", time: "09:00" }` in EDT.
 */
export function backendISOToLocalParts(iso: string): {
  date: string;
  time: string;
} {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`backendISOToLocalParts: invalid ISO string "${iso}"`);
  }
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { date: `${y}-${mo}-${da}`, time: `${hh}:${mm}` };
}
