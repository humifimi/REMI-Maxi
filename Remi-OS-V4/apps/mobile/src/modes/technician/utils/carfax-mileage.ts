import type { ServiceHistoryResult } from "@technician/types/api";

export function parseOdometerString(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const parsed = parseInt(String(raw).replace(/,/g, ""), 10);
  return !isNaN(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Mileage to prefill on Confirm Vehicle / Add Vehicle flows.
 * Prefers the latest display record (index 0), then the highest
 * odometer across all CARFAX records and service categories.
 */
export function getCarfaxPrefillMileage(
  data: ServiceHistoryResult | undefined | null
): number | null {
  if (!data?.serviceHistory) return null;

  const { displayRecords, serviceCategories } = data.serviceHistory;

  const latest = parseOdometerString(displayRecords?.[0]?.odometer);
  if (latest != null) return latest;

  let highest = 0;

  if (displayRecords) {
    for (const record of displayRecords) {
      const parsed = parseOdometerString(record.odometer);
      if (parsed != null && parsed > highest) highest = parsed;
    }
  }

  if (serviceCategories) {
    for (const cat of serviceCategories) {
      const parsed = parseOdometerString(cat.odometerOfLastService);
      if (parsed != null && parsed > highest) highest = parsed;
    }
  }

  return highest > 0 ? highest : null;
}

export function parseManualMileageInput(text: string): number | undefined {
  const parsed = parseOdometerString(text.trim());
  return parsed ?? undefined;
}
