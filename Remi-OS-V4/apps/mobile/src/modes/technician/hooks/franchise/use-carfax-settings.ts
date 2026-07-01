/**
 * Phase 2 Chunk 2.3 — per-franchise CARFAX cadence settings hooks.
 *
 * Backs the FO-only Settings → CARFAX toggle. The BE ships
 * `GET / PUT /api/v1/franchise/settings/carfax` (Chunk 2.3 BE half,
 * squash `def18ca`); these hooks are the FE consumers.
 *
 *   GET    /franchise/settings/carfax
 *     200 → { error: false, data: { carfax_submission_cadence, carfax_location_id } }
 *
 *   PUT    /franchise/settings/carfax
 *     Body: { carfax_submission_cadence: "every_job" | "nightly_batch" }
 *     200  → { error: false, data: { carfax_submission_cadence } }
 *
 * `carfax_location_id` is a read-only echo so the settings screen can
 * show whether QuickVIN Plus is wired up — it's edited via the admin
 * integrations surface, not here.
 *
 * Auth: BE derives `franchise_id` from the FO's JWT, so the FE never
 * passes it. Non-FO callers receive `403`; the toggle UI is also
 * FO-role-gated on the FE for a cleaner experience.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { franchiseApi } from "@technician/api/client";
import { FranchiseEndpoints } from "@technician/api/endpoints";
import type { CarfaxSettings } from "@technician/types/api";
import type { CarfaxCadence } from "@technician/types/enums";

export const carfaxSettingsKeys = {
  all: ["franchise", "settings", "carfax"] as const,
};

export function useCarfaxSettings(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: carfaxSettingsKeys.all,
    queryFn: () =>
      franchiseApi<CarfaxSettings>("get", FranchiseEndpoints.settings.carfax),
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
  });
}

export function useUpdateCarfaxCadence() {
  const queryClient = useQueryClient();

  return useMutation<
    { carfax_submission_cadence: CarfaxCadence },
    Error,
    CarfaxCadence
  >({
    mutationFn: (cadence) =>
      franchiseApi<{ carfax_submission_cadence: CarfaxCadence }>(
        "put",
        FranchiseEndpoints.settings.carfax,
        { carfax_submission_cadence: cadence },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: carfaxSettingsKeys.all });
    },
  });
}
