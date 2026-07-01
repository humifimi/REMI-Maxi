import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserRole } from '@technician/types/enums';
import type { AuthUser } from '@technician/types/api';

export type AppMode = 'technician' | 'customer';

const STORAGE_KEY = 'remi_app_mode';

const CUSTOMER_APP_ROLES = new Set<string>([UserRole.CUSTOMER]);

export function appModeFromUser(user: AuthUser | null | undefined): AppMode {
  if (!user) return 'technician';
  if (user.appMode === 'customer' || user.appMode === 'technician') {
    return user.appMode;
  }
  if (CUSTOMER_APP_ROLES.has(user.role) || user.fleetRole) return 'customer';
  return 'technician';
}

export function canManageRoles(role: string | undefined): boolean {
  return role === UserRole.ADMINISTRATOR;
}

interface AppModeState {
  mode: AppMode;
  isHydrated: boolean;
  setMode: (mode: AppMode) => Promise<void>;
  syncFromUser: (user: AuthUser | null | undefined) => Promise<void>;
  hydrate: () => Promise<void>;
}

export const useAppModeStore = create<AppModeState>((set, get) => ({
  mode: 'technician',
  isHydrated: false,

  setMode: async (mode) => {
    await AsyncStorage.setItem(STORAGE_KEY, mode);
    set({ mode });
  },

  syncFromUser: async (user) => {
    const next = appModeFromUser(user);
    if (get().mode !== next) {
      await AsyncStorage.setItem(STORAGE_KEY, next);
      set({ mode: next });
    }
  },

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored === 'customer' || stored === 'technician') {
        set({ mode: stored, isHydrated: true });
        return;
      }
    } catch {
      // fall through
    }
    set({ isHydrated: true });
  },
}));

export function isCustomerPath(pathname: string): boolean {
  return pathname === '/customer' || pathname.startsWith('/customer/');
}

export function customerHomePath(): string {
  return '/customer';
}

export function technicianHomePath(): string {
  return '/(tabs)';
}
