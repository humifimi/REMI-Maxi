import { useEffect } from 'react';
import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { useAuthStore } from '@/src/stores/auth';
import {
  useAppModeStore,
  isCustomerPath,
  customerHomePath,
  technicianHomePath,
} from '@/src/stores/app-mode';

const TECH_AUTH = new Set(['/login', '/welcome', '/register', '/forgot-password', '/reset-password']);

/**
 * Keeps the active URL tree aligned with the selected app mode
 * (technician vs customer). Customer routes live under `/customer/*`.
 */
export function AppModeRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const rootNavigationState = useRootNavigationState();
  const navigationReady = rootNavigationState?.key != null;
  const mode = useAppModeStore((s) => s.mode);
  const modeHydrated = useAppModeStore((s) => s.isHydrated);
  const authHydrated = useAuthStore((s) => s.isHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const biometricRequired = useAuthStore((s) => s.biometricRequired);

  useEffect(() => {
    if (!navigationReady || !modeHydrated || !authHydrated) return;

    const inCustomer = isCustomerPath(pathname);
    const inTechAuth = TECH_AUTH.has(pathname);

    if (biometricRequired) return;

    if (mode === 'customer') {
      if (!inCustomer && isAuthenticated) {
        if (pathname !== customerHomePath()) {
          router.replace(customerHomePath());
        }
        return;
      }
      if (!inCustomer && !isAuthenticated && !inTechAuth) {
        router.replace('/customer/welcome');
      }
      return;
    }

    // technician mode
    if (inCustomer) {
      if (isAuthenticated) {
        router.replace(technicianHomePath());
      } else {
        router.replace('/login');
      }
    }
  }, [
    navigationReady,
    mode,
    modeHydrated,
    authHydrated,
    isAuthenticated,
    biometricRequired,
    pathname,
    router,
  ]);

  return null;
}
