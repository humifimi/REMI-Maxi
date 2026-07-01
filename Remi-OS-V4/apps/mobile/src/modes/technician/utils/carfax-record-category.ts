import type { ServiceHistoryDisplayRecord } from "@technician/types/api";

/**
 * Derived category for a CARFAX Service History Check (SHC) display record.
 *
 * CARFAX itself only emits two `type` values per record (`"service"` /
 * `"recall"`), but the actual semantic event type is buried in the
 * `text[]` array (e.g. "Title issued", "Safety inspection performed",
 * "Oil and filter changed"). This module pattern-matches the text lines
 * to surface a richer category that drives the pill rendered on the
 * paginated list rows AND on the detail screen header.
 *
 * Pure function, no React, no side effects — trivially unit-testable.
 */

export type CarfaxRecordCategory =
  | "recall"
  | "inspection"
  | "title"
  | "registration"
  | "ownership"
  | "service"
  | "other";

export interface CarfaxRecordPillSpec {
  category: CarfaxRecordCategory;
  /** Short uppercase label rendered inside the pill (e.g. "Title"). */
  label: string;
  bgColor: string;
  textColor: string;
  /** Optional border accent. Pills that omit this render border-less. */
  borderColor?: string;
}

/**
 * Color slots reuse hex values that already appear in
 * `src/constants/colors.ts` and the inline pill styles introduced by
 * PR #76. Title and Registration deliberately share the "Admin purple"
 * slot because the existing palette doesn't expose two distinct purple
 * tones outside of `TECH_PALETTE` (which is reserved for tech identity).
 * The pill label disambiguates them.
 */
const PILL_COLORS: Record<CarfaxRecordCategory, Omit<CarfaxRecordPillSpec, "category" | "label">> = {
  recall: {
    bgColor: "#FEE2E2",
    textColor: "#B91C1C",
    borderColor: "#FCA5A5",
  },
  service: {
    bgColor: "#DBEAFE",
    textColor: "#1D4ED8",
    borderColor: "#BFDBFE",
  },
  inspection: {
    bgColor: "#DCFCE7",
    textColor: "#16A34A",
    borderColor: "#16A34A",
  },
  title: {
    bgColor: "#EDE9FE",
    textColor: "#8B5CF6",
    borderColor: "#8B5CF6",
  },
  registration: {
    bgColor: "#EDE9FE",
    textColor: "#8B5CF6",
    borderColor: "#8B5CF6",
  },
  ownership: {
    bgColor: "#FFF7ED",
    textColor: "#F97316",
    borderColor: "#F97316",
  },
  other: {
    bgColor: "#F3F4F6",
    textColor: "#6B7280",
    borderColor: "#E5E7EB",
  },
};

const CATEGORY_LABELS: Record<CarfaxRecordCategory, string> = {
  recall: "Recall",
  inspection: "Inspection",
  title: "Title",
  registration: "Registration",
  ownership: "Ownership",
  service: "Service",
  other: "Other",
};

/**
 * Trigger phrases per category, evaluated against each entry of the
 * record's `text[]` array as a case-insensitive substring match. Order
 * here is informational; the priority that decides ties lives in
 * `categorizeCarfaxRecord` below.
 */
const TRIGGER_PHRASES: Record<
  Exclude<CarfaxRecordCategory, "recall" | "other">,
  readonly string[]
> = {
  inspection: [
    "safety inspection",
    "emissions inspection",
    "emissions inspections",
    "inspection performed",
    "inspection completed",
    "passed safety",
    "passed emissions",
    "safety and emissions",
  ],
  title: ["title issued", "titled or registered", "title updated"],
  registration: [
    "registration issued",
    "registration renewed",
    "registration updated",
  ],
  ownership: [
    "first owner reported",
    "owner reported",
    "new owner",
    "as personal vehicle",
    "as a fleet vehicle",
    "as a rental vehicle",
    "as a lease",
    "as a corporate vehicle",
  ],
  service: [
    "oil and filter",
    "oil change",
    "engine oil",
    "brake",
    "tire",
    "fluid",
    "vehicle serviced",
    "alignment checked",
    "battery",
    "belt",
    "filter replaced",
    "transmission",
    "coolant",
    "computer/module checked",
    "pre-delivery inspection",
    "engine/powertrain",
  ],
};

/**
 * Priority order — top wins when a record's text matches multiple
 * categories. Recall short-circuits ahead of text matching because
 * `record.type === "recall"` is authoritative on the CARFAX side, and
 * a recall record is always rendered as a single Recall pill (it never
 * co-exists with Service / Inspection / etc).
 *
 * The order here also defines the visual left-to-right order of pills
 * when a single record matches multiple categories.
 */
const PRIORITY: readonly Exclude<CarfaxRecordCategory, "recall" | "other">[] = [
  "inspection",
  "title",
  "registration",
  "ownership",
  "service",
];

function matchesAny(haystack: readonly string[], needles: readonly string[]): boolean {
  for (const line of haystack) {
    const lowered = line.toLowerCase();
    for (const needle of needles) {
      if (lowered.includes(needle)) return true;
    }
  }
  return false;
}

function specFor(category: CarfaxRecordCategory): CarfaxRecordPillSpec {
  return {
    category,
    label: CATEGORY_LABELS[category],
    ...PILL_COLORS[category],
  };
}

/**
 * Primary (highest-priority) category of a record. Retained for any
 * caller that still wants a single label — under the hood it is just
 * the first element of `categorizeCarfaxRecord`.
 */
export function deriveCarfaxRecordCategory(
  record: ServiceHistoryDisplayRecord,
): CarfaxRecordCategory {
  return categorizeCarfaxRecord(record)[0]!.category;
}

/**
 * Returns every pill spec that applies to a record, deduped and sorted
 * by `PRIORITY`. The result is guaranteed to be non-empty: recall
 * records short-circuit to `[recall]` (recall is exclusive — a recall
 * row never displays Service / Inspection / etc alongside it), and any
 * non-recall record with no text matches falls back to `[other]`.
 *
 * "Service" only appears when the text actually matches a service
 * phrase — it is never used as a generic fallback. "Other" is the only
 * fallback, used when zero categories match a non-recall record.
 */
export function categorizeCarfaxRecord(
  record: ServiceHistoryDisplayRecord,
): CarfaxRecordPillSpec[] {
  if ((record.type ?? "").toLowerCase() === "recall") {
    return [specFor("recall")];
  }

  const text = record.text ?? [];
  if (text.length === 0) return [specFor("other")];

  const matched: CarfaxRecordPillSpec[] = [];
  for (const candidate of PRIORITY) {
    if (matchesAny(text, TRIGGER_PHRASES[candidate])) {
      matched.push(specFor(candidate));
    }
  }

  if (matched.length === 0) return [specFor("other")];
  return matched;
}

/**
 * Backward-compatible single-pill helper. New code should prefer
 * `categorizeCarfaxRecord` and render every pill it returns.
 */
export function categorizeCarfaxRecordPrimary(
  record: ServiceHistoryDisplayRecord,
): CarfaxRecordPillSpec {
  return categorizeCarfaxRecord(record)[0]!;
}
