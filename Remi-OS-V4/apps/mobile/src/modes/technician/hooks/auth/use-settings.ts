import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { TechnicianSettings } from "@technician/types/api";

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => api<TechnicianSettings>("get", Endpoints.settings.get),
    staleTime: 60_000,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Partial<TechnicianSettings>) =>
      api<TechnicianSettings>("put", Endpoints.settings.update, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}
