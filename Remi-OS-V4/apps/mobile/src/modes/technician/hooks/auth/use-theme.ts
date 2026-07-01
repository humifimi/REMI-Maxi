import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import { useAuthStore } from "@/src/stores/auth";
import { useThemeStore, DEFAULT_THEME } from "@technician/stores/theme";
import type { FranchiseTheme } from "@technician/types/api";

export function useFranchiseTheme() {
  const user = useAuthStore((s) => s.user);
  const franchiseId = user?.franchiseId;

  return useQuery({
    queryKey: ["franchise-theme", franchiseId],
    queryFn: () => {
      if (!franchiseId) return DEFAULT_THEME;
      return api<FranchiseTheme>(
        "get",
        Endpoints.theme.byFranchise(franchiseId)
      );
    },
    enabled: !!franchiseId,
    staleTime: 5 * 60_000,
    retry: 0,
  });
}

/**
 * Mount once in the provider tree. Fetches the franchise theme
 * on login and writes it into the Zustand store.
 */
export function useThemeSync() {
  const { data: themeData } = useFranchiseTheme();
  const setTheme = useThemeStore((s) => s.setTheme);
  const hydrateTheme = useThemeStore((s) => s.hydrateTheme);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    hydrateTheme();
  }, [hydrateTheme]);

  useEffect(() => {
    if (isAuthenticated && themeData) {
      setTheme(themeData);
    }
  }, [isAuthenticated, themeData, setTheme]);
}
