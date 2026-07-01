import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type {
  DeferredWorkItem,
  DeferredWorkItemCreatePayload,
} from "@technician/types/api";

export function useDeferredItemsByAppointment(appointmentId: number) {
  return useQuery({
    queryKey: ["deferred", "appointment", appointmentId],
    queryFn: () =>
      api<DeferredWorkItem[]>(
        "get",
        Endpoints.deferred.byAppointment(appointmentId)
      ),
    enabled: appointmentId > 0,
    staleTime: 15_000,
  });
}

export function useDeferredItemsByVehicle(vehicleId: number) {
  return useQuery({
    queryKey: ["deferred", "vehicle", vehicleId],
    queryFn: () =>
      api<DeferredWorkItem[]>("get", Endpoints.deferred.byVehicle(vehicleId)),
    enabled: vehicleId > 0,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useCreateDeferredItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: DeferredWorkItemCreatePayload) =>
      api<DeferredWorkItem>("post", Endpoints.deferred.create, payload),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["deferred", "appointment", variables.appointment_id],
      });
      queryClient.invalidateQueries({
        queryKey: ["deferred", "vehicle", variables.vehicle_id],
      });
    },
  });
}

export function useCommunicateDeferred() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      appointmentId,
      itemIds,
    }: {
      appointmentId: number;
      itemIds: number[];
    }) =>
      api<{ communicated: number }>(
        "post",
        Endpoints.deferred.communicate(appointmentId),
        { item_ids: itemIds }
      ),
    onSuccess: (_, { appointmentId }) => {
      queryClient.invalidateQueries({
        queryKey: ["deferred", "appointment", appointmentId],
      });
    },
  });
}
