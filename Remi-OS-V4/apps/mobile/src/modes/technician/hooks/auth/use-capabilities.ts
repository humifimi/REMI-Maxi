/**
 * LDM-WAVE-1 CHUNK-2 — Plural capabilities hook.
 *
 * Fetches the current user's effective capability set from the BE
 * `GET /auth/me/capabilities` endpoint (shipped by REMIBackend PR
 * JaceG/REMIBackend#89). The BE resolves role-defaults + per-user grant
 * overrides − per-user deny overrides and returns a flat `string[]`.
 *
 * Caching model:
 *   - Query key includes `userId` so user-switching on the same device
 *     does not leak the prior user's caps. (`clearSessionScopedState`
 *     in `src/stores/auth.ts` also wipes the whole `queryClient` on
 *     logout, but keying by userId is the cheaper guard against the
 *     "rehydrate before logout flushes" race.)
 *   - `staleTime: Infinity` — caps don't change spontaneously. The
 *     ONLY places the cache gets invalidated are:
 *       1. `setUser` (login path — see `src/stores/auth.ts`).
 *       2. `clearSessionScopedState` (logout + refresh-token-failure;
 *          both paths call `useAuthStore.logout()` which calls this).
 *     Consumers should NOT call `invalidateQueries(["auth",
 *     "capabilities"])` from elsewhere; the auth store is the single
 *     source of truth for capability-cache freshness per the chunk-2
 *     behavior contract.
 *   - `enabled` gates on `userId` so an unauthenticated render (e.g.
 *     the login screen) doesn't 401 on the request.
 *
 * Role-based namespace selection:
 *   - Technician → `api()` → `/api/v1/technician/auth/me/capabilities`.
 *   - Franchise owner → `franchiseApi()` → `/api/v1/franchise/auth/me/capabilities`.
 *   - Other roles (customer/dispatcher/franchisor) don't ship in this
 *     app per `architecture.mdc`, but if they appear we fall back to
 *     the technician namespace — the BE controller is identical across
 *     namespaces, only the route prefix differs. This keeps the hook
 *     fail-open at the FE: a misconfigured role doesn't break the
 *     query, it just hits a route that the BE will 403/404 if it's
 *     not authorized for that prefix.
 *
 * Return shape mirrors the spec exactly: `{ capabilities, isLoading,
 * isError }`. `capabilities` is `Set<Capability> | undefined` —
 * undefined until the first fetch completes, so consumers fail-closed
 * by default (see `use-capability.ts`).
 *
 * Spec: docs/implementation-plans/landscape-dispatch-map-wave-1.md
 *       §CHUNK-2 — Permissions wiring (FE half)
 */

import { useQuery } from "@tanstack/react-query";
import { api, franchiseApi } from "@technician/api/client";
import { Endpoints, FranchiseEndpoints } from "@technician/api/endpoints";
import { useAuthStore } from "@/src/stores/auth";
import {
  isCapability,
  type Capability,
} from "@technician/types/capabilities";
import { UserRole } from "@technician/types/enums";

interface CapabilitiesResponse {
  capabilities: string[];
}

export interface UseCapabilitiesResult {
  capabilities: Set<Capability> | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function useCapabilities(): UseCapabilitiesResult {
  const user = useAuthStore((s) => s.user);
  const userId = user?.userId;
  const role = user?.role;

  const query = useQuery({
    queryKey: ["auth", "capabilities", userId],
    queryFn: async () => {
      const response =
        role === UserRole.FRANCHISE_OWNER
          ? await franchiseApi<CapabilitiesResponse>(
              "get",
              FranchiseEndpoints.auth.capabilities
            )
          : await api<CapabilitiesResponse>(
              "get",
              Endpoints.auth.capabilities
            );

      const filtered = new Set<Capability>();
      for (const raw of response.capabilities) {
        if (isCapability(raw)) {
          filtered.add(raw);
        }
      }
      return filtered;
    },
    enabled: userId !== undefined,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });

  return {
    capabilities: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
