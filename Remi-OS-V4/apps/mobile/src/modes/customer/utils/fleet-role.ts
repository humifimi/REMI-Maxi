import type { FleetRole } from '@customer/types/fleet';
import { useAuthStore } from '@/src/stores/auth';

export function getEffectiveFleetRole(): FleetRole | null {
  const { user, demoFleetRole } = useAuthStore.getState();
  return user?.fleetRole ?? demoFleetRole ?? null;
}

export function isFleetManager(): boolean {
  return getEffectiveFleetRole() === 'fleet_manager';
}

export function isFleetDriver(): boolean {
  return getEffectiveFleetRole() === 'fleet_driver';
}

export function hasFleetAccess(): boolean {
  const { user, demoFleetMode } = useAuthStore.getState();
  return !!(user?.fleetRole || demoFleetMode);
}
