import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { FluidLevelInput, FluidHistoryEntry } from "@technician/types/api";

export function useFluidHistory(vehicleId: number) {
  return useQuery({
    queryKey: ["fluid-history", vehicleId],
    queryFn: () =>
      api<FluidHistoryEntry[]>("get", Endpoints.fluids.history(vehicleId)),
    staleTime: 30_000,
    enabled: vehicleId > 0,
  });
}

export function useRecordFluids(jobId: number) {
  return useMutation({
    mutationFn: ({ vehicleId, entries }: { vehicleId: number; entries: FluidLevelInput[] }) =>
      api<void>("post", Endpoints.fluids.record(jobId), { vehicleId, entries }),
  });
}
