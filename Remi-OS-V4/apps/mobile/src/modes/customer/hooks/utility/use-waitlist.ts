import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type {
  ApiResponse,
  WaitlistEntry,
  JoinWaitlistRequest,
  JoinWaitlistResponse,
} from '@customer/types/api';

export function useWaitlistEntries() {
  return useQuery({
    queryKey: ['waitlist'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<WaitlistEntry[]>>(ENDPOINTS.WAITLIST.STATUS);
      return data.data;
    },
    staleTime: 30_000,
  });
}

export function useActiveWaitlistEntries() {
  const { data: entries, ...rest } = useWaitlistEntries();
  const active = entries?.filter((e) => e.status === 'active' || e.status === 'offered') ?? [];
  return { data: active, ...rest };
}

export function useJoinWaitlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: JoinWaitlistRequest) => {
      const { data } = await apiClient.post<ApiResponse<JoinWaitlistResponse>>(
        ENDPOINTS.WAITLIST.JOIN,
        body,
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
    },
  });
}

export function useClaimWaitlistSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (waitlistEntryId: number) => {
      const { data } = await apiClient.post<ApiResponse<{ appointmentId: number }>>(
        ENDPOINTS.WAITLIST.CLAIM(waitlistEntryId),
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

export function useCancelWaitlistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (waitlistEntryId: number) => {
      const { data } = await apiClient.put<ApiResponse<{ id: number; status: string }>>(
        ENDPOINTS.WAITLIST.CANCEL(waitlistEntryId),
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] });
    },
  });
}
