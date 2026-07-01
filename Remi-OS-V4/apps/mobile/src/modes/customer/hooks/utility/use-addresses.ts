import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse, Address, AddAddressRequest } from '@customer/types/api';

export function useAddresses() {
  return useQuery({
    queryKey: ['addresses'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<Address[]>>(ENDPOINTS.ADDRESSES.LIST);
      return data.data;
    },
    staleTime: 120_000,
  });
}

export function useAddAddress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: AddAddressRequest) => {
      const { data } = await apiClient.post<ApiResponse<Address>>(ENDPOINTS.ADDRESSES.ADD, body);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
  });
}
