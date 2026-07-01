import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { franchiseApi } from "@technician/api/client";
import { FranchiseEndpoints } from "@technician/api/endpoints";
import type {
  FranchiseTaxRate,
  TaxRateUpsertPayload,
} from "@technician/types/calendar";

export const taxRateKeys = {
  all: ["tax-rates"] as const,
};

export function useTaxRates() {
  return useQuery({
    queryKey: taxRateKeys.all,
    queryFn: () =>
      franchiseApi<FranchiseTaxRate[]>(
        "get",
        FranchiseEndpoints.calendarV2.taxRates,
      ),
    staleTime: 60_000,
  });
}

export function useUpsertTaxRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: TaxRateUpsertPayload) =>
      franchiseApi<FranchiseTaxRate>(
        "put",
        FranchiseEndpoints.calendarV2.taxRates,
        payload,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: taxRateKeys.all });
    },
  });
}
