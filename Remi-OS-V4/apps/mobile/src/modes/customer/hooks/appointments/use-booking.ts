import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import { buildFallbackBookingSuggestions } from '@customer/services/booking-fallback-suggestions';
import type {
  ApiResponse,
  ScoredSuggestion,
  SuggestBookingRequest,
  CreateBookingRequest,
  CreateBookingResponse,
  ETAResponse,
  BookingTrackingData,
} from '@customer/types/api';

/** Allow parallelized backend suggest to finish; was too low when server ran many sequential 60s Google calls. */
const SUGGEST_TIMEOUT_MS = 28_000;

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateBookingRequest) => {
      const { data } = await apiClient.post<ApiResponse<CreateBookingResponse>>(
        ENDPOINTS.BOOKINGS.CREATE,
        body,
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

export function useSuggestBooking() {
  return useMutation({
    mutationFn: async (body: SuggestBookingRequest): Promise<ScoredSuggestion[]> => {
      try {
        const { data } = await apiClient.post<ApiResponse<ScoredSuggestion[]>>(
          ENDPOINTS.BOOKINGS.SUGGEST,
          body,
          { timeout: SUGGEST_TIMEOUT_MS },
        );
        const list = data?.data;
        if (Array.isArray(list) && list.length > 0) {
          return list;
        }
      } catch {
        // Network error, 404, timeout, or malformed envelope — use fallback slots.
      }
      return buildFallbackBookingSuggestions(body.preferredDateStart);
    },
  });
}

export function useBookingTracking(appointmentId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['booking-tracking', appointmentId],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<BookingTrackingData>>(
        ENDPOINTS.BOOKINGS.TRACK(appointmentId),
      );
      return data.data;
    },
    enabled,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

export function useBookingETA(appointmentId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['booking-eta', appointmentId],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<ETAResponse>>(
        ENDPOINTS.BOOKINGS.ETA(appointmentId),
      );
      return data.data;
    },
    enabled,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
