// Part of the REMI profit-model engine.
// Display-only helpers. Pure; consumers may ignore and roll their own.
// See /Users/jacegalloway/Documents/Docs/docs/pdf-implementation-plans/plans/profit-model-v2-spec.md.

export interface CurrencyOptions {
  /** Decimals to keep. Defaults to 0 (whole dollars). */
  decimals?: number;
  /** ISO 4217 currency code. Defaults to 'USD'. */
  currency?: string;
  /** BCP-47 locale. Defaults to 'en-US'. */
  locale?: string;
}

/** Format a number as USD currency by default ($1,234). */
export function currency(n: number, options: CurrencyOptions = {}): string {
  const { decimals = 0, currency: cur = 'USD', locale = 'en-US' } = options;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: cur,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

/** Format a number as a percentage with the given decimal places (default 1). */
export function percent(n: number, decimals = 1): string {
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(decimals)}%`;
}

/**
 * Format a month count as a human phrase.
 *  - 0 → "0 months"
 *  - 11 → "11 months"
 *  - 12 → "1 year"
 *  - 38 → "3 years 2 months"
 */
export function months_to_human(months: number): string {
  if (!Number.isFinite(months)) return '—';
  const rounded = Math.round(months);
  if (rounded < 0) return `${rounded} months`;
  const years = Math.floor(rounded / 12);
  const m = rounded % 12;
  if (years === 0) return `${m} month${m === 1 ? '' : 's'}`;
  if (m === 0) return `${years} year${years === 1 ? '' : 's'}`;
  return `${years} year${years === 1 ? '' : 's'} ${m} month${m === 1 ? '' : 's'}`;
}
