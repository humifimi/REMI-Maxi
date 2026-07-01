import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type {
  CopilotBriefing,
  CopilotChatStartRequest,
  CopilotChatStartResponse,
  CopilotChatSendRequest,
  CopilotChatSendResponse,
  CopilotChatEndResponse,
  CopilotSuggestionsResponse,
} from "@technician/types/copilot";

export function useCopilotBriefing(appointmentId: number) {
  return useQuery({
    queryKey: ["copilot-briefing", appointmentId],
    queryFn: () =>
      api<CopilotBriefing>(
        "get",
        Endpoints.copilot.briefing(appointmentId),
      ),
    staleTime: 60_000,
    enabled: appointmentId > 0,
    retry: 0,
  });
}

export function useCopilotSuggestions(appointmentId: number) {
  return useQuery({
    queryKey: ["copilot-suggestions", appointmentId],
    queryFn: () =>
      api<CopilotSuggestionsResponse>(
        "get",
        Endpoints.copilot.suggestions(appointmentId),
      ),
    staleTime: 120_000,
    enabled: appointmentId > 0,
    retry: 0,
  });
}

// PLAN-DEVIATION: 2026-04-26-ask-remi-session-wire — Copilot chat is a
// sessionful API. Callers must (1) start a session, (2) send messages
// keyed by sessionId, and (3) optionally end the session. See
// docs/PLAN-DEVIATIONS.md#2026-04-26-ask-remi-session-wire.

export function useCopilotChatStart() {
  return useMutation({
    mutationFn: (payload?: CopilotChatStartRequest) =>
      api<CopilotChatStartResponse>(
        "post",
        Endpoints.copilot.chatStart,
        payload ?? {},
      ),
  });
}

export function useCopilotChatSend(sessionId: string | null) {
  return useMutation({
    mutationFn: (payload: CopilotChatSendRequest) => {
      if (!sessionId) {
        throw new Error(
          "Cannot send Copilot chat message before session is initialized.",
        );
      }
      return api<CopilotChatSendResponse>(
        "post",
        Endpoints.copilot.chatMessage(sessionId),
        payload,
      );
    },
  });
}

export function useCopilotChatEnd() {
  return useMutation({
    mutationFn: (sessionId: string) =>
      api<CopilotChatEndResponse>(
        "delete",
        Endpoints.copilot.chatEnd(sessionId),
      ),
  });
}
