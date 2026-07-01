import type { Vehicle, Service } from '@customer/types/api';

interface OilSpec {
  weight: string;
  capacity: string;
  type: string;
}

interface VehicleSpec {
  oil: OilSpec;
  tireRotation?: string;
  cabinFilter?: string;
  airFilter?: string;
  brakes?: string;
  wipers?: string;
}

const VEHICLE_SPECS: Record<string, VehicleSpec> = {
  '2022-toyota-camry': {
    oil: { weight: '0W-16', capacity: '4.8 qt', type: 'full synthetic' },
    tireRotation: 'Every 5,000 mi',
    cabinFilter: 'Every 20,000 mi',
    airFilter: 'Every 30,000 mi',
    brakes: 'Inspect every 5,000 mi',
    wipers: '26" + 16" beam blades',
  },
  '2021-honda-civic': {
    oil: { weight: '0W-20', capacity: '4.4 qt', type: 'full synthetic' },
    tireRotation: 'Every 7,500 mi',
    cabinFilter: 'Every 15,000 mi',
    airFilter: 'Every 15,000 mi',
    brakes: 'Inspect every 7,500 mi',
    wipers: '26" + 18" beam blades',
  },
  '2023-toyota-rav4': {
    oil: { weight: '0W-16', capacity: '4.8 qt', type: 'full synthetic' },
    tireRotation: 'Every 5,000 mi',
    cabinFilter: 'Every 20,000 mi',
    airFilter: 'Every 30,000 mi',
    brakes: 'Inspect every 5,000 mi',
    wipers: '26" + 16" beam blades',
  },
  '2024-honda-crv': {
    oil: { weight: '0W-20', capacity: '4.6 qt', type: 'full synthetic' },
    tireRotation: 'Every 7,500 mi',
    cabinFilter: 'Every 15,000 mi',
    airFilter: 'Every 15,000 mi',
    brakes: 'Inspect every 7,500 mi',
    wipers: '26" + 17" beam blades',
  },
  '2022-ford-f150': {
    oil: { weight: '5W-30', capacity: '6.0 qt', type: 'full synthetic' },
    tireRotation: 'Every 10,000 mi',
    cabinFilter: 'Every 20,000 mi',
    airFilter: 'Every 30,000 mi',
    brakes: 'Inspect every 10,000 mi',
    wipers: '22" + 22" beam blades',
  },
  '2021-chevrolet-equinox': {
    oil: { weight: '5W-30', capacity: '5.0 qt', type: 'full synthetic (dexos1)' },
    tireRotation: 'Every 7,500 mi',
    cabinFilter: 'Every 22,500 mi',
    airFilter: 'Every 45,000 mi',
    brakes: 'Inspect every 7,500 mi',
    wipers: '24" + 17" beam blades',
  },
  '2023-ford-f-250-super-duty': {
    oil: { weight: '15W-40', capacity: '13.0 qt', type: 'diesel (CK-4)' },
    tireRotation: 'Every 10,000 mi',
    cabinFilter: 'Every 20,000 mi',
    airFilter: 'Every 30,000 mi',
    brakes: 'Inspect every 10,000 mi',
    wipers: '22" + 22" beam blades',
  },
};

function buildKey(vehicle: Vehicle): string {
  const year = vehicle.year ?? 0;
  const make = (vehicle.make ?? '').toLowerCase().trim();
  const model = (vehicle.model ?? '').toLowerCase().trim().replace(/\s+/g, '-');
  return `${year}-${make}-${model}`;
}

function getSpec(vehicle: Vehicle | null | undefined): VehicleSpec | null {
  if (!vehicle) return null;
  return VEHICLE_SPECS[buildKey(vehicle)] ?? null;
}

function makeLabel(vehicle: Vehicle): string {
  return vehicle.nickname?.trim() || `${vehicle.year} ${vehicle.make}` || 'your vehicle';
}

/**
 * Returns a vehicle-specific note for a service, e.g.
 * "Your Camry · 0W-16 full synthetic, 4.8 qt"
 *
 * Pass `bestOilId` (from `getBestOilServiceId`) to mark the best-match oil
 * service with a checkmark prefix.
 */
