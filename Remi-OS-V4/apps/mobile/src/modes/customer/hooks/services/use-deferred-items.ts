import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse, DeferredWorkItem, DeferredBookingPrefill } from '@customer/types/api';

export function useDeferredItems(vehicleId: number | undefined) {
  return useQuery({
    queryKey: ['deferredItems', vehicleId],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<DeferredWorkItem[]>>(
        ENDPOINTS.DEFERRED.BY_VEHICLE(vehicleId!)
      );
      return data.data;
    },
    enabled: !!vehicleId,
    staleTime: 60_000,
  });
}

export function useAllDeferredItems() {
  return useQuery({
    queryKey: ['deferredItems', 'all'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<DeferredWorkItem[]>>(
        ENDPOINTS.DEFERRED.ALL
      );
      return data.data;
    },
    staleTime: 60_000,
  });
}

export function useDeferredBookingPrefill() {
  return useMutation({
    mutationFn: async (itemId: number) => {
      const { data } = await apiClient.post<ApiResponse<DeferredBookingPrefill>>(
        ENDPOINTS.DEFERRED.BOOK(itemId)
      );
      return data.data;
    },
  });
}

export function useDeclineDeferredItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, reason }: { itemId: number; reason?: string }) => {
      const { data } = await apiClient.post<ApiResponse<DeferredWorkItem>>(
        ENDPOINTS.DEFERRED.DECLINE(itemId),
        { reason }
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deferredItems'] });
    },
  });
}
