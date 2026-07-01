import { useQuery } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { CustomerPreferencesResponse } from "@technician/types/api";

export function useCustomerPreferences(customerId: number) {
  return useQuery({
    queryKey: ["customer-preferences", customerId],
    queryFn: () =>
      api<CustomerPreferencesResponse>(
        "get",
        Endpoints.preferences.byCustomer(customerId)
      ),
    staleTime: 30_000,
    enabled: customerId > 0,
    retry: 1,
  });
}
