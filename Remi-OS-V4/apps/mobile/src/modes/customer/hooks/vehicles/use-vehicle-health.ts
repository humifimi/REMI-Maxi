import { useQuery } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type {
  ApiResponse, HealthScoreSnapshot, HealthScore,
  TireTreadRecord, FluidLevelRecord, ManufacturerRecommendation,
  VehicleHealthComposite,
} from '@customer/types/api';

/**
 * Fetch the real, server-computed health score for a vehicle.
 *
 * Returns `null` (not a fabricated score) when:
 *   - the backend has no snapshot yet (404 / empty payload), or
 *   - the snapshot has `overall_score === 0` (placeholder).
 *
 * Consumers must show an honest empty state — never invent a score from
 * the vehicle's metadata. This used to fall back to `computeVehicleHealthScore`,
 * which produced realistic-looking 60–80 numbers from `id * 17` style seeds
 * for brand-new accounts with zero service data. That was the "bogus health
 * pill" the customer reported.
 */
export function useVehicleHealth(vehicleId: number | undefined, _vehicle?: unknown) {
  return useQuery({
    queryKey: ['vehicleHealth', vehicleId],
    queryFn: async (): Promise<HealthScore | null> => {
      try {
        const { data } = await apiClient.get<ApiResponse<HealthScoreSnapshot>>(
          ENDPOINTS.VEHICLES.HEALTH(vehicleId!)
        );
        const s = data.data;
        if (s && s.overall_score > 0) {
          return {
            overall: s.overall_score,
            components: {
              oil: s.oil_life_score,
              filter: s.filter_score,
              tires: s.tire_score,
              wipers: s.wiper_score,
              brakes: s.brake_score ?? 0,
              fluids: s.fluid_score ?? 0,
            },
          };
        }
        return null;
      } catch {
        return null;
      }
    },
    enabled: !!vehicleId,
    staleTime: 60_000,
  });
}

export function useTreadHistory(vehicleId: number | undefined) {
  return useQuery({
    queryKey: ['treadHistory', vehicleId],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<TireTreadRecord[]>>(
        ENDPOINTS.VEHICLES.TREAD_HISTORY(vehicleId!),
      );
      return data.data ?? [];
    },
    enabled: !!vehicleId,
    staleTime: 120_000,
    retry: 1,
  });
}

export function useFluidHistory(vehicleId: number | undefined) {
  return useQuery({
    queryKey: ['fluidHistory', vehicleId],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<FluidLevelRecord[]>>(
        ENDPOINTS.VEHICLES.FLUID_HISTORY(vehicleId!),
      );
      return data.data ?? [];
    },
    enabled: !!vehicleId,
    staleTime: 120_000,
    retry: 1,
  });
}

/**
 * Fetch the full vehicle-health composite (score, trend, next-due,
 * deferred items, history, OEM recs).
 *
 * Returns `null` on any failure or empty response. Consumers MUST handle
 * the null case with an honest empty state. This used to silently fall
 * back to `buildDemoComposite`, which produced six months of fake trend
 * data, a 4-row fake service history (Mike R., Sarah T., James L.), and
 * five fake OEM recommendations for brand-new accounts.
 */
export function useVehicleHealthComposite(vehicleId: number | undefined) {
  return useQuery({
    queryKey: ['vehicleHealthComposite', vehicleId],
    queryFn: async (): Promise<VehicleHealthComposite | null> => {
      try {
        const { data } = await apiClient.get<ApiResponse<VehicleHealthComposite>>(
          ENDPOINTS.VEHICLES.HEALTH_COMPOSITE(vehicleId!),
        );
        return data.data ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!vehicleId,
    staleTime: 60_000,
  });
}

export function useOemRecommendations(vehicleId: number | undefined) {
  return useQuery({
    queryKey: ['oemRecommendations', vehicleId],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<ManufacturerRecommendation[]>>(
        ENDPOINTS.VEHICLES.RECOMMENDATIONS(vehicleId!),
      );
      return data.data ?? [];
    },
    enabled: !!vehicleId,
    staleTime: 120_000,
    retry: 1,
  });
}
