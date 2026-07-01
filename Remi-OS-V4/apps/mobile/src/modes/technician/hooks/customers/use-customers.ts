import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type {
  User,
  CustomerDetailResponse,
  CustomerListItem,
} from "@technician/types/api";

export function useCustomerList() {
  return useQuery({
    queryKey: ["customers", "list"],
    queryFn: () => api<CustomerListItem[]>("get", Endpoints.customers.list),
    staleTime: 60_000,
  });
}

export function useCustomerDetail(id: number) {
  return useQuery({
    queryKey: ["customers", id],
    queryFn: () => api<CustomerDetailResponse>("get", Endpoints.customers.detail(id)),
    enabled: id > 0,
    retry: 1,
  });
}

export function useCustomerSearch(query: string) {
  return useQuery({
    queryKey: ["customers", "search", query],
    queryFn: () =>
      api<User[]>("get", Endpoints.customers.search, { q: query }),
    enabled: query.length >= 2,
    staleTime: 0,
  });
}

export function useQuickAddCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      full_name: string;
      phone?: string;
      email?: string;
    }) => {
      return api<User>("post", Endpoints.customers.quickAdd, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}
