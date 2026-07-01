import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type {
  CheckInResponse,
  WellnessCheckInRequest,
  WellnessStreakResponse,
  WellnessHistoryResponse,
  WellnessAiResponse,
  WellnessNudge,
} from "@technician/types/wellness";

export function useWellnessStreak() {
  return useQuery({
    queryKey: ["wellness-streak"],
    queryFn: () =>
      api<WellnessStreakResponse>("get", Endpoints.wellness.streak),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useWellnessHistory() {
  return useQuery({
    queryKey: ["wellness-history"],
    queryFn: () =>
      api<WellnessHistoryResponse>("get", Endpoints.wellness.history),
    staleTime: 60_000,
    retry: 1,
  });
}

// POST /wellness/check-in returns the `CheckInResponse` shape with `ai_response`
// embedded — single round-trip per `wellness-ai-and-walk-in-contract.md` § 2.
// The screen no longer fires a follow-up POST /coach-response.
export function useWellnessCheckIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: WellnessCheckInRequest) =>
      api<CheckInResponse>("post", Endpoints.wellness.checkin, {
        mood_score: payload.mood,
        note: payload.note,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wellness-streak"] });
      queryClient.invalidateQueries({ queryKey: ["wellness-history"] });
    },
  });
}

// Legacy two-call path — retained for the smart-nudge deep-link history view
// (GET /wellness/coach-response/:id) and any consumer that needs to force a
// regeneration. The check-in screen does NOT call this anymore.
export function useGenerateCoachResponse() {
  return useMutation({
    mutationFn: (checkInId: number) =>
      api<WellnessAiResponse>(
        "post",
        Endpoints.wellness.generateCoachResponse,
        { check_in_id: checkInId },
      ),
  });
}

// GET /wellness/coach-response/:id — used by the wellness_nudge deep-link
// handler to fetch the pre-generated supportive content the backend stamped
// into the push payload as `ai_response_id`.
export function useCoachResponse(id: number | null) {
  return useQuery({
    queryKey: ["wellness-coach-response", id],
    queryFn: () =>
      api<WellnessAiResponse>(
        "get",
        Endpoints.wellness.coachResponse(id as number),
      ),
    enabled: id != null && id > 0,
    staleTime: 5 * 60_000,
    retry: 0,
  });
}

export function useWellnessNudges() {
  return useQuery({
    queryKey: ["wellness-nudges"],
    queryFn: () => api<WellnessNudge[]>("get", Endpoints.wellness.nudges),
    staleTime: 60_000,
    retry: 0,
  });
}

export function useAcknowledgeNudge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (nudgeId: number) =>
      api<WellnessNudge>(
        "post",
        Endpoints.wellness.acknowledgeNudge(nudgeId),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wellness-nudges"] });
    },
  });
}
