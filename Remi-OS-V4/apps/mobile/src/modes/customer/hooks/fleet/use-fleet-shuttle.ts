import { useQuery } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse } from '@customer/types/api';
import type { FleetShuttleData, ShuttleTimelineEntry } from '@customer/types/fleet';

// ---------------------------------------------------------------------------
// Mock data — TODO: Replace with API call when backend BE-24 is ready
// ---------------------------------------------------------------------------

function buildMockShuttle(shuttleId: number): FleetShuttleData {
  const timeline: ShuttleTimelineEntry[] = [
    { status: 'pickup', label: 'Pickup Scheduled', timestamp: new Date(Date.now() - 60 * 60000).toISOString(), is_current: false },
    { status: 'in_transit', label: 'In Transit', timestamp: new Date(Date.now() - 20 * 60000).toISOString(), is_current: true },
    { status: 'in_service', label: 'In Service', timestamp: null, is_current: false },
    { status: 'returning', label: 'Returning', timestamp: null, is_current: false },
    { status: 'completed', label: 'Completed', timestamp: null, is_current: false },
  ];

  return {
    id: shuttleId,
    appointment_id: 100,
    vehicle_id: 1,
    vehicle_name: '2022 Ford Transit',
    status: 'in_transit',
    driver_name: 'Carlos Mendez',
    driver_phone: '+15551234567',
    pickup_address: {
      street: '123 Fleet Way',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      latitude: 30.2672,
      longitude: -97.7431,
    },
    delivery_address: {
      street: '456 Service Blvd',
      city: 'Austin',
      state: 'TX',
      zip: '78702',
      latitude: 30.2622,
      longitude: -97.7261,
    },
    partner_shop_name: 'REMI Service Center — Austin',
    partner_shop_phone: '+15559876543',
    eta_minutes: 12,
    location: {
      latitude: 30.2648,
      longitude: -97.7350,
      heading: 135,
      updated_at: new Date().toISOString(),
    },
    timeline,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFleetShuttle(shuttleId: number | null) {
  return useQuery({
    queryKey: ['fleetShuttle', shuttleId],
    queryFn: async (): Promise<FleetShuttleData> => {
      try {
        const { data } = await apiClient.get<ApiResponse<FleetShuttleData>>(
          ENDPOINTS.FLEET.SHUTTLE(shuttleId!),
        );
        return data.data;
      } catch {
        // TODO: Replace mock with API call when backend BE-24 is ready
        return buildMockShuttle(shuttleId!);
      }
    },
    enabled: shuttleId != null,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}