export function getVehicleServiceNote(
  service: Service,
  vehicle: Vehicle | null | undefined,
  bestOilId?: number | null,
): string | null {
  if (!vehicle) return null;
  const spec = getSpec(vehicle);
  if (!spec) return null;

  const name = service.name.toLowerCase();
  const cat = service.category?.toLowerCase() ?? '';
  const label = makeLabel(vehicle);

  if (cat.includes('oil') || name.includes('oil change')) {
    const isDieselService = name.includes('diesel');
    const isEuro = name.includes('european') || name.includes('euro');
    const vehicleIsDiesel = spec.oil.type.includes('diesel');

    if (isDieselService && !vehicleIsDiesel) return null;
    if (!isDieselService && vehicleIsDiesel) return null;
    if (isEuro) return null;

    const { weight, capacity, type } = spec.oil;
    const base = `${label} · ${weight} ${type}, ${capacity}`;
    return bestOilId === service.id ? `✓ Best match · ${weight} ${type}, ${capacity}` : base;
  }

  if (name.includes('tire rotation') && spec.tireRotation) {
    return `${label} · ${spec.tireRotation}`;
  }

  if (name.includes('cabin') && name.includes('filter') && spec.cabinFilter) {
    return `${label} · ${spec.cabinFilter}`;
  }

  if ((name.includes('air filter') && !name.includes('cabin')) && spec.airFilter) {
    return `${label} · ${spec.airFilter}`;
  }

  if (cat.includes('brake') && spec.brakes) {
    return `${label} · ${spec.brakes}`;
  }

  if ((cat.includes('wiper') || name.includes('wiper')) && spec.wipers) {
    return `${label} · ${spec.wipers}`;
  }

  return null;
}

/**
 * Returns a vehicle-specific note for a health component key
 * (e.g. "oil", "brakes", "tires", "cabin_filter", "wipers").
 * Used on the Vehicle Health screen's Next Due Services list.
 */
export function getComponentNote(
  component: string,
  vehicle: Vehicle | null | undefined,
): string | null {
  if (!vehicle) return null;
  const spec = getSpec(vehicle);
  if (!spec) return null;

  const label = makeLabel(vehicle);
  const key = component.toLowerCase();

  if (key === 'oil' || key === 'oil_change') {
    const { weight, type, capacity } = spec.oil;
    return `${label} · ${weight} ${type}, ${capacity}`;
  }
  if (key === 'brakes' || key === 'brake') return spec.brakes ? `${label} · ${spec.brakes}` : null;
  if (key === 'tires' || key === 'tire_rotation') return spec.tireRotation ? `${label} · ${spec.tireRotation}` : null;
  if (key === 'cabin_filter' || key === 'cabin_air_filter') return spec.cabinFilter ? `${label} · Replace ${spec.cabinFilter.toLowerCase()}` : null;
  if (key === 'air_filter') return spec.airFilter ? `${label} · Replace ${spec.airFilter.toLowerCase()}` : null;
  if (key === 'wipers' || key === 'wiper') return spec.wipers ? `${label} · ${spec.wipers}` : null;
  if (key === 'filter') return spec.cabinFilter ? `${label} · Cabin ${spec.cabinFilter.toLowerCase()}, air ${spec.airFilter?.toLowerCase() ?? 'N/A'}` : null;

  return null;
}

/**
 * For oil changes, returns which specific service best matches the vehicle's spec.
 * Used to determine the "best match" oil change for highlighting.
 */
export function getBestOilServiceId(
  services: Service[],
  vehicle: Vehicle | null | undefined,
): number | null {
  if (!vehicle) return null;
  const spec = getSpec(vehicle);
  if (!spec) return null;

  const oilServices = services.filter(
    (s) => (s.category?.toLowerCase().includes('oil') || s.name.toLowerCase().includes('oil change')),
  );

  if (oilServices.length === 0) return null;

  const { weight, capacity, type } = spec.oil;
  const qts = parseFloat(capacity);

  if (type.includes('diesel')) {
    const diesel = oilServices.find((s) => s.name.toLowerCase().includes('diesel'));
    return diesel?.id ?? null;
  }

  if (weight === '0W-16') {
    const medium = oilServices.find((s) => s.name.toLowerCase().includes('medium'));
    return medium?.id ?? null;
  }

  if (qts <= 4.5) {
    const small = oilServices.find((s) => s.name.toLowerCase().includes('small'));
    return small?.id ?? null;
  }
  if (qts <= 5.5) {
    const medium = oilServices.find((s) => s.name.toLowerCase().includes('medium'));
    return medium?.id ?? null;
  }
  const large = oilServices.find((s) => s.name.toLowerCase().includes('large'));
  return large?.id ?? null;
}
