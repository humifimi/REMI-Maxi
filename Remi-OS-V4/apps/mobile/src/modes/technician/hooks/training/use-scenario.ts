import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type {
  ScenarioModule,
  ScenarioDecisionPayload,
  ScenarioDecisionResponse,
} from "@technician/types/training";

export function useScenarioModule(moduleId: number) {
  return useQuery({
    queryKey: ["training", "scenario", moduleId],
    queryFn: () =>
      api<ScenarioModule>("get", Endpoints.scenarios.detail(moduleId)),
    staleTime: 60_000,
    enabled: moduleId > 0,
  });
}

export function useSubmitScenarioDecision(moduleId: number) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: ScenarioDecisionPayload) =>
      api<ScenarioDecisionResponse>(
        "post",
        Endpoints.scenarios.decide(moduleId),
        payload,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training"] });
    },
  });
}
