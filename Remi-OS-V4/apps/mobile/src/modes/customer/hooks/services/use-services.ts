import { useQuery } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse, Service } from '@customer/types/api';

const FALLBACK_SERVICES: Service[] = [
  { id: 1, name: 'Small Oil Change', description: 'Up to 5 quarts conventional oil + standard filter', base_price: 54.99, duration_minutes: 20, is_active: true, category: 'oil_change', health_component: 'oil', created_at: '', updated_at: '' },
  { id: 2, name: 'Medium Oil Change', description: 'Up to 5 quarts full synthetic oil + premium filter', base_price: 89.99, duration_minutes: 25, is_active: true, category: 'oil_change', health_component: 'oil', created_at: '', updated_at: '' },
  { id: 3, name: 'Large Oil Change', description: 'Up to 8 quarts full synthetic oil + premium filter', base_price: 124.99, duration_minutes: 30, is_active: true, category: 'oil_change', health_component: 'oil', created_at: '', updated_at: '' },
  { id: 4, name: 'Diesel Oil Change', description: 'Diesel-rated CK-4 oil + filter, up to 12 quarts', base_price: 164.99, duration_minutes: 40, is_active: true, category: 'oil_change', health_component: 'oil', created_at: '', updated_at: '' },
  { id: 5, name: 'European Oil Change', description: 'Euro-spec synthetic oil + OEM-grade filter', base_price: 144.99, duration_minutes: 35, is_active: true, category: 'oil_change', health_component: 'oil', created_at: '', updated_at: '' },
  { id: 6, name: 'Air Filter Replacement', description: 'Engine air filter replacement', base_price: 44.99, duration_minutes: 10, is_active: true, category: 'filter', health_component: 'filter', created_at: '', updated_at: '' },
  { id: 7, name: 'Cabin Air Filter', description: 'Cabin air filter replacement', base_price: 49.99, duration_minutes: 10, is_active: true, category: 'filter', health_component: 'filter', created_at: '', updated_at: '' },
  { id: 8, name: 'Wiper Blade Replacement', description: 'Front wiper blades (pair)', base_price: 34.99, duration_minutes: 10, is_active: true, category: 'wiper', health_component: 'wiper', created_at: '', updated_at: '' },
  { id: 9, name: 'Tire Rotation', description: 'Rotate all four tires', base_price: 29.99, duration_minutes: 20, is_active: true, category: 'tire', health_component: 'tire', created_at: '', updated_at: '' },
  { id: 10, name: 'Brake Inspection', description: 'Visual brake pad and rotor inspection with measurement', base_price: 39.99, duration_minutes: 20, is_active: true, category: 'brake', health_component: 'brakes', created_at: '', updated_at: '' },
  { id: 11, name: 'Brake Pad Replacement', description: 'Front or rear brake pad replacement (per axle)', base_price: 189.99, duration_minutes: 60, is_active: true, category: 'brake', health_component: 'brakes', created_at: '', updated_at: '' },
  { id: 12, name: 'Coolant Flush', description: 'Full coolant system drain, flush, and refill', base_price: 119.99, duration_minutes: 45, is_active: true, category: 'fluid', health_component: 'fluids', created_at: '', updated_at: '' },
  { id: 13, name: 'Transmission Fluid Service', description: 'Transmission fluid drain and refill', base_price: 149.99, duration_minutes: 45, is_active: true, category: 'fluid', health_component: 'fluids', created_at: '', updated_at: '' },
  { id: 14, name: 'Multi-Point Inspection', description: 'Comprehensive vehicle health check — brakes, fluids, tires, belts, and more', base_price: 49.99, duration_minutes: 30, is_active: true, category: 'inspection', health_component: null, created_at: '', updated_at: '' },
];

export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: async (): Promise<Service[]> => {
      try {
        const { data } = await apiClient.get<ApiResponse<Service[]>>(ENDPOINTS.SERVICES.LIST);
        return data.data.map((s) => ({ ...s, base_price: Number(s.base_price) }));
      } catch {
        return FALLBACK_SERVICES;
      }
    },
    staleTime: 5 * 60_000,
  });
}
