import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse } from '@customer/types/api';
import type { FleetSettings, FleetSettingsUpdate } from '@customer/types/fleet';

function buildMockSettings(): FleetSettings {
  return {
    company_name: 'REMI Fleet Services',
    billing_contact_name: 'Lisa Chen',
    billing_contact_email: 'lisa@remifleet.com',
    billing_contact_phone: '(555) 867-5309',
    default_po_number: 'PO-2026',
    po_required: true,
    notification_recipient: 'manager_and_drivers',
    inspection_frequency: 'weekly',
    budget_target: 5000.0,
    budget_period: 'monthly',
    auto_approval_threshold: 200.0,
  };
}

// TODO: Replace mock with GET /customer/fleet/settings when backend BE-24 is ready
export function useFleetSettings() {
  return useQuery({
    queryKey: ['fleetSettings'],
    queryFn: async (): Promise<FleetSettings> => {
      try {
        const { data } = await apiClient.get<ApiResponse<FleetSettings>>(
          ENDPOINTS.FLEET.SETTINGS,
        );
        return data.data;
      } catch {
        return buildMockSettings();
      }
    },
    staleTime: 120_000,
  });
}

// TODO: Replace mock with PUT /customer/fleet/settings when backend BE-24 is ready
export function useUpdateFleetSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (update: FleetSettingsUpdate): Promise<FleetSettings> => {
      try {
        const { data } = await apiClient.put<ApiResponse<FleetSettings>>(
          ENDPOINTS.FLEET.SETTINGS,
          update,
        );
        return data.data;
      } catch {
        const current = buildMockSettings();
        return { ...current, ...update } as FleetSettings;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fleetSettings'] });
      queryClient.invalidateQueries({ queryKey: ['fleetDashboard'] });
      queryClient.invalidateQueries({ queryKey: ['fleetSpend'] });
    },
  });
}
