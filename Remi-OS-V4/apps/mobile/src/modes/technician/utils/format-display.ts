/**
 * `format-display` — user-facing formatters for dates, times, and
 * linter messages.
 *
 * Origin (D2P-FE-13 follow-up, 2026-04-26): the smart-default linter
 * intercept and the Pending Reality review screen both render copy
 * sourced from the wire format — `13:30:00`, `2026-04-26`,
 * `appointment #27026`, `technician 1487`. That's fine for the BE
 * audit log but unreadable on glass for the dispatcher / tech
 * actually using the app. This module centralizes the wire → user
 * conversion in one place so every consumer renders the same thing.
 *
 * Contracts:
 *
 * - `formatTime12h(t)` accepts `HH:MM` or `HH:MM:SS` (the only two
 *   shapes the BE sends today; `appointments.scheduled_time` is
 *   timezone-naive `TIME` per
 *   `.cursor/rules/datetime-and-data-format-contracts.mdc` §1).
 *   Returns `"1:30 PM"`. Returns the input unchanged when it doesn't
 *   match the wire shape — defensive, since some payloads have
 *   `null` or empty strings that should pass through to the caller.
 *
 * - `formatDateFriendly(d)` accepts `YYYY-MM-DD` and returns
 *   `"Sun, Apr 26"`. The `Date` is constructed from the components
 *   directly (NOT `new Date("YYYY-MM-DD")`, which Safari / older RN
 *   parsed in UTC and shifted east of UTC → wrong day). Year is
 *   omitted for that-year dates and appended (`"Apr 26, 2027"`)
 *   otherwise so the dispatcher always knows when the year crosses.
 *
 * - `humanizeLinterMessage(raw, ctx)` post-processes a wire-format
 *   `LinterIssue.humanMessage` to replace IDs and ISO substrings
 *   with friendly equivalents. Designed to be a strict superset of
 *   the original — every transformation is additive (substitute a
 *   recognised pattern; leave unrecognised text alone) so the
 *   message round-trips for any rule the catalog ships now or
 *   later. The cross-repo `logistics-linter.ts` is the producer
 *   side and stays untouched (its output is the audit-log truth);
 *   this is purely a presentation-layer transform.
 *
 * The patterns this module targets are derived from the v1 rule
 * catalog in `src/utils/logistics-linter.ts` (R1, R2, R6 — the only
 * rules currently producing `humanMessage` text in the FE without
 * the BE-only routes / SLA / fleet caches). When R3 / R4 / R9 / R10
 * ship and emit additional templated phrases, extend the regex
 * inventory here to match — keep transformations idempotent.
 */

