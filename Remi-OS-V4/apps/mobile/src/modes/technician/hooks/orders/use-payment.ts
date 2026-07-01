import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { PaymentIntentResult } from "@technician/types/api";

export function useCollectPayment() {
  return useMutation({
    mutationFn: async ({ jobId }: { jobId: number }) => {
      return api<PaymentIntentResult>(
        "post",
        Endpoints.jobs.collectPayment(jobId)
      );
    },
  });
}

export function useConfirmPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      jobId,
      payment_intent_id,
      amount,
    }: {
      jobId: number;
      payment_intent_id: string;
      amount: number;
    }) => {
      return api<void>("post", Endpoints.jobs.confirmPayment(jobId), {
        payment_intent_id,
        amount,
      });
    },
    onSuccess: (_, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: ["jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", jobId] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });
}

// 2026-05-24 — sibling of `useConfirmPayment` for non-Stripe payment
// methods. Cash flips the appointment to PAID, invoice_later flips it
// to COMPLETED. Without this hook, picking cash/invoice on the FE
// payment screen silently navigated to /debrief without ever
// committing the job (Ruth 67800 + Clarence 67802 on 2026-05-24).
export function useRecordNonCardPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      jobId,
      method,
      amount,
    }: {
      jobId: number;
      method: "cash" | "invoice_later";
      amount: number;
    }) => {
      return api<void>(
        "post",
        Endpoints.jobs.recordNonCardPayment(jobId),
        { method, amount },
      );
    },
    onSuccess: (_, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: ["jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", jobId] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}
