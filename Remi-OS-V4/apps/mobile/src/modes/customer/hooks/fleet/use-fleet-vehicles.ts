import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse } from '@customer/types/api';
import type {
  FleetVehicleCard,
  FleetVehicleDetail,
  FleetDriver,
  FleetServiceHistoryEntry,
  FleetDeferredItem,
  FleetInspectionEntry,
  FleetDueSoonItem,
} from '@customer/types/fleet';

const MOCK_DRIVERS: FleetDriver[] = [
  { id: 1, name: 'Marcus Rivera', email: 'marcus@fleet.com', phone: '555-0101', assigned_vehicle_ids: [1], status: 'active' },
  { id: 2, name: 'Priya Sharma', email: 'priya@fleet.com', phone: '555-0102', assigned_vehicle_ids: [2], status: 'active' },
  { id: 3, name: 'Jake Lawson', email: 'jake@fleet.com', phone: '555-0103', assigned_vehicle_ids: [3], status: 'active' },
  { id: 4, name: 'Aisha Patel', email: 'aisha@fleet.com', phone: '555-0104', assigned_vehicle_ids: [4], status: 'active' },
];

function buildMockVehicles(): FleetVehicleCard[] {
  const now = new Date();

  return [
    {
      id: 1, year: 2023, make: 'Ford', model: 'Transit', license_plate: 'FLT-001',
      assigned_driver: MOCK_DRIVERS[0], health_score: 82,
      last_service_date: new Date(now.getTime() - 5 * 86400000).toISOString(),
      next_due_indicator: 'on_track', inspection_status: 'current', deferred_item_count: 0,
    },
    {
      id: 2, year: 2022, make: 'Chevrolet', model: 'Express', license_plate: 'FLT-002',
      assigned_driver: MOCK_DRIVERS[1], health_score: 61,
      last_service_date: new Date(now.getTime() - 18 * 86400000).toISOString(),
      next_due_indicator: 'due_soon', inspection_status: 'due_soon', deferred_item_count: 2,
    },
    {
      id: 3, year: 2021, make: 'RAM', model: 'ProMaster', license_plate: 'FLT-003',
      assigned_driver: MOCK_DRIVERS[2], health_score: 38,
      last_service_date: new Date(now.getTime() - 45 * 86400000).toISOString(),
      next_due_indicator: 'overdue', inspection_status: 'overdue', deferred_item_count: 4,
    },
    {
      id: 4, year: 2024, make: 'Ford', model: 'E-Transit', license_plate: 'FLT-004',
      assigned_driver: MOCK_DRIVERS[3], health_score: 91,
      last_service_date: new Date(now.getTime() - 2 * 86400000).toISOString(),
      next_due_indicator: 'on_track', inspection_status: 'current', deferred_item_count: 0,
    },
    {
      id: 5, year: 2023, make: 'Mercedes-Benz', model: 'Sprinter', license_plate: 'FLT-005',
      assigned_driver: null, health_score: 54, last_service_date: null,
      next_due_indicator: 'due_soon', inspection_status: 'never', deferred_item_count: 3,
    },
  ];
}

