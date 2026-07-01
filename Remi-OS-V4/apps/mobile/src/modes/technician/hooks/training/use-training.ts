import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type {
  Certification,
  TrainingModule,
  OnboardingChecklist,
} from "@technician/types/api";

export function useMyCertifications() {
  return useQuery({
    queryKey: ["training", "certifications"],
    queryFn: () =>
      api<Certification[]>("get", Endpoints.training.myCertifications),
    staleTime: 60_000,
  });
}

export function useMyModules() {
  return useQuery({
    queryKey: ["training", "modules"],
    queryFn: () =>
      api<TrainingModule[]>("get", Endpoints.training.myModules),
    staleTime: 60_000,
  });
}

export function useCompleteModule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { moduleId: number; score?: number }) =>
      api<void>(
        "post",
        Endpoints.training.completeModule(params.moduleId),
        params.score != null ? { score: params.score } : undefined
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training"] });
    },
  });
}

export function useMyOnboarding() {
  return useQuery({
    queryKey: ["training", "onboarding"],
    queryFn: () =>
      api<Array<{ checklist: OnboardingChecklist; items: OnboardingChecklist["items"] }>>(
        "get",
        Endpoints.training.myOnboarding
      ),
    staleTime: 60_000,
  });
}

export function useMarkOnboardingStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { stepName: string; checklistId: number }) =>
      api<void>(
        "put",
        Endpoints.training.markOnboardingStep(params.stepName),
        { checklistId: params.checklistId }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training", "onboarding"] });
    },
  });
}
