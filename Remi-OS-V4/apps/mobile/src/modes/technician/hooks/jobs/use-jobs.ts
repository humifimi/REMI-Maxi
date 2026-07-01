import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { api, franchiseApi } from "@technician/api/client";
import { Endpoints, FranchiseEndpoints } from "@technician/api/endpoints";
import type { Appointment, CarfaxStatus, JobDetail } from "@technician/types/api";
import type { WalkInBookingResponse } from "@technician/types/booking";
import type { AppointmentStatus } from "@technician/types/enums";
import { useAuthStore } from "@/src/stores/auth";
import { UserRole } from "@technician/types/enums";

export function useJobs() {
  return useQuery({
    queryKey: ["jobs"],
    queryFn: () => api<Appointment[]>("get", Endpoints.jobs.list),
  });
}

export const FRANCHISE_ORDERS_PAGE_SIZE = 50;

interface FranchiseOrdersPage {
  items: Appointment[];
  total: number;
  has_more: boolean;
  next_offset: number | null;
}

/**
 * 2026-05-25 — switched from `useQuery` returning a flat
 * `Appointment[]` to `useInfiniteQuery` so the screen can scroll
 * paginated chunks of 50 instead of fetching all 8,632 paid
 * appointments up-front.
 *
 * Returns the same surface the previous version did
 * (`data: Appointment[]`, `isLoading`, `isRefetching`, `refetch`)
 * via a synthesized flat list of all pages, so the screen-level
 * consumer doesn't need to know it's paginated. Two extra fields
 * are surfaced for screens that want them: `hasNextPage` and
 * `fetchNextPage` for explicit "Load more" triggers, plus `total`
 * so the UI can show "X of Y" counters.
 *
 * Companion REMIBackend PR #141 adds the `limit`/`offset` support
 * to `/franchise/orders`.
 */
export function useFranchiseOrders(franchiseId: number) {
  const query = useInfiniteQuery({
    queryKey: ["franchise-orders", franchiseId],
    queryFn: ({ pageParam = 0 }) =>
      franchiseApi<FranchiseOrdersPage>("get", FranchiseEndpoints.orders, {
        franchiseId,
        limit: FRANCHISE_ORDERS_PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.next_offset ?? undefined,
    enabled: franchiseId > 0,
  });

  // Flatten pages into the single `Appointment[]` shape the screen
  // previously got from useQuery. The `total` and `hasNextPage`
  // affordances are surfaced separately for "X of Y" counters and
  // explicit "Load more" buttons.
  const data = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data]
  );
  const total = query.data?.pages[query.data.pages.length - 1]?.total ?? 0;

  return {
    ...query,
    data,
    total,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}

// @demo-start
const DEMO_CARFAX_STATUSES: Record<number, CarfaxStatus> = {
  0: { status: "pending", reported_at: null, error_reason: null },
  1: { status: "reported", reported_at: "2026-04-13T10:30:00", error_reason: null },
  2: { status: "failed", reported_at: null, error_reason: "VIN not found in CARFAX database" },
  3: { status: "n/a", reported_at: null, error_reason: null },
};
// @demo-end

export function useJobDetail(id: number) {
  return useQuery({
    queryKey: ["jobs", id],
    queryFn: () => api<JobDetail>("get", Endpoints.jobs.detail(id)),
    enabled: id > 0,
    // @demo-start
    select: (data) => {
      if (data && !data.carfax) {
        return { ...data, carfax: DEMO_CARFAX_STATUSES[id % 4] };
      }
      return data;
    },
    // @demo-end
  });
}

export function useUpdateJobStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      cancellation_reason,
    }: {
      id: number;
      status: AppointmentStatus;
      cancellation_reason?: string;
    }) => {
      return api<Appointment>("put", Endpoints.jobs.updateStatus(id), {
        status,
        cancellation_reason,
      });
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["jobs", id] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });
}

