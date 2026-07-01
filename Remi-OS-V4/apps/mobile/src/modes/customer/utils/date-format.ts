/** Zero-pad a number to at least 2 digits. */
export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Convert a JS Date to `YYYY-MM-DD` string without timezone drift. */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Parse a date string that may be `YYYY-MM-DD` or a full ISO timestamp.
 * Returns [year, month, day] or null if unparseable.
 */
function parseDateParts(iso: string): [number, number, number] | null {
  const dateOnly = iso.includes('T') ? iso.split('T')[0] : iso;
  const [y, m, d] = dateOnly.split('-').map(Number);
  if (!y || !m || !d) return null;
  return [y, m, d];
}

/** Short date: "Tue, Apr 15" */
export function formatDateShort(iso: string): string {
  const parts = parseDateParts(iso);
  if (!parts) return iso;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Long date: "Tuesday, April 15, 2026" */
export function formatDateLong(iso: string): string {
  const parts = parseDateParts(iso);
  if (!parts) return iso;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Nullable variant that returns 'TBD' for missing values. */
export function formatScheduledDate(iso: string | null | undefined): string {
  if (!iso) return 'TBD';
  return formatDateShort(iso);
}

/**
 * Format a 24h `HH:MM` time string into 12h display: "2:00 PM".
 * Also handles common slot values like "14:00".
 */
export function formatTime(time: string): string {
  const [h, min] = time.split(':').map(Number);
  if (h == null || Number.isNaN(h)) return time;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${pad(min ?? 0)} ${ampm}`;
}

/** Nullable variant that returns 'TBD' for missing values. */
export function formatScheduledTime(time: string | null | undefined): string {
  if (!time) return 'TBD';
  return formatTime(time);
}

/** Map of common booking slot values to display labels. */
export const TIME_LABELS: Record<string, string> = {
  '09:00': '9:00 AM',
  '10:00': '10:00 AM',
  '11:00': '11:00 AM',
  '13:00': '1:00 PM',
  '14:00': '2:00 PM',
  '15:00': '3:00 PM',
  '16:00': '4:00 PM',
};

/** Resolve a time slot value to a human-readable label. */
export function timeLabel(value: string | null): string {
  if (!value) return '—';
  return TIME_LABELS[value] ?? value;
}
