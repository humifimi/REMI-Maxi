import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse } from '@customer/types/api';
import type { Referral, ReferralListItem, AcceptQuoteRequest } from '@customer/types/referral';

export function useReferral(referralId: number) {
  return useQuery({
    queryKey: ['referrals', referralId],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<Referral>>(
        ENDPOINTS.REFERRALS.DETAIL(referralId),
      );
      return data.data;
    },
    staleTime: 30_000,
    enabled: referralId > 0,
  });
}

export function useMyReferrals() {
  return useQuery({
    queryKey: ['referrals'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<ReferralListItem[]>>(
        ENDPOINTS.REFERRALS.LIST,
      );
      return data.data;
    },
    staleTime: 60_000,
  });
}

export function useAcceptQuote(referralId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: AcceptQuoteRequest) => {
      const { data } = await apiClient.post<ApiResponse<Referral>>(
        ENDPOINTS.REFERRALS.ACCEPT_QUOTE(referralId),
        body,
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referrals', referralId] });
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
    },
  });
}
