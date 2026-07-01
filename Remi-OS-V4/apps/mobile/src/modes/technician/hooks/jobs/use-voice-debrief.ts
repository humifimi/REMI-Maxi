import { useMutation } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { DebriefResult } from "@technician/types/api";

export function useSubmitDebrief(jobId: number) {
  return useMutation({
    mutationFn: (payload: { text?: string; audio_url?: string }) =>
      api<DebriefResult>("post", Endpoints.voiceDebrief.submit(jobId), payload),
  });
}
