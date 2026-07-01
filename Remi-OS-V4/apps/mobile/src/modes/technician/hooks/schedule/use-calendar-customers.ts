import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, franchiseApi } from "@technician/api/client";
import { Endpoints, FranchiseEndpoints } from "@technician/api/endpoints";
import { useAuthStore } from "@/src/stores/auth";
import { UserRole } from "@technician/types/enums";
import type {
  CustomerSearchResult,
  QuickCreateCustomerPayload,
} from "@technician/types/calendar";

const _base = ["calendar-customers"] as const;

export const calendarCustomerKeys = {
  all: _base,
  search: (query: string) => [..._base, "search", query] as const,
  recent: [..._base, "recent"] as const,
};

function useIsFranchise() {
  const role = useAuthStore((s) => s.user?.role);
  return role === UserRole.FRANCHISE_OWNER;
}

export function useCustomerSearch(query: string) {
  const isFranchise = useIsFranchise();
  return useQuery({
    queryKey: calendarCustomerKeys.search(query),
    queryFn: () =>
      isFranchise
        ? franchiseApi<CustomerSearchResult[]>(
            "get",
            FranchiseEndpoints.calendarV2.customerSearch,
            { q: query },
          )
        : api<CustomerSearchResult[]>(
            "get",
            Endpoints.calendar.customerSearch,
            { q: query },
          ),
    staleTime: 0,
    enabled: query.length >= 1,
  });
}

export function useRecentCustomers() {
  const isFranchise = useIsFranchise();
  return useQuery({
    queryKey: calendarCustomerKeys.recent,
    queryFn: () =>
      isFranchise
        ? franchiseApi<CustomerSearchResult[]>(
            "get",
            FranchiseEndpoints.calendarV2.recentCustomers,
          )
        : api<CustomerSearchResult[]>(
            "get",
            Endpoints.calendar.recentCustomers,
          ),
    staleTime: 30_000,
  });
}

export function useQuickCreateCustomer() {
  const queryClient = useQueryClient();
  const isFranchise = useIsFranchise();

  return useMutation({
    mutationFn: (payload: QuickCreateCustomerPayload) =>
      isFranchise
        ? franchiseApi<CustomerSearchResult>(
            "post",
            FranchiseEndpoints.calendarV2.quickCreateCustomer,
            payload,
          )
        : api<CustomerSearchResult>(
            "post",
            Endpoints.calendar.quickCreateCustomer,
            payload,
          ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: calendarCustomerKeys.all,
      });
    },
  });
}
