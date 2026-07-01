import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import type { ManufacturerRecommendation, InspectionResultStatus } from "@technician/types/api";

// `GET /vehicles/:vehicleId/recommendations` is mounted on the customer
// router (see REMIBackend `src/routes/v1/customer/index.ts:163-172`) but
// NOT yet on the technician router — tracked as the first row in
// `docs/implementation-plans/demo-to-production-bundle.md` §C "missing
// endpoints" table. Until that BE route ships, this query will 404 and
// resolve to `[]`; the only consumer (`RecommendationsSection` in
// `app/customer/[id].tsx`) renders nothing when the list is empty, which
// is the honest empty-state until OEM data is real for techs too. Pairs
// with the sibling REMICustomer change that drops the customer-side
// `DEMO_OEM_RECOMMENDATIONS` fallback in `use-vehicle-health.ts`.
export function useVehicleRecommendations(vehicleId: number) {
  return useQuery({
    queryKey: ["recommendations", vehicleId],
    queryFn: async () => {
      try {
        const result = await api<ManufacturerRecommendation[]>(
          "get",
          Endpoints.recommendations.byVehicle(vehicleId),
        );
        return result ?? [];
      } catch {
        return [];
      }
    },
    staleTime: 30_000,
    enabled: vehicleId > 0,
    retry: 1,
  });
}

export function useLogInspection(jobId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      recId,
      result,
    }: {
      recId: number;
      result: InspectionResultStatus;
    }) =>
      api<void>("put", Endpoints.recommendations.logInspection(jobId, recId), {
        result,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recommendations"] });
    },
  });
}
