import { useQuery } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse } from '@customer/types/api';
import type { FleetDashboard } from '@customer/types/fleet';

function buildMockDashboard(): FleetDashboard {
  const now = new Date();

  return {
    fleet_name: 'REMI Fleet Services',
    total_vehicles: 5,
    fleet_health_score: 65,
    alerts: [
      {
        id: 1,
        level: 'overdue',
        title: 'Overdue Services',
        subtitle: '2 vehicles past due',
        count: 2,
      },
      {
        id: 2,
        level: 'due_soon',
        title: 'Due Soon',
        subtitle: '1 vehicle due within 7 days',
        count: 1,
      },
      {
        id: 3,
        level: 'pending_approval',
        title: 'Pending Approvals',
        subtitle: '3 requests waiting',
        count: 3,
      },
    ],
    spend: {
      mtd_total: 2847.5,
      previous_month_total: 4120.0,
      ytd_total: 18450.0,
      budget_limit: 5000.0,
      budget_used_percent: 57,
    },
    recent_activity: [
      {
        id: 1,
        type: 'service_completed',
        description: 'Oil change completed',
        vehicle_name: '2023 Ford Transit',
        driver_name: 'Marcus Rivera',
        timestamp: new Date(now.getTime() - 2 * 3600000).toISOString(),
      },
      {
        id: 2,
        type: 'approval_requested',
        description: 'Brake pad replacement requested',
        vehicle_name: '2022 Chevy Express',
        driver_name: 'Priya Sharma',
        timestamp: new Date(now.getTime() - 5 * 3600000).toISOString(),
      },
      {
        id: 3,
        type: 'inspection_overdue',
        description: 'Inspection overdue by 15 days',
        vehicle_name: '2021 RAM ProMaster',
        driver_name: 'Jake Lawson',
        timestamp: new Date(now.getTime() - 24 * 3600000).toISOString(),
      },
      {
        id: 4,
        type: 'booking_created',
        description: 'Tire rotation booked for Apr 22',
        vehicle_name: '2024 Ford E-Transit',
        driver_name: 'Aisha Patel',
        timestamp: new Date(now.getTime() - 48 * 3600000).toISOString(),
      },
      {
        id: 5,
        type: 'vehicle_added',
        description: 'New vehicle added to fleet',
        vehicle_name: '2023 Mercedes Sprinter',
        driver_name: null,
        timestamp: new Date(now.getTime() - 72 * 3600000).toISOString(),
      },
    ],
    pending_approvals: 3,
  };
}

// TODO: Replace mock with GET /customer/fleet/dashboard when backend is ready
export function useFleetDashboard() {
  return useQuery({
    queryKey: ['fleetDashboard'],
    queryFn: async (): Promise<FleetDashboard> => {
      try {
        const { data } = await apiClient.get<ApiResponse<FleetDashboard>>(
          ENDPOINTS.FLEET.DASHBOARD,
        );
        return data.data;
      } catch {
        return buildMockDashboard();
      }
    },
    staleTime: 30_000,
  });
}
