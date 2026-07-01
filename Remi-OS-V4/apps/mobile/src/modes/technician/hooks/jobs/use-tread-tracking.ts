import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { TreadDepthInput, TreadHistoryEntry } from "@technician/types/api";

export function useTreadHistory(vehicleId: number) {
  return useQuery({
    queryKey: ["tread-history", vehicleId],
    queryFn: () =>
      api<TreadHistoryEntry[]>("get", Endpoints.tread.history(vehicleId)),
    staleTime: 30_000,
    enabled: vehicleId > 0,
  });
}

export function useRecordTread(jobId: number) {
  return useMutation({
    mutationFn: ({ vehicleId, readings }: { vehicleId: number; readings: TreadDepthInput[] }) =>
      api<void>("post", Endpoints.tread.record(jobId), { vehicleId, readings }),
  });
}
