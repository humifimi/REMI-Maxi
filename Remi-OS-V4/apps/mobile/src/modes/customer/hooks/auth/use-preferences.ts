import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse, CustomerPreferences, VehiclePreferences, CustomerProfileDetails } from '@customer/types/api';

export function usePreferences() {
  return useQuery({
    queryKey: ['preferences'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<CustomerPreferences>>(
        ENDPOINTS.PREFERENCES.GET,
      );
      return data.data;
    },
    staleTime: 120_000,
    retry: 2,
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (prefs: Partial<CustomerPreferences>) => {
      const { data } = await apiClient.put<ApiResponse<CustomerPreferences>>(
        ENDPOINTS.PREFERENCES.UPDATE,
        prefs,
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preferences'] });
    },
  });
}

export function useVehiclePreferences(vehicleId: number | undefined) {
  return useQuery({
    queryKey: ['vehiclePreferences', vehicleId],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<VehiclePreferences>>(
        ENDPOINTS.PREFERENCES.VEHICLE_GET(vehicleId!),
      );
      return data.data;
    },
    enabled: !!vehicleId,
    staleTime: 120_000,
  });
}

export function useUpdateVehiclePreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ vehicleId, prefs }: { vehicleId: number; prefs: Partial<VehiclePreferences> }) => {
      const { data } = await apiClient.put<ApiResponse<VehiclePreferences>>(
        ENDPOINTS.PREFERENCES.VEHICLE_UPDATE(vehicleId),
        prefs,
      );
      return data.data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['vehiclePreferences', vars.vehicleId] });
    },
  });
}

export function useProfileDetails() {
  return useQuery({
    queryKey: ['profileDetails'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<CustomerProfileDetails | null>>(
        ENDPOINTS.PREFERENCES.PROFILE_DETAILS_GET,
      );
      return data.data;
    },
    staleTime: 120_000,
    retry: 1,
  });
}

export function useUpdateProfileDetails() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (details: Partial<CustomerProfileDetails>) => {
      const { data } = await apiClient.put<ApiResponse<CustomerProfileDetails>>(
        ENDPOINTS.PREFERENCES.PROFILE_DETAILS_UPDATE,
        details,
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profileDetails'] });
    },
  });
}
