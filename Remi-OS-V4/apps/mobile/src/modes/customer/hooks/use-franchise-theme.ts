import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { resolveApiBaseUrl } from '@customer/constants/config';
import { DEFAULT_FRANCHISE_ID } from '@customer/constants/config';
import { useThemeStore } from '@/src/stores/customer-theme';
import { useAuthStore } from '@/src/stores/auth';
import type { ApiResponse } from '@customer/types/api';
import type { FranchiseThemeResponse } from '@customer/types/theme';

/**
 * The franchise theme endpoint is public and lives outside the /customer
 * prefix, so we call it directly instead of through the authenticated apiClient.
 */
async function fetchFranchiseTheme(franchiseId: number): Promise<FranchiseThemeResponse> {
  const base = resolveApiBaseUrl().replace(/\/api\/v1\/customer\/?$/, '');
  const { data } = await axios.get<ApiResponse<FranchiseThemeResponse>>(
    `${base}/api/v1/franchise/${franchiseId}/theme`,
    { timeout: 10_000 },
  );
  return data.data;
}

export function useFranchiseTheme() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const applyTheme = useThemeStore((s) => s.applyTheme);
  const cacheTheme = useThemeStore((s) => s.cacheTheme);
  const isCacheStale = useThemeStore((s) => s.isCacheStale);
  const isLoaded = useThemeStore((s) => s.isLoaded);
  const colors = useThemeStore((s) => s.colors);
  const brand = useThemeStore((s) => s.brand);
  const fontFamily = useThemeStore((s) => s.fontFamily);
  const isCustom = useThemeStore((s) => s.isCustom);

  const shouldFetch = isLoaded && isCacheStale();

  const query = useQuery({
    queryKey: ['franchise-theme', DEFAULT_FRANCHISE_ID],
    queryFn: () => fetchFranchiseTheme(DEFAULT_FRANCHISE_ID),
    enabled: shouldFetch,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (query.data) {
      applyTheme(query.data);
      cacheTheme(query.data);
    }
  }, [query.data, applyTheme, cacheTheme]);

  useEffect(() => {
    if (isAuthenticated && isCacheStale()) {
      query.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  return { colors, brand, fontFamily, isCustom, isLoaded };
}
