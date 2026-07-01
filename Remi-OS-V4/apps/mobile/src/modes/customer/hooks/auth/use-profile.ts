import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse, User } from '@customer/types/api';

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<User>>(ENDPOINTS.PROFILE.GET);
      return data.data;
    },
    staleTime: 120_000,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: { full_name?: string; phone?: string; profile_image_url?: string }) => {
      const { data } = await apiClient.put<ApiResponse<User>>(ENDPOINTS.PROFILE.UPDATE, body);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
