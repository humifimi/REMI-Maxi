import { useQuery } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { TechPerformance } from "@technician/types/api";

export function useTechPerformance() {
  return useQuery({
    queryKey: ["ratings", "my-performance"],
    queryFn: () =>
      api<TechPerformance>("get", Endpoints.ratings.myPerformance),
    staleTime: 120_000,
    retry: 0,
  });
}