// PLAN-DEVIATION: 2026-04-26-walk-in-response-shape — BE returns
// `WalkInBookingResponse` ({ appointment_id, ... }) not `Appointment` ({ id }).
// See REMIBackend/src/services/jobs/job.service.ts → createWalkInJob and
// docs/implementation-plans/wellness-ai-and-walk-in-contract.md § 2.
// Reading `.id` here previously produced `undefined`, which routed to
// `/job/undefined/services` and triggered the "Job Not Found" alert.
export function useCreateWalkInJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      customer_id?: number;
      new_customer?: { full_name: string; phone?: string };
      vehicle_id: number;
      service_ids?: number[];
      franchise_id?: number;
      notes?: string;
    }) => {
      console.log("[job-flow] create walk-in request", data);
      const result = await api<WalkInBookingResponse>("post", Endpoints.jobs.walkIn, {
        service_ids: [],
        ...data,
      });
      console.log("[job-flow] create walk-in response", result);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["franchise-orders"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useOrderSearch(query: string) {
  const user = useAuthStore.getState().user;
  const isFranchise = user?.role === UserRole.FRANCHISE_OWNER;

  return useQuery({
    queryKey: ["order-search", query],
    queryFn: () =>
      isFranchise
        ? franchiseApi<Appointment[]>("get", FranchiseEndpoints.orderSearch, { q: query })
        : api<Appointment[]>("get", Endpoints.orders.search, { q: query }),
    enabled: query.length >= 2,
    staleTime: 0,
  });
}

export function useExportOrdersCsv() {
  const user = useAuthStore.getState().user;
  const isFranchise = user?.role === UserRole.FRANCHISE_OWNER;

  return useMutation({
    mutationFn: (appointmentIds: number[]) =>
      isFranchise
        ? franchiseApi<string>("post", FranchiseEndpoints.exportCsv, { appointmentIds })
        : api<string>("post", Endpoints.orders.exportCsv, { appointmentIds }),
  });
}

export function useExportOrdersPdf() {
  const user = useAuthStore.getState().user;
  const isFranchise = user?.role === UserRole.FRANCHISE_OWNER;

  return useMutation({
    mutationFn: (appointmentIds: number[]) =>
      isFranchise
        ? franchiseApi<string>("post", FranchiseEndpoints.exportPdf, { appointmentIds })
        : api<string>("post", Endpoints.orders.exportPdf, { appointmentIds }),
  });
}

export function useBulkMarkPaid() {
  const queryClient = useQueryClient();
  const user = useAuthStore.getState().user;
  const isFranchise = user?.role === UserRole.FRANCHISE_OWNER;

  // The BE returns the per-appointment results directly as the envelope's
  // `data` field (a flat array), not wrapped in a `{ results: [...] }`
  // object. The previous `{ results }` typing was carry-over from the demo
  // fallback shape that landed before the BE was wired and stayed because
  // the demo branch masked the runtime shape mismatch.
  return useMutation({
    mutationFn: (appointmentIds: number[]) =>
      isFranchise
        ? franchiseApi<{ id: number; status: string; reason?: string }[]>(
            "post",
            FranchiseEndpoints.bulkMarkPaid,
            { appointmentIds }
          )
        : api<{ id: number; status: string; reason?: string }[]>(
            "post",
            Endpoints.orders.bulkMarkPaid,
            { appointmentIds }
          ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["franchise-orders"] });
    },
  });
}

export function useSendReceipt() {
  return useMutation({
    mutationFn: ({ jobId, method }: { jobId: number; method: "sms" | "email" }) =>
      api<{ sent: boolean }>("post", Endpoints.jobs.sendReceipt(jobId), { method }),
  });
}

export function useReportCarfax() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: number) =>
      api<{ message: string; report?: CarfaxStatus }>(
        "post",
        Endpoints.jobs.reportCarfax(jobId),
      ),
    onSuccess: (_, jobId) => {
      queryClient.invalidateQueries({ queryKey: ["jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useRetryCarfax() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (appointmentId: number) =>
      api<CarfaxStatus>("post", Endpoints.carfax.retry(appointmentId)),
    onSuccess: (_, appointmentId) => {
      queryClient.invalidateQueries({ queryKey: ["jobs", appointmentId] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useAddOrderNote(jobId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (note: string) =>
      api<{ id: number }>("post", Endpoints.orders.addNote(jobId), { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["franchise-orders"] });
    },
  });
}

export function useTagForReview() {
  const queryClient = useQueryClient();
  const user = useAuthStore.getState().user;
  const isFranchise = user?.role === UserRole.FRANCHISE_OWNER;

  return useMutation({
    mutationFn: (appointmentIds: number[]) =>
      isFranchise
        ? franchiseApi<{ tagged: number }>(
            "post",
            FranchiseEndpoints.tagForReview,
            { appointmentIds }
          )
        : api<{ tagged: number }>(
            "post",
            Endpoints.orders.tagForReview,
            { appointmentIds }
          ),
    onSuccess: (_, appointmentIds) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["franchise-orders"] });
      for (const id of appointmentIds) {
        queryClient.invalidateQueries({ queryKey: ["jobs", id] });
      }
    },
  });
}

export function useFleetOrders(companyId: number, params?: { page?: number; limit?: number; status?: string }) {
  return useQuery({
    queryKey: ["fleet-orders", companyId, params],
    queryFn: () =>
      franchiseApi<Appointment[]>(
        "get",
        FranchiseEndpoints.fleet.companyOrders(companyId),
        params
      ),
    enabled: companyId > 0,
    staleTime: 30_000,
  });
}
