import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type {
  TrainingSchool,
  TrainingCourse,
  TrainingModule,
  TrainingLesson,
  CertificationLevel,
  CertificationRequirement,
  Quiz,
  QuizAttempt,
  VideoSubmission,
} from "@technician/types/api";

export function useSchools() {
  return useQuery({
    queryKey: ["university", "schools"],
    queryFn: () => api<TrainingSchool[]>("get", Endpoints.university.schools),
    staleTime: 60_000,
  });
}

export function useCourses(schoolId: number) {
  return useQuery({
    queryKey: ["university", "courses", schoolId],
    queryFn: () =>
      api<TrainingCourse[]>("get", Endpoints.university.courses(schoolId)),
    staleTime: 60_000,
    enabled: schoolId > 0,
  });
}

export function useModules(courseId: number) {
  return useQuery({
    queryKey: ["university", "modules", courseId],
    queryFn: () =>
      api<TrainingModule[]>("get", Endpoints.university.modules(courseId)),
    staleTime: 60_000,
    enabled: courseId > 0,
  });
}

export function useLessons(moduleId: number) {
  return useQuery({
    queryKey: ["university", "lessons", moduleId],
    queryFn: () =>
      api<TrainingLesson[]>("get", Endpoints.university.lessons(moduleId)),
    staleTime: 60_000,
    enabled: moduleId > 0,
  });
}

export function useQuiz(moduleId: number) {
  return useQuery({
    queryKey: ["university", "quiz", moduleId],
    queryFn: () => api<Quiz>("get", Endpoints.university.quiz(moduleId)),
    staleTime: 60_000,
    enabled: moduleId > 0,
  });
}

export function useSubmitQuiz(quizId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answers: Record<string, number>) =>
      api<QuizAttempt>("post", Endpoints.university.submitQuiz(quizId), {
        answers,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["university"] });
    },
  });
}

export function useCertificationLevel() {
  return useQuery({
    queryKey: ["university", "certification-level"],
    queryFn: () =>
      api<CertificationLevel[]>("get", Endpoints.university.certificationLevel),
    staleTime: 30_000,
  });
}

export function useCertificationRequirements(level: number) {
  return useQuery({
    queryKey: ["university", "certification-requirements", level],
    // PLAN-DEVIATION: 2026-04-25-training-xp-be-shape-bridge — BE returns a
    // single `CertificationRequirement | null` config row (one franchise-wide
    // row per level), not the array of per-requirement progress rows the FE
    // is typed against. Normalize to `[]` so the consumer's `requirements
    // .length > 0` guard hides the "Requirements for L<n>" section instead
    // of crashing on `(null).length`. The deeper shape-mapping (config row
    // -> array of progress entries with `requirement_type` /
    // `current_progress` / `is_met`) is BE work; tracked in the same
    // PLAN-DEVIATIONS entry as the XP + cert-progress bridges.
    queryFn: async () => {
      const data = await api<CertificationRequirement[] | null>(
        "get",
        Endpoints.university.certificationRequirements(level),
      );
      return Array.isArray(data) ? data : [];
    },
    staleTime: 30_000,
    enabled: level > 0,
  });
}

export function useSubmitVideo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { module_id: number; video_url: string }) =>
      api<VideoSubmission>("post", Endpoints.university.videoUpload, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["university"] });
    },
  });
}

export function useVideoSubmissions() {
  return useQuery({
    queryKey: ["university", "video-submissions"],
    queryFn: () =>
      api<VideoSubmission[]>("get", Endpoints.university.videoUpload),
    staleTime: 30_000,
  });
}
