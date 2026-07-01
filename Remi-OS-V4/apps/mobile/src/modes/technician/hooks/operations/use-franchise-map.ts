import { useQuery } from "@tanstack/react-query";
import { franchiseApi } from "@technician/api/client";
import { FranchiseEndpoints } from "@technician/api/endpoints";
import type { FranchiseRouteMapData } from "@technician/types/api";

export function useFranchiseRouteMap(franchiseId: number, date: string) {
  return useQuery({
    queryKey: ["franchise-route-map", franchiseId, date],
    queryFn: () =>
      franchiseApi<FranchiseRouteMapData>(
        "get",
        FranchiseEndpoints.dispatchMap,
        { franchiseId, date }
      ),
    enabled: franchiseId > 0 && date.length > 0,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