/** Format a wire-format time (`HH:MM` or `HH:MM:SS`) as `1:30 PM`. */
export function formatTime12h(time: string): string {
  if (typeof time !== "string") return time;
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match) return time;
  const hour24 = Number.parseInt(match[1], 10);
  const minutes = match[2];
  if (!Number.isFinite(hour24) || hour24 < 0 || hour24 > 23) return time;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minutes} ${period}`;
}

/**
 * Parse a "HH:MM(:SS)?" 24-hour string into its hour/minute/period
 * pieces for use by `formatTimeRange12h`. Returns null if the string
 * isn't a recognizable time.
 */
function parseTimePieces(
  time: string,
): { hour12: number; minutes: string; period: "AM" | "PM" } | null {
  if (typeof time !== "string") return null;
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time);
  if (!match) return null;
  const hour24 = Number.parseInt(match[1], 10);
  const minutes = match[2];
  if (!Number.isFinite(hour24) || hour24 < 0 || hour24 > 23) return null;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, minutes, period };
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Format a wire-format date (`YYYY-MM-DD`) as `Sun, Apr 26`. Falls
 * back to the input when the shape doesn't match. When the year
 * differs from the current year, the year is appended
 * (`Sun, Apr 26, 2027`).
 */
export function formatDateFriendly(date: string, today: Date = new Date()): string {
  if (typeof date !== "string") return date;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return date;
  }
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return date;
  const dow = DAY_LABELS[d.getDay()];
  const mon = MONTH_LABELS[d.getMonth()];
  const dayNum = d.getDate();
  const sameYear = year === today.getFullYear();
  return sameYear
    ? `${dow}, ${mon} ${dayNum}`
    : `${dow}, ${mon} ${dayNum}, ${year}`;
}

/**
 * Format a start/end pair as a human-readable range. Drops the
 * redundant period on the start when both halves share AM or PM,
 * matching how people naturally read calendar windows:
 *
 *   start="09:00", end="10:30"  → "9:00 – 10:30 AM"
 *   start="11:30", end="13:00"  → "11:30 AM – 1:00 PM"
 *   start="17:00", end="18:00"  → "5:00 – 6:00 PM"
 *   start="17:00", end=null     → "5:00 PM"
 *   start=null,    end=anything → "Unscheduled"
 *
 * Uses an en-dash with hair spaces (`\u2009\u2013\u2009`) for the
 * separator — same typography the previous version of this helper
 * used so existing callers (pending-reality intent narration) look
 * identical aside from the period collapse.
 *
 * History:
 *  - Pre-r16.19: signature `(start: string, end: string) => string`;
 *    always emitted both halves with full "H:MM AM/PM" text.
 *  - r16.19 (2026-05-21): both args optional; smart period collapse
 *    for same-AM/PM ranges; falls back to start-only or "Unscheduled"
 *    when the BE returns null. Added to support the franchise route
 *    map's chip tooltip which now renders the appointment window as
 *    a range. Existing callers gain the period collapse for free.
 */
export function formatTimeRange12h(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start) return "Unscheduled";
  const startPieces = parseTimePieces(start);
  if (!startPieces) return start;
  const startFull = `${startPieces.hour12}:${startPieces.minutes} ${startPieces.period}`;
  if (!end) return startFull;
  const endPieces = parseTimePieces(end);
  if (!endPieces) return startFull;
  const endFull = `${endPieces.hour12}:${endPieces.minutes} ${endPieces.period}`;
  const SEPARATOR = "\u2009\u2013\u2009"; // hair space + en-dash + hair space
  if (startPieces.period === endPieces.period) {
    return `${startPieces.hour12}:${startPieces.minutes}${SEPARATOR}${endFull}`;
  }
  return `${startFull}${SEPARATOR}${endFull}`;
}

/**
 * Lookups the FE has at hand when humanizing a wire message. Both
 * are optional — when an id is unknown we fall back to the bare
 * `#NNN` form rather than dropping the substring (the dispatcher
 * still gets information; just less of it).
 */
export interface HumanizeLookups {
  /** Map of appointment id → customer-facing label (e.g. "Jane Doe"). */
  appointmentLabels?: ReadonlyMap<number, string>;
  /** Map of technician id → technician display name. */
  technicianNames?: ReadonlyMap<number, string>;
  /**
   * Map of personal-event id (UUID) → user-supplied title. Surfaced
   * by the Pending Reality review screen so personal-event intents
   * read as "Lunch break" instead of "Personal event
   * b1c2d3e4-...". Sourced from each tech's `personal_events`
   * array on the day-view cache.
   */
  personalEventTitles?: ReadonlyMap<string, string>;
}

/**
 * Post-process a wire-format `LinterIssue.humanMessage` string to
 * substitute friendly date / time / id renderings. See module
 * header for the contract.
 *
 * The replacement order matters:
 *   1. `HH:MM:SS` → `1:30 PM` (run first so the regex doesn't
 *      collide with the trailing seconds-of-day digits in the
 *      isolated-day fragment).
 *   2. `YYYY-MM-DD` → `Sun, Apr 26`.
 *   3. `appointment #NNN` → `<customer name>` (or unchanged when
 *      we don't have a label for that id — the bare `#NNN` form
 *      is the dispatcher's existing mental model).
 *   4. `technician NNN` → `<tech name>` (same fallback).
 *
 * Idempotent: running the function twice on its own output is a
 * no-op (the substitutions replace wire patterns with friendly
 * text that doesn't re-match the regex inventory).
 */
export function humanizeLinterMessage(
  raw: string,
  lookups: HumanizeLookups = {},
): string {
  if (typeof raw !== "string" || raw.length === 0) return raw;
  let out = raw;

  out = out.replace(/\b(\d{2}):(\d{2}):(\d{2})\b/g, (full) =>
    formatTime12h(full),
  );

  out = out.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (full) =>
    formatDateFriendly(full),
  );

  if (lookups.appointmentLabels && lookups.appointmentLabels.size > 0) {
    out = out.replace(/\bappointment\s+#(\d+)\b/gi, (match, idStr) => {
      const id = Number.parseInt(idStr, 10);
      const label = lookups.appointmentLabels?.get(id);
      return label ? label : match;
    });
  }

  if (lookups.technicianNames && lookups.technicianNames.size > 0) {
    out = out.replace(/\btechnician\s+(\d+)\b/gi, (match, idStr) => {
      const id = Number.parseInt(idStr, 10);
      const name = lookups.technicianNames?.get(id);
      return name ? name : match;
    });
  }

  return out;
}
