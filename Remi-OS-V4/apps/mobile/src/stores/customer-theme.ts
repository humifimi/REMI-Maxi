import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Theme as DefaultTheme } from '@customer/constants/colors';
import { Brand as DefaultBrand } from '@customer/constants/brand';
import type {
  FranchiseThemeResponse,
  ResolvedThemeColors,
  ResolvedBrand,
  CachedTheme,
} from '@customer/types/theme';

const CACHE_KEY = 'remi_franchise_theme';
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function darkenHex(hex: string, amount = 0.15): string {
  const h = hex.replace('#', '');
  const r = Math.max(0, Math.round(parseInt(h.substring(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(h.substring(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(h.substring(4, 6), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function resolveColors(theme: FranchiseThemeResponse): ResolvedThemeColors {
  return {
    primary: theme.primary_color,
    primaryDark: darkenHex(theme.primary_color),
    secondary: theme.secondary_color,
    accent: theme.accent_color ?? theme.primary_color,
    background: theme.background_color ?? DefaultTheme.colors.background,
    surface: theme.surface_color ?? DefaultTheme.colors.surface,
    surfaceElevated: DefaultTheme.colors.surfaceElevated,
    text: theme.text_color ?? DefaultTheme.colors.text,
    textSecondary: DefaultTheme.colors.textSecondary,
    textTertiary: DefaultTheme.colors.textTertiary,
    border: DefaultTheme.colors.border,
    borderLight: DefaultTheme.colors.borderLight,
    error: theme.error_color ?? DefaultTheme.colors.error,
    success: DefaultTheme.colors.success,
    warning: DefaultTheme.colors.warning,
    white: DefaultTheme.colors.white,
    black: DefaultTheme.colors.black,
  };
}

function resolveBrand(theme: FranchiseThemeResponse): ResolvedBrand {
  return {
    appName: theme.app_name || DefaultBrand.appName,
    tagline: theme.tagline || DefaultBrand.tagline,
    logoUrl: theme.logo_url,
    logoDarkUrl: theme.logo_dark_url,
    supportPhone: theme.support_phone || '',
    supportEmail: theme.support_email || '',
    customCopy: theme.custom_copy,
  };
}

const DEFAULT_COLORS: ResolvedThemeColors = {
  ...DefaultTheme.colors,
  accent: DefaultTheme.colors.primary,
};

const DEFAULT_BRAND: ResolvedBrand = {
  appName: DefaultBrand.appName,
  tagline: DefaultBrand.tagline,
  logoUrl: null,
  logoDarkUrl: null,
  supportPhone: '',
  supportEmail: '',
  customCopy: null,
};

interface CustomerThemeState {
  colors: ResolvedThemeColors;
  brand: ResolvedBrand;
  fontFamily: string | null;
  isCustom: boolean;
  isLoaded: boolean;
  lastFetchedAt: number | null;

  applyTheme: (theme: FranchiseThemeResponse) => void;
  reset: () => void;
  hydrate: () => Promise<void>;
  cacheTheme: (theme: FranchiseThemeResponse) => Promise<void>;
  isCacheStale: () => boolean;
}

export const useCustomerThemeStore = create<CustomerThemeState>((set, get) => ({
  colors: DEFAULT_COLORS,
  brand: DEFAULT_BRAND,
  fontFamily: null,
  isCustom: false,
  isLoaded: false,
  lastFetchedAt: null,

  applyTheme: (theme) => {
    set({
      colors: resolveColors(theme),
      brand: resolveBrand(theme),
      fontFamily: theme.font_family_body ?? theme.font_family_heading ?? null,
      isCustom: theme.is_custom,
      isLoaded: true,
      lastFetchedAt: Date.now(),
    });
  },

  reset: () => {
    set({
      colors: DEFAULT_COLORS,
      brand: DEFAULT_BRAND,
      fontFamily: null,
      isCustom: false,
      isLoaded: true,
      lastFetchedAt: null,
    });
    AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
  },

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (!raw) {
        set({ isLoaded: true });
        return;
      }
      const cached: CachedTheme = JSON.parse(raw);
      set({
        colors: resolveColors(cached.theme),
        brand: resolveBrand(cached.theme),
        fontFamily:
          cached.theme.font_family_body ?? cached.theme.font_family_heading ?? null,
        isCustom: cached.theme.is_custom,
        isLoaded: true,
        lastFetchedAt: cached.fetchedAt,
      });
    } catch {
      set({ isLoaded: true });
    }
  },

  cacheTheme: async (theme) => {
    try {
      const payload: CachedTheme = { theme, fetchedAt: Date.now() };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
      // non-critical
    }
  },

  isCacheStale: () => {
    const { lastFetchedAt } = get();
    if (!lastFetchedAt) return true;
    return Date.now() - lastFetchedAt > CACHE_MAX_AGE_MS;
  },
}));

/** Customer screens import `useThemeStore`; technician uses `src/stores/theme.ts`. */
export const useThemeStore = useCustomerThemeStore;
