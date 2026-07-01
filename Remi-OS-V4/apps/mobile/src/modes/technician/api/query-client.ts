import { QueryClient } from "@tanstack/react-query";

/**
 * Singleton TanStack Query client for the app.
 *
 * Extracted into its own module so non-component code (e.g. the auth
 * store's `logout()` action) can call `queryClient.clear()` without
 * pulling in `Providers` and creating a circular dependency between
 * `src/stores/auth.ts` and `src/components/shared/providers.tsx`.
 *
 * Why a real singleton (not a factory): `QueryClientProvider` mounts
 * exactly once at the root of the tree (see `src/components/shared/
 * providers.tsx`), so creating multiple clients would orphan caches.
 *
 * Why expose `clear()` to the auth store:
 *   When a user logs out and a different user (or the same user with
 *   a different role) logs back in, the cache is otherwise still
 *   warm with the previous user's data. Symptoms:
 *     - FO logs out → tech logs in → tech briefly sees FO's cached
 *       schedule until staleTime expires.
 *     - FO modifies an appointment → logs out → tech logs in →
 *       tech still sees the pre-modification cached row.
 *   Clearing the cache on logout is the simplest correct fix for
 *   role-scoped data leakage between sessions.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
