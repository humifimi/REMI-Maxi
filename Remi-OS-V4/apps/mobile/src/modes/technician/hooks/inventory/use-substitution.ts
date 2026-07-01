import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { JobStockCheck, SubstitutePart } from "@technician/types/api";

export function useJobStockCheck(appointmentId: number | null) {
  return useQuery({
    queryKey: ["inventory", "stock-check", appointmentId],
    queryFn: () =>
      api<JobStockCheck>(
        "get",
        Endpoints.inventory.stockCheck(appointmentId!),
      ),
    enabled: appointmentId != null,
    staleTime: 30_000,
  });
}

export function useSubstitutes(itemId: number | null) {
  return useQuery({
    queryKey: ["inventory", "substitutes", itemId],
    queryFn: () =>
      api<SubstitutePart[]>(
        "get",
        Endpoints.inventory.substitutes(itemId!)
      ),
    enabled: itemId != null,
    staleTime: 60_000,
  });
}

export function useRequestTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      item_id: number;
      quantity: number;
      from_location_id: number;
      reason: string;
    }) => {
      return api<{ transfer_id: number }>(
        "post",
        Endpoints.inventory.requestTransfer,
        payload
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}