function buildMockVehicleDetail(vehicleId: number): FleetVehicleDetail {
  const now = new Date();
  const vehicles = buildMockVehicles();
  const card = vehicles.find((v) => v.id === vehicleId) ?? vehicles[0];

  const serviceHistory: FleetServiceHistoryEntry[] = [
    { id: 101, date: new Date(now.getTime() - 5 * 86400000).toISOString(), services: ['Oil Change', 'Filter Replacement'], technician_name: 'Tony M.', cost: 89.99, status: 'completed' },
    { id: 102, date: new Date(now.getTime() - 35 * 86400000).toISOString(), services: ['Tire Rotation'], technician_name: 'Sarah K.', cost: 49.99, status: 'completed' },
    { id: 103, date: new Date(now.getTime() - 90 * 86400000).toISOString(), services: ['Brake Inspection', 'Fluid Top-Off'], technician_name: 'Tony M.', cost: 129.50, status: 'completed' },
  ];

  const deferredItems: FleetDeferredItem[] = card.deferred_item_count > 0
    ? [
      { id: 201, observation_type: 'brake_pad_wear', severity: 'high', technician_notes: 'Rear pads at 2mm — replace soon', estimated_cost: 189.99, recommended_service: 'Brake Pad Replacement', created_at: new Date(now.getTime() - 5 * 86400000).toISOString() },
      { id: 202, observation_type: 'tire_tread_low', severity: 'medium', technician_notes: 'Front left tread at 3/32"', estimated_cost: 149.99, recommended_service: 'Tire Replacement', created_at: new Date(now.getTime() - 5 * 86400000).toISOString() },
      ...(card.deferred_item_count > 2 ? [
        { id: 203, observation_type: 'fluid_low', severity: 'low' as const, technician_notes: 'Coolant slightly below min', estimated_cost: 39.99, recommended_service: 'Coolant Flush', created_at: new Date(now.getTime() - 35 * 86400000).toISOString() },
        { id: 204, observation_type: 'wiper_worn', severity: 'low' as const, technician_notes: 'Streaking on passenger side', estimated_cost: 29.99, recommended_service: 'Wiper Replacement', created_at: new Date(now.getTime() - 35 * 86400000).toISOString() },
      ] : []),
    ]
    : [];

  const inspectionHistory: FleetInspectionEntry[] = [
    { id: 301, date: new Date(now.getTime() - 7 * 86400000).toISOString(), driver_name: card.assigned_driver?.name ?? null, score: 88, flagged_items: 1, status: 'flagged' },
    { id: 302, date: new Date(now.getTime() - 37 * 86400000).toISOString(), driver_name: card.assigned_driver?.name ?? null, score: 95, flagged_items: 0, status: 'passed' },
    { id: 303, date: new Date(now.getTime() - 67 * 86400000).toISOString(), driver_name: card.assigned_driver?.name ?? null, score: 92, flagged_items: 0, status: 'passed' },
  ];

  const dueSoon: FleetDueSoonItem[] = [
    { id: 401, service_name: 'Oil Change', component: 'oil', due_date: new Date(now.getTime() + 15 * 86400000).toISOString(), due_mileage: 78500, days_remaining: 15, miles_remaining: 1200, urgency: 'upcoming' },
    { id: 402, service_name: 'Tire Rotation', component: 'tires', due_date: new Date(now.getTime() + 30 * 86400000).toISOString(), due_mileage: 80000, days_remaining: 30, miles_remaining: 2700, urgency: 'on_track' },
  ];

  return {
    id: card.id,
    year: card.year,
    make: card.make,
    model: card.model,
    license_plate: card.license_plate,
    vin: `1FTBW2CM${card.id}KKA1234${card.id}`,
    photo_url: null,
    health_score: card.health_score,
    health_components: {
      oil: Math.min(100, card.health_score + 8),
      tires: Math.max(20, card.health_score - 10),
      brakes: Math.max(15, card.health_score - 15),
      filters: Math.min(100, card.health_score + 5),
      wipers: Math.min(100, card.health_score + 12),
      fluids: Math.min(100, card.health_score + 3),
    },
    assigned_driver: card.assigned_driver,
    service_history: serviceHistory,
    deferred_items: deferredItems,
    inspection_history: inspectionHistory,
    due_soon: dueSoon,
  };
}

// TODO: Replace mock with GET /customer/fleet/vehicles when backend BE-23 is ready
export function useFleetVehicles() {
  return useQuery({
    queryKey: ['fleetVehicles'],
    queryFn: async (): Promise<FleetVehicleCard[]> => {
      try {
        const { data } = await apiClient.get<ApiResponse<FleetVehicleCard[]>>(
          ENDPOINTS.FLEET.VEHICLES,
        );
        return data.data;
      } catch {
        return buildMockVehicles();
      }
    },
    staleTime: 60_000,
  });
}

// TODO: Replace mock with GET /customer/fleet/vehicles/:id when backend BE-23 is ready
export function useFleetVehicle(vehicleId: number) {
  return useQuery({
    queryKey: ['fleetVehicle', vehicleId],
    queryFn: async (): Promise<FleetVehicleDetail> => {
      try {
        const { data } = await apiClient.get<ApiResponse<FleetVehicleDetail>>(
          ENDPOINTS.FLEET.VEHICLE_DETAIL(vehicleId),
        );
        return data.data;
      } catch {
        return buildMockVehicleDetail(vehicleId);
      }
    },
    staleTime: 60_000,
    enabled: vehicleId > 0,
  });
}

// TODO: Replace mock with PUT /customer/fleet/vehicles/:vehicleId/assign-driver when backend BE-23 is ready
export function useReassignDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ vehicleId, driverId }: { vehicleId: number; driverId: number | null }) => {
      const { data } = await apiClient.put<ApiResponse<{ success: boolean }>>(
        ENDPOINTS.FLEET.REASSIGN_DRIVER(vehicleId),
        { driver_id: driverId },
      );
      return data.data;
    },
    onSuccess: (_data, { vehicleId }) => {
      queryClient.invalidateQueries({ queryKey: ['fleetVehicle', vehicleId] });
      queryClient.invalidateQueries({ queryKey: ['fleetVehicles'] });
      queryClient.invalidateQueries({ queryKey: ['fleetDrivers'] });
    },
  });
}
