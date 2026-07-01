import {
  formatVehicleDisplayTitle,
  getVehicleMakeModel,
} from '@customer/utils/vehicle-display';
import type { Vehicle } from '@customer/types/api';

const baseVehicle = {
  year: 2020,
  make: 'Honda',
  model: 'Civic',
} as Vehicle;

describe('vehicle-display', () => {
  describe('getVehicleMakeModel', () => {
    it('joins year, make, and model with spaces', () => {
      expect(getVehicleMakeModel(baseVehicle)).toBe('2020 Honda Civic');
    });

    it('returns "Vehicle" for null/undefined', () => {
      expect(getVehicleMakeModel(null)).toBe('Vehicle');
      expect(getVehicleMakeModel(undefined)).toBe('Vehicle');
    });

    it('drops missing fields gracefully', () => {
      expect(
        getVehicleMakeModel({ year: undefined, make: 'Ford', model: 'F-150' } as unknown as Vehicle),
      ).toBe('Ford F-150');
      expect(
        getVehicleMakeModel({ year: 2024, make: undefined, model: 'Model 3' } as unknown as Vehicle),
      ).toBe('2024 Model 3');
    });

    it('falls back to "Vehicle" when nothing is set', () => {
      expect(
        getVehicleMakeModel({ year: undefined, make: undefined, model: undefined } as unknown as Vehicle),
      ).toBe('Vehicle');
    });
  });

  describe('formatVehicleDisplayTitle', () => {
    it('returns just make/model when no nickname', () => {
      expect(formatVehicleDisplayTitle(baseVehicle)).toBe('2020 Honda Civic');
    });

    it('prepends nickname with separator when present', () => {
      expect(
        formatVehicleDisplayTitle({ ...baseVehicle, nickname: "Mom's Car" } as Vehicle),
      ).toBe("Mom's Car · 2020 Honda Civic");
    });

    it('treats whitespace-only nickname as empty', () => {
      expect(
        formatVehicleDisplayTitle({ ...baseVehicle, nickname: '   ' } as Vehicle),
      ).toBe('2020 Honda Civic');
    });

    it('returns "Vehicle" for null/undefined', () => {
      expect(formatVehicleDisplayTitle(null)).toBe('Vehicle');
      expect(formatVehicleDisplayTitle(undefined)).toBe('Vehicle');
    });
  });
});
