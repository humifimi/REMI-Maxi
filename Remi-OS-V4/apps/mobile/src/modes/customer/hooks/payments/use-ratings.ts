import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse, SubmitRatingRequest } from '@customer/types/api';

export function useSubmitRating() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: SubmitRatingRequest) => {
      const { data } = await apiClient.post<ApiResponse<{ id: number }>>(
        ENDPOINTS.RATINGS.SUBMIT,
        body,
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}
