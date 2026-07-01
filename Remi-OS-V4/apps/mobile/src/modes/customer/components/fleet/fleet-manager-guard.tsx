import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/src/stores/auth';

/**
 * Wraps a fleet manager screen. If the current user is a fleet_driver
 * (not a manager), redirect them to their fleet vehicle detail page.
 */
export function FleetManagerGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const demoFleetRole = useAuthStore((s) => s.demoFleetRole);
  const effectiveRole = user?.fleetRole ?? demoFleetRole;

  useEffect(() => {
    if (effectiveRole === 'fleet_driver') {
      router.replace('/customer/fleet/vehicles/1');
    }
  }, [effectiveRole, router]);

  if (effectiveRole === 'fleet_driver') {
    return null;
  }

  return <>{children}</>;
}

/**
 * Hook version — call at top of any fleet-manager-only screen.
 * Returns `true` when the user IS a manager (safe to render).
 * Returns `false` when redirecting a driver (render nothing).
 */
export function useFleetManagerGuard(): boolean {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const demoFleetRole = useAuthStore((s) => s.demoFleetRole);
  const effectiveRole = user?.fleetRole ?? demoFleetRole;

  useEffect(() => {
    if (effectiveRole === 'fleet_driver') {
      router.replace('/customer/fleet/vehicles/1');
    }
  }, [effectiveRole, router]);

  return effectiveRole !== 'fleet_driver';
}
