import { useQuery } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse, ServiceRecord } from '@customer/types/api';

/**
 * Fetch the MAXI Shield service record for a completed appointment.
 *
 * Throws on any API failure (404, 500, network) so the consumer can render
 * its existing "Record not found" empty state. This used to silently fall
 * back to a hardcoded Honda Civic / Mike Rivera fixture for any appointment,
 * which made every customer's "service record" look real even when the
 * backend hadn't generated one — the source of the bogus demo card.
 */
export function useServiceRecord(appointmentId: number | undefined) {
  return useQuery({
    queryKey: ['serviceRecord', appointmentId],
    queryFn: async (): Promise<ServiceRecord | null> => {
      if (!appointmentId) return null;
      const { data } = await apiClient.get<ApiResponse<ServiceRecord>>(
        ENDPOINTS.APPOINTMENTS.SERVICE_RECORD(appointmentId),
      );
      return data.data ?? null;
    },
    enabled: !!appointmentId,
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
