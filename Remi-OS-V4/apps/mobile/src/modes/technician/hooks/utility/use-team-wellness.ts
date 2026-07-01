import { useQuery } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { TeamWellnessResponse } from "@technician/types/api";

export function useTeamWellness() {
  return useQuery({
    queryKey: ["wellness", "team"],
    queryFn: () =>
      api<TeamWellnessResponse>("get", Endpoints.wellness.teamAggregate),
    staleTime: 120_000,
  });
}
