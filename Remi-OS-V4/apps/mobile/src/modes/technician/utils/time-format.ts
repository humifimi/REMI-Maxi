/**
 * Time-of-day formatting helpers used by the Calendar Display Hours
 * stepper UI (settings + quick-settings sheet) and any other surface
 * that needs to render minute-of-day values for humans.
 *
 * Values are minutes-from-midnight (0..1440). 1440 renders as
 * "Midnight" since 12:00 AM also represents 0; this avoids ambiguity
 * at the upper bound of the day-end stepper.
 */

export function formatTimeOfDay(minutes: number): string {
  const total = Math.max(0, Math.min(1440, Math.round(minutes)));
  if (total === 1440) return "Midnight";
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function formatRangeSummary(
  startMinutes: number,
  endMinutes: number,
): string {
  const hours = (endMinutes - startMinutes) / 60;
  const wholeHours = Number.isInteger(hours)
    ? hours.toFixed(0)
    : hours.toFixed(1);
  return `${formatTimeOfDay(startMinutes)} – ${formatTimeOfDay(endMinutes)} (${wholeHours}h)`;
}
