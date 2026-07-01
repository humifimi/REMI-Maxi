import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { Referral } from "@technician/types/api";

export function useCreateReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      franchiseId: number;
      appointmentId?: number;
      category: string;
      notes?: string;
      photoUrls?: string[];
      routingMode?: string;
    }) =>
      api<Referral>("post", Endpoints.referrals.create, {
        franchise_id: payload.franchiseId,
        appointment_id: payload.appointmentId,
        category: payload.category,
        notes: payload.notes,
        photo_urls: payload.photoUrls,
        routing_mode: payload.routingMode,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["referrals"] });
    },
  });
}

export function useMyReferrals() {
  return useQuery({
    queryKey: ["referrals", "my"],
    queryFn: () => api<Referral[]>("get", Endpoints.referrals.myReferrals),
    staleTime: 30_000,
  });
}

export function useReferralDetail(id: number) {
  return useQuery({
    queryKey: ["referrals", id],
    queryFn: () => api<Referral>("get", Endpoints.referrals.detail(id)),
    enabled: id > 0,
  });
}
