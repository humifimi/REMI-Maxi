import type { DecodedVehicle, QuickVinLookupResult } from "@technician/types/api";

/** Map a Carfax QuickVIN response into the shared decode shape job flows expect. */
export function quickVinToDecodedVehicle(
  data: QuickVinLookupResult,
): DecodedVehicle {
  const yearNum = data.year ? Number.parseInt(data.year, 10) : NaN;
  return {
    vin: data.vin,
    year: Number.isFinite(yearNum) ? yearNum : null,
    make: data.make || null,
    model: data.model || null,
    engine: null,
    base_vehicle_id: null,
  };
}
