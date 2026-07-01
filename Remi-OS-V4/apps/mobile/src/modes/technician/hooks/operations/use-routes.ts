import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { RouteWithStops, RouteStop } from "@technician/types/api";
import { RouteStopStatus } from "@technician/types/enums";

export function useTodayRoute() {
  return useQuery({
    queryKey: ["routes", "today"],
    queryFn: () =>
      api<RouteWithStops | null>("get", Endpoints.routes.today),
    staleTime: 30_000,
  });
}

export function useRouteByDate(date: string) {
  return useQuery({
    queryKey: ["routes", date],
    queryFn: () =>
      api<RouteWithStops | null>("get", Endpoints.routes.byDate, { date }),
    staleTime: 30_000,
    enabled: !!date,
  });
}

export function useOptimizeRoute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api<RouteWithStops>("post", Endpoints.routes.optimize),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routes"] });
    },
  });
}

function optimisticStopUpdate(
  queryClient: ReturnType<typeof useQueryClient>,
  stopId: number,
  newStatus: RouteStopStatus,
) {
  queryClient.setQueriesData<RouteWithStops | null>(
    { queryKey: ["routes"] },
    (old) => {
      if (!old?.stops) return old;
      return {
        ...old,
        stops: old.stops.map((s) =>
          s.id === stopId ? { ...s, status: newStatus } : s,
        ),
      };
    },
  );
}

export function useArriveAtStop() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (stopId: number) =>
      api<RouteStop>("put", Endpoints.routes.arriveAtStop(stopId)),
    onMutate: (stopId) => {
      optimisticStopUpdate(queryClient, stopId, RouteStopStatus.ARRIVED);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["routes"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });
}

export function useDepartStop() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (stopId: number) =>
      api<RouteStop>("put", Endpoints.routes.departStop(stopId)),
    onMutate: (stopId) => {
      optimisticStopUpdate(queryClient, stopId, RouteStopStatus.COMPLETED);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["routes"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });
}
