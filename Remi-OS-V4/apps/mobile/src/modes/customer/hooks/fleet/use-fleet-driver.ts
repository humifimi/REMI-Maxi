import { useQuery } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse } from '@customer/types/api';
import type { FleetDriverVehicleInfo } from '@customer/types/fleet';

// ---------------------------------------------------------------------------
// Mock data — TODO: Replace with API call when backend BE-24 is ready
// ---------------------------------------------------------------------------

function buildMockDriverVehicle(): FleetDriverVehicleInfo {
  const now = new Date();
  return {
    vehicle_id: 1,
    vehicle_name: '2022 Ford Transit',
    license_plate: 'FLT-001',
    health_score: 78,
    next_due_service: 'Oil Change',
    next_due_date: new Date(now.getTime() + 12 * 86400000).toISOString(),
    inspection_status: 'due_soon',
    last_inspection_date: new Date(now.getTime() - 20 * 86400000).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFleetDriverVehicle(enabled = true) {
  return useQuery({
    queryKey: ['fleetDriverVehicle'],
    queryFn: async (): Promise<FleetDriverVehicleInfo> => {
      try {
        const { data } = await apiClient.get<ApiResponse<FleetDriverVehicleInfo>>(
          ENDPOINTS.FLEET.DRIVER_VEHICLE,
        );
        return data.data;
      } catch {
        // TODO: Replace mock with API call when backend BE-24 is ready
        return buildMockDriverVehicle();
      }
    },
    enabled,
    staleTime: 60_000,
  });
}
