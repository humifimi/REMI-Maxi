import { useMutation } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";

interface TimeOverflowPayload {
  service_name: string;
  duration_minutes: number;
}

interface TimeOverflowResponse {
  appointmentId: number;
  service_name: string;
  notified: boolean;
}

export function useNotifyTimeOverflow(appointmentId: number) {
  return useMutation({
    mutationFn: (payload: TimeOverflowPayload) =>
      api<TimeOverflowResponse>(
        "post",
        Endpoints.copilot.timeOverflow(appointmentId),
        payload,
      ),
  });
}
