import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse, Notification } from '@customer/types/api';

export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<Notification[]>>(ENDPOINTS.NOTIFICATIONS.LIST);
      return data.data;
    },
    staleTime: 30_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.put(ENDPOINTS.NOTIFICATIONS.MARK_READ(id));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
