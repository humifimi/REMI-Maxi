import type { ScoredSuggestion, ScoreBreakdown } from '@customer/types/api';

const ZERO_BREAKDOWN: ScoreBreakdown = {
  customerPreferenceMatch: 0,
  routeEfficiency: 0,
  technicianFamiliarity: 0,
  inventoryReadiness: 0,
  businessPriority: 0,
  scheduleFit: 0,
  penalties: 0,
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

/**
 * When POST /bookings/suggest is unavailable, slow, or returns no slots, the UI still
 * needs choosable times so the booking flow can complete. These mirror the shape of
 * real `ScoredSuggestion` rows; `technicianId` 0 means "assign at confirm" for backends
 * that support optional technician on create.
 */
export function buildFallbackBookingSuggestions(preferredDateStart: string): ScoredSuggestion[] {
  const start = parseISODate(preferredDateStart);
  const slots: { dayOffset: number; timeSlot: string; name: string; drive: number; explanation: string }[] = [
    {
      dayOffset: 1,
      timeSlot: '09:00',
      name: 'Next available technician',
      drive: 22,
      explanation:
        'Sample time — smart scheduling will rank real slots when the scheduler API is available.',
    },
    {
      dayOffset: 2,
      timeSlot: '10:00',
      name: 'Next available technician',
      drive: 18,
      explanation:
        'Sample time — your actual technician and drive time will be set when routing is live.',
    },
    {
      dayOffset: 3,
      timeSlot: '14:00',
      name: 'Next available technician',
      drive: 30,
      explanation:
        'Sample time — choose any slot to continue; confirmation still uses your real services and address.',
    },
  ];

  return slots.map((s, i) => {
    const day = new Date(start);
    day.setDate(day.getDate() + s.dayOffset);

    return {
      technicianId: 0,
      technicianName: s.name,
      date: toISODate(day),
      timeSlot: s.timeSlot,
      insertionPosition: i + 1,
      score: 0.72 - i * 0.06,
      breakdown: { ...ZERO_BREAKDOWN },
      explanation: s.explanation,
      estimatedDriveMinutes: s.drive,
      isFallbackSuggestion: true,
    };
  });
}
