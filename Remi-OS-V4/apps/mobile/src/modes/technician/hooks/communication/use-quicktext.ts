import { useMutation } from "@tanstack/react-query";
import { api, franchiseApi } from "@technician/api/client";
import { Endpoints, FranchiseEndpoints } from "@technician/api/endpoints";
import { useAuthStore } from "@/src/stores/auth";
import { UserRole } from "@technician/types/enums";
import type { QuickTextPayload } from "@technician/types/calendar";

export function useSendQuickText() {
  const role = useAuthStore((s) => s.user?.role);
  const isFranchise = role === UserRole.FRANCHISE_OWNER;

  return useMutation({
    mutationFn: ({
      appointmentId,
      payload,
    }: {
      appointmentId: number;
      payload: QuickTextPayload;
    }) =>
      isFranchise
        ? franchiseApi<{ sent: true }>(
            "post",
            FranchiseEndpoints.calendarV2.quicktext(appointmentId),
            payload,
          )
        : api<{ sent: true }>(
            "post",
            Endpoints.calendar.quicktext(appointmentId),
            payload,
          ),
  });
}
