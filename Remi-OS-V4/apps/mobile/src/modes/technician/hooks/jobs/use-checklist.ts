import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { ChecklistData, ChecklistSubmitItem, InspectionItem } from "@technician/types/api";

export function useChecklist(jobId: number) {
  return useQuery({
    queryKey: ["checklist", jobId],
    queryFn: () =>
      api<ChecklistData>("get", Endpoints.jobs.checklist(jobId)),
    enabled: jobId > 0,
  });
}

export function useSubmitChecklist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      jobId,
      items,
    }: {
      jobId: number;
      items: ChecklistSubmitItem[];
    }) => {
      return api<InspectionItem[]>(
        "post",
        Endpoints.jobs.checklist(jobId),
        { items }
      );
    },
    onSuccess: (_, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: ["checklist", jobId] });
    },
  });
}
