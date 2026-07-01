import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, franchiseApi } from "@technician/api/client";
import { Endpoints, FranchiseEndpoints } from "@technician/api/endpoints";
import { useAuthStore } from "@/src/stores/auth";
import { UserRole } from "@technician/types/enums";
import { bugReportService } from "@technician/services/bug-report.service";
import type {
  BugReport,
  BugReportDetail,
  BugReportListItem,
  BatchFrustrationPayload,
  BatchFrustrationResponse,
  CreateBugReportPayload,
  KnownIssue,
  UploadUrlRequest,
  UploadUrlResponse,
  ReportMetrics,
} from "@technician/types/bug-report";

const KEYS = {
  list: ["bug-reports", "list"] as const,
  detail: (id: string) => ["bug-reports", "detail", id] as const,
  pending: ["bug-reports", "pending"] as const,
  knownIssues: ["bug-reports", "known-issues"] as const,
  metrics: ["bug-reports", "metrics"] as const,
};

function useIsTechnician(): boolean {
  const role = useAuthStore((s) => s.user?.role);
  return role === UserRole.TECHNICIAN;
}

export function useBugReportList(params?: { page?: number; per_page?: number }) {
  const isTech = useIsTechnician();

  return useQuery<BugReportListItem[]>({
    queryKey: [...KEYS.list, params],
    queryFn: async () => {
      if (isTech) {
        return api<BugReportListItem[]>("get", Endpoints.bugReports.list, params);
      }
      return franchiseApi<BugReportListItem[]>(
        "get",
        FranchiseEndpoints.bugReports.list,
        params
      );
    },
    staleTime: 30_000,
  });
}

export function useBugReportDetail(id: string | null) {
  const isTech = useIsTechnician();

  return useQuery<BugReportDetail>({
    queryKey: KEYS.detail(id ?? ""),
    queryFn: async () => {
      if (isTech) {
        return api<BugReportDetail>("get", Endpoints.bugReports.detail(id!));
      }
      return franchiseApi<BugReportDetail>(
        "get",
        FranchiseEndpoints.bugReports.detail(id!)
      );
    },
    enabled: !!id,
  });
}

export function usePendingCount() {
  return useQuery<number>({
    queryKey: KEYS.pending,
    queryFn: () => bugReportService.getPendingCount(),
    staleTime: 10_000,
  });
}

export function useKnownIssues() {
  const isTech = useIsTechnician();

  return useQuery<KnownIssue[]>({
    queryKey: KEYS.knownIssues,
    queryFn: async () => {
      if (isTech) {
        return api<KnownIssue[]>("get", Endpoints.bugReports.knownIssues);
      }
      return franchiseApi<KnownIssue[]>(
        "get",
        FranchiseEndpoints.bugReports.knownIssues
      );
    },
    staleTime: 60_000,
  });
}

export function useBugReportMetrics(params?: { date_from?: string; date_to?: string }) {
  return useQuery<ReportMetrics>({
    queryKey: [...KEYS.metrics, params],
    queryFn: () =>
      franchiseApi<ReportMetrics>("get", FranchiseEndpoints.bugReports.metrics, params),
    staleTime: 60_000,
  });
}

export function useSubmitBugReport() {
  const queryClient = useQueryClient();

  return useMutation<BugReport, Error, CreateBugReportPayload>({
    mutationFn: (payload) =>
      api<BugReport>("post", Endpoints.bugReports.submit, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.list });
      queryClient.invalidateQueries({ queryKey: KEYS.pending });
    },
  });
}

export function useBatchFrustration() {
  return useMutation<BatchFrustrationResponse, Error, BatchFrustrationPayload>({
    mutationFn: (payload) =>
      api<BatchFrustrationResponse>(
        "post",
        Endpoints.bugReports.frustration,
        payload
      ),
  });
}

export function useGetUploadUrl() {
  return useMutation<UploadUrlResponse, Error, UploadUrlRequest>({
    mutationFn: (payload) => {
      const role = useAuthStore.getState().user?.role;
      if (role === UserRole.TECHNICIAN) {
        return api<UploadUrlResponse>("post", Endpoints.bugReports.uploadUrl, payload);
      }
      return franchiseApi<UploadUrlResponse>(
        "post",
        FranchiseEndpoints.bugReports.uploadUrl,
        payload
      );
    },
  });
}

export function useSyncPendingReports() {
  const queryClient = useQueryClient();

  return useMutation<void, Error>({
    mutationFn: () => bugReportService.syncPending(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.list });
      queryClient.invalidateQueries({ queryKey: KEYS.pending });
    },
  });
}
