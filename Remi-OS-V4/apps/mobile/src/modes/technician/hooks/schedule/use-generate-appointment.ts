import { useMutation } from "@tanstack/react-query";
import { franchiseApi } from "@technician/api/client";
import { FranchiseEndpoints } from "@technician/api/endpoints";
import type {
  GenerateAppointmentPayload,
  ScoredSlot,
} from "@technician/types/calendar";

export function useGenerateAppointment() {
  return useMutation({
    mutationFn: (payload: GenerateAppointmentPayload) =>
      franchiseApi<{ suggestions: ScoredSlot[] }>(
        "post",
        FranchiseEndpoints.calendarV2.generateAppointment,
        payload,
      ),
  });
}
