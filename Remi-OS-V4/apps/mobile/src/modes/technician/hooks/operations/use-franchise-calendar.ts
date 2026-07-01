import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { franchiseApi } from "@technician/api/client";
import { FranchiseEndpoints } from "@technician/api/endpoints";
import type {
  FranchiseCalendarEntry,
  DispatchOverview,
  ReassignResult,
  ExceptionAlert,
  TechnicianMetric,
} from "@technician/types/api";

export function useFranchiseCalendar(
  franchiseId: number,
  date: string,
  range: "day" | "week" | "month" = "day"
) {
  return useQuery({
    queryKey: ["franchise-calendar", franchiseId, date, range],
    queryFn: () =>
      franchiseApi<FranchiseCalendarEntry[]>(
        "get",
        FranchiseEndpoints.calendar,
        { franchiseId, date, range }
      ),
    staleTime: 30_000,
    enabled: franchiseId > 0 && !!date,
  });
}

export function useReassignAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      appointmentId: number;
      fromTechnicianId: number;
      toTechnicianId: number;
      franchiseId: number;
    }) =>
      franchiseApi<ReassignResult>(
        "put",
        FranchiseEndpoints.reassign,
        data
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["franchise-calendar"] });
      queryClient.invalidateQueries({ queryKey: ["dispatch-overview"] });
    },
  });
}

export function useDispatchOverview(franchiseId: number) {
  return useQuery({
    queryKey: ["dispatch-overview", franchiseId],
    queryFn: () =>
      franchiseApi<DispatchOverview>(
        "get",
        FranchiseEndpoints.dispatchOverview,
        { franchiseId }
      ),
    staleTime: 15_000,
    enabled: franchiseId > 0,
  });
}

export function useDispatchAlerts(franchiseId: number, date: string) {
  return useQuery({
    queryKey: ["dispatch-alerts", franchiseId, date],
    queryFn: () =>
      franchiseApi<ExceptionAlert[]>(
        "get",
        FranchiseEndpoints.dispatchAlerts,
        { franchiseId, date }
      ),
    staleTime: 15_000,
    enabled: franchiseId > 0 && !!date,
  });
}

export function useTechnicianMetrics(franchiseId: number, date: string) {
  return useQuery({
    queryKey: ["tech-metrics", franchiseId, date],
    queryFn: () =>
      franchiseApi<TechnicianMetric[]>(
        "get",
        FranchiseEndpoints.techMetrics,
        { franchiseId, date }
      ),
    staleTime: 15_000,
    enabled: franchiseId > 0 && !!date,
  });
}
