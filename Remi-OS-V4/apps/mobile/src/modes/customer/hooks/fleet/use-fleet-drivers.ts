import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse } from '@customer/types/api';
import type { FleetDriverDetail } from '@customer/types/fleet';

// TODO: Replace mock with GET /customer/fleet/drivers when backend BE-23 is ready
function buildMockDrivers(): FleetDriverDetail[] {
  const now = new Date();

  return [
    {
      id: 1, name: 'Marcus Rivera', email: 'marcus@fleet.com', phone: '555-0101',
      assigned_vehicle_ids: [1], status: 'active',
      assigned_vehicles: [{ id: 1, year: 2023, make: 'Ford', model: 'Transit', license_plate: 'FLT-001', health_score: 82 }],
      inspection_compliance: '4/4 on time', inspections_on_time: 4, inspections_total: 4, inspections_overdue: 0,
      last_inspection_date: new Date(now.getTime() - 7 * 86400000).toISOString(),
      service_history: [
        { id: 101, date: new Date(now.getTime() - 5 * 86400000).toISOString(), services: ['Oil Change'], technician_name: 'Tony M.', cost: 49.99, status: 'completed' },
      ],
    },
    {
      id: 2, name: 'Priya Sharma', email: 'priya@fleet.com', phone: '555-0102',
      assigned_vehicle_ids: [2], status: 'active',
      assigned_vehicles: [{ id: 2, year: 2022, make: 'Chevrolet', model: 'Express', license_plate: 'FLT-002', health_score: 61 }],
      inspection_compliance: '3/4 on time', inspections_on_time: 3, inspections_total: 4, inspections_overdue: 1,
      last_inspection_date: new Date(now.getTime() - 18 * 86400000).toISOString(),
      service_history: [
        { id: 102, date: new Date(now.getTime() - 18 * 86400000).toISOString(), services: ['Brake Check', 'Tire Rotation'], technician_name: 'Sarah K.', cost: 119.99, status: 'completed' },
      ],
    },
    {
      id: 3, name: 'Jake Lawson', email: 'jake@fleet.com', phone: '555-0103',
      assigned_vehicle_ids: [3], status: 'active',
      assigned_vehicles: [{ id: 3, year: 2021, make: 'RAM', model: 'ProMaster', license_plate: 'FLT-003', health_score: 38 }],
      inspection_compliance: '1/4 on time', inspections_on_time: 1, inspections_total: 4, inspections_overdue: 2,
      last_inspection_date: new Date(now.getTime() - 45 * 86400000).toISOString(),
      service_history: [
        { id: 103, date: new Date(now.getTime() - 45 * 86400000).toISOString(), services: ['Full Service'], technician_name: 'Tony M.', cost: 249.99, status: 'completed' },
      ],
    },
    {
      id: 4, name: 'Aisha Patel', email: 'aisha@fleet.com', phone: '555-0104',
      assigned_vehicle_ids: [4], status: 'active',
      assigned_vehicles: [{ id: 4, year: 2024, make: 'Ford', model: 'E-Transit', license_plate: 'FLT-004', health_score: 91 }],
      inspection_compliance: '4/4 on time', inspections_on_time: 4, inspections_total: 4, inspections_overdue: 0,
      last_inspection_date: new Date(now.getTime() - 2 * 86400000).toISOString(),
      service_history: [
        { id: 104, date: new Date(now.getTime() - 2 * 86400000).toISOString(), services: ['Tire Rotation'], technician_name: 'Sarah K.', cost: 49.99, status: 'completed' },
      ],
    },
  ];
}

export function useFleetDrivers() {
  return useQuery({
    queryKey: ['fleetDrivers'],
    queryFn: async (): Promise<FleetDriverDetail[]> => {
      try {
        const { data } = await apiClient.get<ApiResponse<FleetDriverDetail[]>>(
          ENDPOINTS.FLEET.DRIVERS,
        );
        return data.data;
      } catch {
        return buildMockDrivers();
      }
    },
    staleTime: 60_000,
  });
}

export function useFleetDriver(driverId: number) {
  return useQuery({
    queryKey: ['fleetDriver', driverId],
    queryFn: async (): Promise<FleetDriverDetail> => {
      try {
        const { data } = await apiClient.get<ApiResponse<FleetDriverDetail>>(
          ENDPOINTS.FLEET.DRIVER_DETAIL(driverId),
        );
        return data.data;
      } catch {
        const all = buildMockDrivers();
        return all.find((d) => d.id === driverId) ?? all[0];
      }
    },
    staleTime: 60_000,
    enabled: driverId > 0,
  });
}

// TODO: Replace mock with POST /customer/fleet/drivers/invite when backend BE-23 is ready
export function useInviteDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, name }: { email: string; name: string }) => {
      const { data } = await apiClient.post<ApiResponse<{ invited: boolean }>>(
        ENDPOINTS.FLEET.INVITE_DRIVER,
        { email, name },
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleetDrivers'] });
    },
  });
}
