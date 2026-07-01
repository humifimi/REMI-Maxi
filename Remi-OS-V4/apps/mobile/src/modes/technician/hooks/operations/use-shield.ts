import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { franchiseApi } from "@technician/api/client";
import { FranchiseEndpoints } from "@technician/api/endpoints";
import type {
  ShieldInspectionSchedule,
  ShieldInspection,
} from "@technician/types/api";

export function useShieldSchedule(franchiseId?: number) {
  return useQuery({
    queryKey: ["shield", "schedule", franchiseId],
    queryFn: () =>
      franchiseApi<ShieldInspectionSchedule>(
        "get",
        FranchiseEndpoints.shield.schedule,
        franchiseId ? { franchiseId } : undefined
      ),
    staleTime: 60_000,
  });
}

export function useShieldInspections(
  franchiseId?: number,
  status?: string
) {
  return useQuery({
    queryKey: ["shield", "inspections", franchiseId, status],
    queryFn: () =>
      franchiseApi<ShieldInspection[]>(
        "get",
        FranchiseEndpoints.shield.inspections,
        { ...(franchiseId && { franchiseId }), ...(status && { status }) }
      ),
    staleTime: 30_000,
  });
}

export function useShieldInspectionDetail(id: number) {
  return useQuery({
    queryKey: ["shield", "inspection", id],
    queryFn: () =>
      franchiseApi<ShieldInspection>(
        "get",
        FranchiseEndpoints.shield.inspectionDetail(id)
      ),
    enabled: id > 0,
  });
}

export function useSubmitInspection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      franchiseId: number;
      scheduleId?: number;
      periodStart: string;
      periodEnd: string;
      items: Array<{ category: string; photoUrl: string }>;
    }) =>
      franchiseApi<ShieldInspection>(
        "post",
        FranchiseEndpoints.shield.inspections,
        {
          franchise_id: payload.franchiseId,
          ...(payload.scheduleId && { schedule_id: payload.scheduleId }),
          period_start: payload.periodStart,
          period_end: payload.periodEnd,
          items: payload.items.map((i) => ({
            category: i.category,
            photo_url: i.photoUrl,
          })),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shield"] });
    },
  });
}

export function useShieldHistory(franchiseId?: number) {
  return useQuery({
    queryKey: ["shield", "history", franchiseId],
    queryFn: () =>
      franchiseApi<ShieldInspection[]>(
        "get",
        FranchiseEndpoints.shield.history,
        franchiseId ? { franchiseId } : undefined
      ),
    staleTime: 60_000,
  });
}
