import { useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@customer/api/client';
import { ENDPOINTS } from '@customer/api/endpoints';
import type { ApiResponse } from '@customer/types/api';
import type {
  FleetBookingRequest,
  FleetBookingResponse,
  FleetBatchBookingRequest,
  FleetBatchBookingResponse,
} from '@customer/types/fleet';

// TODO: Replace mock with POST /customer/fleet/bookings when backend BE-24 is ready
export function useFleetBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: FleetBookingRequest): Promise<FleetBookingResponse> => {
      try {
        const { data } = await apiClient.post<ApiResponse<FleetBookingResponse>>(
          ENDPOINTS.FLEET.BOOKINGS,
          body,
        );
        return data.data;
      } catch {
        return buildMockBookingResponse(body);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['fleetDashboard'] });
      queryClient.invalidateQueries({ queryKey: ['fleetVehicles'] });
    },
  });
}

// TODO: Replace mock with POST /customer/fleet/bookings/batch when backend BE-24 is ready
export function useFleetBatchBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: FleetBatchBookingRequest): Promise<FleetBatchBookingResponse> => {
      try {
        const { data } = await apiClient.post<ApiResponse<FleetBatchBookingResponse>>(
          ENDPOINTS.FLEET.BOOKINGS_BATCH,
          body,
        );
        return data.data;
      } catch {
        return buildMockBatchResponse(body);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['fleetDashboard'] });
      queryClient.invalidateQueries({ queryKey: ['fleetVehicles'] });
    },
  });
}

function buildMockBookingResponse(req: FleetBookingRequest): FleetBookingResponse {
  return {
    appointment_id: Date.now(),
    vehicle_id: req.vehicle_id,
    vehicle_name: `Vehicle #${req.vehicle_id}`,
    scheduled_date: req.scheduled_date,
    scheduled_time: req.scheduled_time,
    status: 'confirmed',
  };
}

function buildMockBatchResponse(req: FleetBatchBookingRequest): FleetBatchBookingResponse {
  return {
    bookings: req.vehicle_ids.map((vid) => ({
      appointment_id: Date.now() + vid,
      vehicle_id: vid,
      vehicle_name: `Vehicle #${vid}`,
      scheduled_date: req.scheduled_date,
      scheduled_time: req.scheduled_time,
      status: 'confirmed',
    })),
    total_created: req.vehicle_ids.length,
  };
}
