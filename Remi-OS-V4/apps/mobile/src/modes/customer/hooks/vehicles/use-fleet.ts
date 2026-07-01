import { useQuery } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse, FleetComplianceSummary, HealthTrendPoint } from '@customer/types/api';
import type {
  FleetComplianceEnhanced,
  FleetComplianceVehicle,
  FleetDriverCompliance,
  ComplianceTimePeriod,
} from '@customer/types/fleet';

// TODO: Replace mock with GET /customer/fleet/compliance when backend BE-23 is ready
function buildMockComplianceEnhanced(): FleetComplianceEnhanced {
  const now = new Date();
  const trend: { month: string; score: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    trend.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      score: Math.round(68 + Math.random() * 18),
    });
  }

  const overdueVehicles: FleetComplianceVehicle[] = [
    {
      vehicle_id: 3, vehicle_name: '2021 RAM ProMaster', license_plate: 'FLT-003',
      assigned_driver: 'Jake Lawson', health_score: 38, days_overdue: 15,
      last_inspection_date: new Date(now.getTime() - 45 * 86400000).toISOString(),
      inspection_status: 'overdue', outstanding_service_items: 4,
    },
    {
      vehicle_id: 5, vehicle_name: '2023 Mercedes Sprinter', license_plate: 'FLT-005',
      assigned_driver: null, health_score: 54, days_overdue: 30,
      last_inspection_date: null,
      inspection_status: 'never', outstanding_service_items: 3,
    },
  ];

  const dueSoonVehicles: FleetComplianceVehicle[] = [
    {
      vehicle_id: 2, vehicle_name: '2022 Chevy Express', license_plate: 'FLT-002',
      assigned_driver: 'Priya Sharma', health_score: 61, days_overdue: 0,
      last_inspection_date: new Date(now.getTime() - 18 * 86400000).toISOString(),
      inspection_status: 'due_soon', outstanding_service_items: 2,
    },
  ];

  const driverLeaderboard: FleetDriverCompliance[] = [
    { driver_id: 1, driver_name: 'Marcus Rivera', inspections_on_time: 4, inspections_total: 4, compliance_rate: 100, last_inspection_date: new Date(now.getTime() - 7 * 86400000).toISOString() },
    { driver_id: 4, driver_name: 'Aisha Patel', inspections_on_time: 4, inspections_total: 4, compliance_rate: 100, last_inspection_date: new Date(now.getTime() - 2 * 86400000).toISOString() },
    { driver_id: 2, driver_name: 'Priya Sharma', inspections_on_time: 3, inspections_total: 4, compliance_rate: 75, last_inspection_date: new Date(now.getTime() - 18 * 86400000).toISOString() },
    { driver_id: 3, driver_name: 'Jake Lawson', inspections_on_time: 1, inspections_total: 4, compliance_rate: 25, last_inspection_date: new Date(now.getTime() - 45 * 86400000).toISOString() },
  ];

  return {
    fleet_compliance_score: 72,
    total_vehicles: 5,
    inspected_count: 2,
    overdue_count: 2,
    due_soon_count: 1,
    outstanding_service_items: 9,
    completion_rate: 40,
    trend,
    overdue_vehicles: overdueVehicles,
    due_soon_vehicles: dueSoonVehicles,
    driver_leaderboard: driverLeaderboard,
  };
}

function buildLegacyCompliance(): FleetComplianceSummary {
  const enhanced = buildMockComplianceEnhanced();
  const allVehicles = [...enhanced.overdue_vehicles, ...enhanced.due_soon_vehicles].map((v) => ({
    vehicle_id: v.vehicle_id,
    vehicle_name: v.vehicle_name,
    license_plate: v.license_plate,
    assigned_driver: v.assigned_driver,
    health_score: v.health_score,
    last_inspection_date: v.last_inspection_date,
    inspection_status: v.inspection_status,
    outstanding_service_items: v.outstanding_service_items,
  }));

  return {
    total_vehicles: enhanced.total_vehicles,
    inspected_count: enhanced.inspected_count,
    overdue_count: enhanced.overdue_count,
    outstanding_service_items: enhanced.outstanding_service_items,
    fleet_health_score: enhanced.fleet_compliance_score,
    completion_rate: enhanced.completion_rate,
    trend: enhanced.trend as HealthTrendPoint[],
    vehicles: allVehicles,
  };
}

export function useFleetCompliance() {
  return useQuery({
    queryKey: ['fleetCompliance'],
    queryFn: async (): Promise<FleetComplianceSummary> => {
      try {
        const { data } = await apiClient.get<ApiResponse<FleetComplianceSummary>>(
          ENDPOINTS.FLEET.COMPLIANCE,
        );
        return data.data;
      } catch {
        return buildLegacyCompliance();
      }
    },
    staleTime: 30_000,
  });
}

// TODO: Replace mock with GET /customer/fleet/compliance?period=N when backend BE-23 is ready
export function useFleetComplianceEnhanced(period: ComplianceTimePeriod = 30) {
  return useQuery({
    queryKey: ['fleetComplianceEnhanced', period],
    queryFn: async (): Promise<FleetComplianceEnhanced> => {
      try {
        const { data } = await apiClient.get<ApiResponse<FleetComplianceEnhanced>>(
          ENDPOINTS.FLEET.COMPLIANCE,
          { params: { period } },
        );
        return data.data;
      } catch {
        return buildMockComplianceEnhanced();
      }
    },
    staleTime: 30_000,
  });
}
