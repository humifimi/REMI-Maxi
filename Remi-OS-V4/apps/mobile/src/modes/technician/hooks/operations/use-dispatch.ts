import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type {
  ScoredSuggestion,
  SuggestDispatchInput,
  AcceptDispatchResponse,
  RejectDispatchResponse,
} from "@technician/types/api";
import type { DispatchRejectReason } from "@technician/types/enums";

export function useSuggestDispatch() {
  return useMutation({
    mutationFn: (input: SuggestDispatchInput) =>
      api<ScoredSuggestion[]>("post", Endpoints.dispatch.suggest, input),
  });
}

export function useAcceptDispatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (appointmentId: number) =>
      api<AcceptDispatchResponse>(
        "post",
        Endpoints.dispatch.accept(appointmentId)
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["routes"] });
    },
  });
}

export function useRejectDispatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      appointmentId,
      reason,
      notes,
    }: {
      appointmentId: number;
      reason: DispatchRejectReason;
      notes?: string;
    }) =>
      api<RejectDispatchResponse>(
        "post",
        Endpoints.dispatch.reject(appointmentId),
        { reason, notes }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });
}
