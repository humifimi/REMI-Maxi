import {
  formatDateLong,
  formatDateShort,
  formatScheduledDate,
  formatScheduledTime,
  formatTime,
  pad,
  timeLabel,
  toISODate,
  TIME_LABELS,
} from '@customer/utils/date-format';

describe('date-format', () => {
  describe('pad', () => {
    it.each([
      [0, '00'],
      [5, '05'],
      [9, '09'],
      [10, '10'],
      [42, '42'],
      [100, '100'],
    ])('pad(%i) -> "%s"', (n, expected) => {
      expect(pad(n)).toBe(expected);
    });
  });

  describe('toISODate', () => {
    it('formats a date without timezone drift', () => {
      const d = new Date(2026, 3, 7); // April 7, 2026 local time
      expect(toISODate(d)).toBe('2026-04-07');
    });

    it('zero-pads single-digit months and days', () => {
      expect(toISODate(new Date(2026, 0, 1))).toBe('2026-01-01');
    });
  });

  describe('formatDateShort', () => {
    it('formats a YYYY-MM-DD string into a short readable date', () => {
      // Wednesday, April 15, 2026
      expect(formatDateShort('2026-04-15')).toBe('Wed, Apr 15');
    });

    it('strips time portion from full ISO timestamps', () => {
      expect(formatDateShort('2026-04-15T13:00:00.000Z')).toBe('Wed, Apr 15');
    });

    it('returns the input when it cannot be parsed', () => {
      expect(formatDateShort('not-a-date')).toBe('not-a-date');
    });
  });

  describe('formatDateLong', () => {
    it('formats a YYYY-MM-DD string with full weekday and year', () => {
      expect(formatDateLong('2026-04-15')).toBe('Wednesday, April 15, 2026');
    });
  });

  describe('formatScheduledDate', () => {
    it('returns "TBD" for nullish input', () => {
      expect(formatScheduledDate(null)).toBe('TBD');
      expect(formatScheduledDate(undefined)).toBe('TBD');
      expect(formatScheduledDate('')).toBe('TBD');
    });

    it('delegates to formatDateShort for valid input', () => {
      expect(formatScheduledDate('2026-04-15')).toBe('Wed, Apr 15');
    });
  });

  describe('formatTime', () => {
    it.each([
      ['09:00', '9:00 AM'],
      ['00:00', '12:00 AM'],
      ['12:00', '12:00 PM'],
      ['13:00', '1:00 PM'],
      ['14:30', '2:30 PM'],
      ['23:45', '11:45 PM'],
    ])('formatTime("%s") -> "%s"', (input, expected) => {
      expect(formatTime(input)).toBe(expected);
    });

    it('returns the input when hours cannot be parsed', () => {
      expect(formatTime('bad')).toBe('bad');
    });
  });

  describe('formatScheduledTime', () => {
    it('returns "TBD" for nullish input', () => {
      expect(formatScheduledTime(null)).toBe('TBD');
      expect(formatScheduledTime(undefined)).toBe('TBD');
    });

    it('delegates to formatTime for valid input', () => {
      expect(formatScheduledTime('14:00')).toBe('2:00 PM');
    });
  });

  describe('timeLabel', () => {
    it('returns em-dash for null', () => {
      expect(timeLabel(null)).toBe('—');
    });

    it('uses TIME_LABELS map for known slot values', () => {
      Object.entries(TIME_LABELS).forEach(([slot, label]) => {
        expect(timeLabel(slot)).toBe(label);
      });
    });

    it('falls back to the raw value for unknown slots', () => {
      expect(timeLabel('07:30')).toBe('07:30');
    });
  });
});
