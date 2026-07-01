import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type {
  ApiResponse,
  SetupIntentResponse,
  StripePaymentMethod,
  ConfirmBookingPaymentRequest,
} from '@customer/types/api';

export function useCreateSetupIntent() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<ApiResponse<SetupIntentResponse>>(
        ENDPOINTS.PAYMENTS.SETUP_INTENT,
      );
      return data.data;
    },
  });
}

export function usePaymentMethods() {
  return useQuery({
    queryKey: ['payment-methods'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<StripePaymentMethod[]>>(
        ENDPOINTS.PAYMENTS.METHODS,
      );
      return data.data;
    },
    staleTime: 60_000,
  });
}

export function useDeletePaymentMethod() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (paymentMethodId: string) => {
      await apiClient.delete(ENDPOINTS.PAYMENTS.DELETE_METHOD(paymentMethodId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
    },
  });
}

export function useConfirmBookingPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      appointmentId,
      paymentMethodId,
    }: {
      appointmentId: number;
      paymentMethodId: string;
    }) => {
      const body: ConfirmBookingPaymentRequest = { paymentMethodId };
      const { data } = await apiClient.post<ApiResponse<{ success: boolean }>>(
        ENDPOINTS.BOOKINGS.CONFIRM(appointmentId),
        body,
      );
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}
