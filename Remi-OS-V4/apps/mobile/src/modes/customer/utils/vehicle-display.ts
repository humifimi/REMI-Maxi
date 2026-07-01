import type { Vehicle } from '@customer/types/api';

export function getVehicleMakeModel(
  v: Pick<Vehicle, 'year' | 'make' | 'model'> | null | undefined
): string {
  if (!v) return 'Vehicle';
  return [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle';
}

/** Nickname shown with make/model when set (e.g. "Mom's Car · 2020 Honda Civic"). */
export function formatVehicleDisplayTitle(v: Vehicle | null | undefined): string {
  if (!v) return 'Vehicle';
  const mm = getVehicleMakeModel(v);
  const nick = v.nickname?.trim();
  return nick ? `${nick} · ${mm}` : mm;
}
