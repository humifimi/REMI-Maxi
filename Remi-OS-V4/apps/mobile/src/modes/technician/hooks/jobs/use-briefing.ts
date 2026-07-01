import { useQuery } from "@tanstack/react-query";
import { api, franchiseApi } from "@technician/api/client";
import { Endpoints, FranchiseEndpoints } from "@technician/api/endpoints";
import type { DailyBriefing, FranchiseBriefing } from "@technician/types/api";

export function useDailyBriefing(date: string) {
  return useQuery({
    queryKey: ["briefing", date],
    queryFn: () => api<DailyBriefing>("get", Endpoints.briefing.byDate(date)),
    staleTime: 30_000,
    enabled: !!date,
  });
}

export function useFranchiseBriefing(franchiseId: number, date: string) {
  return useQuery({
    queryKey: ["franchise-briefing", franchiseId, date],
    queryFn: () =>
      franchiseApi<FranchiseBriefing>(
        "get",
        FranchiseEndpoints.briefing.byDate(date),
        { franchiseId }
      ),
    staleTime: 30_000,
    enabled: franchiseId > 0 && !!date,
  });
}
