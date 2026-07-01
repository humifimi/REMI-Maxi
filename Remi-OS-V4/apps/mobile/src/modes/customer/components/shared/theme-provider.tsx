import { useEffect } from 'react';
import { useThemeStore } from '@/src/stores/customer-theme';
import { useFranchiseTheme } from '@customer/hooks/use-franchise-theme';

/**
 * Hydrates the cached franchise theme on mount, then lazily fetches a fresh
 * copy from the API. Children render immediately with either cached or
 * default colors — the theme fetch never blocks app startup.
 */
export function ThemeHydration({ children }: { children: React.ReactNode }) {
  const hydrateTheme = useThemeStore((s) => s.hydrate);

  useEffect(() => {
    hydrateTheme();
  }, [hydrateTheme]);

  useFranchiseTheme();

  return <>{children}</>;
}
