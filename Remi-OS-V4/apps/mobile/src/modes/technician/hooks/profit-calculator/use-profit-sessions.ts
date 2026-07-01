// PM-6 — TanStack Query layer for profit-model session save/load.
// One file per domain (per architecture rule). Query keys follow the project
// convention: `[domain, ...params]`. List + detail keys are colocated under
// `profitSessionKeys` so invalidation after a mutation can target the family.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { profitModelApi } from "@technician/api/profit-model";
import type {
  CreateAnonymousSessionPayload,
  CreateAuthenticatedSessionPayload,
  ProfitModelSession,
  ProfitModelSessionListResponse,
  UpdateSessionPayload,
} from "@technician/types/profit-model";

export const profitSessionKeys = {
  all: ["profit-sessions"] as const,
  list: () => [...profitSessionKeys.all, "list"] as const,
  detail: (shareToken: string) =>
    [...profitSessionKeys.all, "detail", shareToken] as const,
};

/** Authenticated paginated list of saved sessions (newest-first). */
export function useMyProfitSessions(
  options?: Omit<
    UseQueryOptions<ProfitModelSessionListResponse>,
    "queryKey" | "queryFn"
  >
) {
  return useQuery<ProfitModelSessionListResponse>({
    queryKey: profitSessionKeys.list(),
    queryFn: () => profitModelApi.listMySessions(),
    staleTime: 30_000,
    ...options,
  });
}

/**
 * Fetch a session by share token. No auth required — the token is the
 * credential. Used by the share/[token] deep-link route.
 */
export function useProfitSession(
  shareToken: string | null | undefined,
  options?: Omit<
    UseQueryOptions<ProfitModelSession>,
    "queryKey" | "queryFn" | "enabled"
  >
) {
  return useQuery<ProfitModelSession>({
    queryKey: profitSessionKeys.detail(shareToken ?? ""),
    queryFn: () => profitModelApi.getSession(shareToken as string),
    enabled: !!shareToken,
    staleTime: 0,
    ...options,
  });
}

export function useCreateAnonymousProfitSession() {
  return useMutation({
    mutationFn: (payload: CreateAnonymousSessionPayload) =>
      profitModelApi.createAnonymousSession(payload),
  });
}

export function useCreateAuthenticatedProfitSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAuthenticatedSessionPayload) =>
      profitModelApi.createAuthenticatedSession(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: profitSessionKeys.list() });
    },
  });
}

export function useUpdateProfitSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      shareToken,
      patch,
    }: {
      shareToken: string;
      patch: UpdateSessionPayload;
    }) => profitModelApi.updateSession(shareToken, patch),
    onSuccess: (session) => {
      qc.setQueryData(profitSessionKeys.detail(session.share_token), session);
      qc.invalidateQueries({ queryKey: profitSessionKeys.list() });
    },
  });
}

export function useDeleteProfitSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shareToken: string) =>
      profitModelApi.deleteSession(shareToken),
    onSuccess: (_void, shareToken) => {
      qc.removeQueries({ queryKey: profitSessionKeys.detail(shareToken) });
      qc.invalidateQueries({ queryKey: profitSessionKeys.list() });
    },
  });
}
