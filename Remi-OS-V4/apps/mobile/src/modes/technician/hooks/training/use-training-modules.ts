import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type {
  TrainingModuleDetail,
  AssessmentResult,
  AssignedTrainingResponse,
} from "@technician/types/api";

export function useTrainingModule(moduleId: number) {
  return useQuery({
    queryKey: ["training", "module-detail", moduleId],
    queryFn: () =>
      api<TrainingModuleDetail>(
        "get",
        Endpoints.trainingModules.detail(moduleId),
      ),
    staleTime: 30_000,
    enabled: moduleId > 0,
  });
}

export function useCompleteLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lessonId: number) =>
      api<void>("post", Endpoints.trainingModules.completeLesson(lessonId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training"] });
    },
  });
}

export function useSubmitAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      assessmentId: number;
      answers: Record<string, number>;
    }) =>
      api<AssessmentResult>(
        "post",
        Endpoints.trainingModules.submitAssessment(params.assessmentId),
        { answers: params.answers },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training"] });
    },
  });
}

export function useAssignedTraining() {
  return useQuery({
    queryKey: ["training", "assigned"],
    queryFn: () =>
      api<AssignedTrainingResponse>(
        "get",
        Endpoints.trainingModules.assigned,
      ),
    staleTime: 30_000,
  });
}
