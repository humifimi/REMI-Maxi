import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { AppointmentLineItem } from "@technician/types/api";

/**
 * Phase 3 Chunk 3.2 — substitution recording.
 *
 * Posts the actual SKU the technician used for a `part`/`fluid` line
 * item. The BE preserves the original-original `part_number` in
 * `substituted_for_part_number` on the first substitute and never
 * overwrites it; subsequent re-substitutes update `part_number` /
 * `description` / `substitution_reason` only. Chunk 3.1's
 * CONSUME_ON_COMPLETE hook reads `part_number` as-is, so substituting
 * the column flows through to the consume row at COMPLETED transition
 * — no FE consume-coordination needed.
 */
export function useSubstituteLineItem(jobId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      lineItemId,
      actual_part_number,
      actual_description,
      reason,
    }: {
      lineItemId: number;
      actual_part_number: string;
      actual_description?: string;
      reason?: string;
    }) => {
      return api<AppointmentLineItem>(
        "post",
        Endpoints.jobs.substituteLineItem(jobId, lineItemId),
        {
          actual_part_number,
          ...(actual_description !== undefined && { actual_description }),
          ...(reason !== undefined && { reason }),
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", jobId] });
    },
  });
}
