import { useMutation } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { TechRatingPayload } from "@technician/types/api";

export function useSubmitTechRating() {
  return useMutation({
    mutationFn: async ({
      appointmentId,
      payload,
    }: {
      appointmentId: number;
      payload: TechRatingPayload;
    }) => {
      return api<void>(
        "post",
        Endpoints.ratings.submitTechRating(appointmentId),
        payload
      );
    },
  });
}
