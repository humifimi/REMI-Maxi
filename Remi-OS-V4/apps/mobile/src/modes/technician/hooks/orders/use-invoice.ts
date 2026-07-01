import { useQuery } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { Invoice } from "@technician/types/api";

export function useInvoice(jobId: number) {
  return useQuery({
    queryKey: ["invoice", jobId],
    queryFn: () => api<Invoice>("get", Endpoints.jobs.invoice(jobId)),
    enabled: jobId > 0,
  });
}
