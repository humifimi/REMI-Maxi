import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { AppointmentService } from "@technician/types/api";

interface AddServiceResult {
  service: AppointmentService;
  lineItems: unknown[];
  fluids: unknown;
  parts: unknown;
}

export function useAddService() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      jobId,
      service_id,
      vehicle_id,
    }: {
      jobId: number;
      service_id: number;
      vehicle_id?: number;
    }) => {
      const path = Endpoints.jobs.addService(jobId);
      console.log("[job-flow] POST add service", {
        path,
        jobId,
        service_id,
        vehicle_id: vehicle_id ?? null,
      });
      return api<AddServiceResult>(
        "post",
        path,
        { service_id, vehicle_id }
      );
    },
    onSuccess: (_, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: ["jobs", jobId] });
    },
  });
}

export function useStartServiceTimer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      jobId,
      serviceId,
    }: {
      jobId: number;
      serviceId: number;
    }) => {
      return api<void>(
        "post",
        Endpoints.jobs.startService(jobId, serviceId)
      );
    },
    onSuccess: (_, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: ["jobs", jobId] });
    },
  });
}

export function useCompleteServiceTimer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      jobId,
      serviceId,
    }: {
      jobId: number;
      serviceId: number;
    }) => {
      return api<void>(
        "post",
        Endpoints.jobs.completeService(jobId, serviceId)
      );
    },
    onSuccess: (_, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: ["jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });
}
