import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse, NotificationPreferences } from '@customer/types/api';

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ['notification-preferences'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<NotificationPreferences>>(
        ENDPOINTS.NOTIFICATION_PREFERENCES.GET,
      );
      return data.data;
    },
    staleTime: 120_000,
    retry: 1,
  });
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: Partial<NotificationPreferences>) => {
      const { data } = await apiClient.put<ApiResponse<NotificationPreferences>>(
        ENDPOINTS.NOTIFICATION_PREFERENCES.UPDATE,
        body,
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
  });
}
