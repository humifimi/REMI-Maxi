/**
 * `useReorganizationPolicy` / `useUpdateReorganizationPolicy` —
 * franchise-scoped trust-gradient settings hooks (P7-FE-1).
 *
 * Master plan §2.5 / §3.6. The `franchises.reorganization_policy`
 * JSONB column stores a per-franchise policy object that controls
 * when reorganization sessions auto-commit vs. land at the franchise
 * owner as `pending_review`. The Reorganization Policy settings
 * screen (`src/screens/settings/ReorganizationPolicyScreen.tsx`)
 * consumes these hooks to render and persist the editable surface.
 *
 * Endpoint contract (sibling to this PR per the chunk prompt;
 * REMIBackend ships the matching `GET` / `PATCH` handlers):
 *
 *   GET   /api/v1/franchise/settings/reorganization-policy
 *     200 → { error: false, data: { policy: ReorganizationPolicy } }
 *
 *   PATCH /api/v1/franchise/settings/reorganization-policy
 *     Body: Partial<ReorganizationPolicy>
 *     200 → { error: false, data: { policy: ReorganizationPolicy } }
 *
 *   The `ai_authored` field is server-locked to `"always_fo_review"`
 *   in v1 (per §2.5 — "AI never auto-commits in v1") so the BE will
 *   reject any PATCH that attempts to change it. The FE form mirrors
 *   that constraint by rendering the field as a read-only badge
 *   rather than an editable control.
 *
 * Tenancy: the BE derives `franchise_id` from the FO's JWT, so the
 * FE never has to pass it. Non-FO callers receive `403`.
 *
 * Cache strategy:
 *   - `staleTime: 60_000` — policy changes are rare; longer stale
 *     window keeps the form snappy on settings re-entry without a
 *     refetch.
 *   - On successful PATCH we both `setQueryData` the new policy AND
 *     `invalidateQueries` so any other consumer (e.g. the FAB badge
 *     count once §6.5's policy-aware HUD lands) re-fetches.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { franchiseApi } from "@technician/api/client";
import { FranchiseEndpoints } from "@technician/api/endpoints";
import type { ReorganizationPolicy } from "@technician/types/reorganization";

export const reorganizationPolicyKeys = {
  all: ["franchise", "reorganization-policy"] as const,
};

interface ReorganizationPolicyEnvelope {
  policy: ReorganizationPolicy;
}

export function useReorganizationPolicy() {
  return useQuery({
    queryKey: reorganizationPolicyKeys.all,
    queryFn: async () => {
      const data = await franchiseApi<ReorganizationPolicyEnvelope>(
        "get",
        FranchiseEndpoints.settings.reorganizationPolicy,
      );
      return data.policy;
    },
    staleTime: 60_000,
  });
}

export function useUpdateReorganizationPolicy() {
  const queryClient = useQueryClient();

  return useMutation<
    ReorganizationPolicy,
    Error,
    Partial<ReorganizationPolicy>
  >({
    mutationFn: async (patch) => {
      const data = await franchiseApi<ReorganizationPolicyEnvelope>(
        "patch",
        FranchiseEndpoints.settings.reorganizationPolicy,
        patch,
      );
      return data.policy;
    },
    onSuccess: (policy) => {
      queryClient.setQueryData(reorganizationPolicyKeys.all, policy);
      queryClient.invalidateQueries({ queryKey: reorganizationPolicyKeys.all });
    },
  });
}
