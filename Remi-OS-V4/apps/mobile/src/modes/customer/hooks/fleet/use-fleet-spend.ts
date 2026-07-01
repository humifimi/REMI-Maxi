import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse } from '@customer/types/api';
import type {
  FleetSpendData,
  FleetInvoice,
  FleetBudgetUpdate,
  InvoiceStatus,
} from '@customer/types/fleet';

function buildMockSpend(): FleetSpendData {
  const now = new Date();

  const trend = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      total: Math.round(2400 + Math.random() * 2800),
    };
  });

  return {
    mtd_total: 2847.5,
    previous_month_total: 4120.0,
    ytd_total: 18450.0,
    budget_limit: 5000.0,
    budget_period: 'monthly',
    budget_used_percent: 57,
    by_vehicle: [
      { vehicle_id: 3, vehicle_name: '2021 RAM ProMaster', total: 1245.0 },
      { vehicle_id: 1, vehicle_name: '2023 Ford Transit', total: 820.0 },
      { vehicle_id: 2, vehicle_name: '2022 Chevy Express', total: 432.5 },
      { vehicle_id: 5, vehicle_name: '2023 Mercedes Sprinter', total: 250.0 },
      { vehicle_id: 4, vehicle_name: '2024 Ford E-Transit', total: 100.0 },
    ],
    by_service_type: [
      { service_type: 'Oil Change', total: 1040, percentage: 36 },
      { service_type: 'Brake Service', total: 780, percentage: 27 },
      { service_type: 'Tire Service', total: 550, percentage: 19 },
      { service_type: 'Inspection', total: 290, percentage: 10 },
      { service_type: 'Other', total: 187.5, percentage: 7 },
    ],
    trend,
  };
}

function buildMockInvoices(): FleetInvoice[] {
  const now = new Date();
  const statuses: InvoiceStatus[] = ['paid', 'paid', 'pending', 'paid', 'pending', 'paid'];

  return [
    {
      id: 1001,
      date: new Date(now.getTime() - 2 * 86400000).toISOString(),
      amount: 189.99,
      po_number: 'PO-2026-042',
      vehicle_names: ['2022 Chevy Express'],
      status: statuses[0],
      description: 'Brake Pad Replacement',
    },
    {
      id: 1002,
      date: new Date(now.getTime() - 5 * 86400000).toISOString(),
      amount: 64.99,
      po_number: 'PO-2026-041',
      vehicle_names: ['2023 Ford Transit'],
      status: statuses[1],
      description: 'Oil Change — Full Synthetic',
    },
    {
      id: 1003,
      date: new Date(now.getTime() - 8 * 86400000).toISOString(),
      amount: 450.0,
      po_number: null,
      vehicle_names: ['2021 RAM ProMaster'],
      status: statuses[2],
      description: 'Transmission Fluid Service + Filter',
    },
    {
      id: 1004,
      date: new Date(now.getTime() - 12 * 86400000).toISOString(),
      amount: 129.99,
      po_number: 'PO-2026-039',
      vehicle_names: ['2024 Ford E-Transit', '2023 Ford Transit'],
      status: statuses[3],
      description: 'Tire Rotation (2 vehicles)',
    },
    {
      id: 1005,
      date: new Date(now.getTime() - 18 * 86400000).toISOString(),
      amount: 820.0,
      po_number: 'PO-2026-037',
      vehicle_names: ['2023 Mercedes Sprinter'],
      status: statuses[4],
      description: 'Brake Pad + Rotor Replacement — Rear',
    },
    {
      id: 1006,
      date: new Date(now.getTime() - 25 * 86400000).toISOString(),
      amount: 64.99,
      po_number: 'PO-2026-035',
      vehicle_names: ['2023 Ford Transit'],
      status: statuses[5],
      description: 'Oil Change — Full Synthetic',
    },
  ];
}

// TODO: Replace mock with GET /customer/fleet/spend when backend BE-24 is ready
export function useFleetSpend() {
  return useQuery({
    queryKey: ['fleetSpend'],
    queryFn: async (): Promise<FleetSpendData> => {
      try {
        const { data } = await apiClient.get<ApiResponse<FleetSpendData>>(
          ENDPOINTS.FLEET.SPEND,
        );
        return data.data;
      } catch {
        return buildMockSpend();
      }
    },
    staleTime: 60_000,
  });
}

// TODO: Replace mock with GET /customer/fleet/invoices when backend BE-24 is ready
export function useFleetInvoices() {
  return useQuery({
    queryKey: ['fleetInvoices'],
    queryFn: async (): Promise<FleetInvoice[]> => {
      try {
        const { data } = await apiClient.get<ApiResponse<FleetInvoice[]>>(
          ENDPOINTS.FLEET.INVOICES,
        );
        return data.data;
      } catch {
        return buildMockInvoices();
      }
    },
    staleTime: 60_000,
  });
}

// TODO: Replace mock with PUT /customer/fleet/budget when backend BE-24 is ready
export function useSetFleetBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (budget: FleetBudgetUpdate): Promise<FleetBudgetUpdate> => {
      try {
        const { data } = await apiClient.put<ApiResponse<FleetBudgetUpdate>>(
          ENDPOINTS.FLEET.BUDGET,
          budget,
        );
        return data.data;
      } catch {
        return budget;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleetSpend'] });
      queryClient.invalidateQueries({ queryKey: ['fleetDashboard'] });
    },
  });
}
