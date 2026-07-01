import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  FranchiseTheme,
  FranchiseThemeColors,
  FranchiseThemeFonts,
} from "@technician/types/api";

const THEME_STORAGE_KEY = "remi_franchise_theme";

export const DEFAULT_COLORS: FranchiseThemeColors = {
  primary: "#3B82F6",
  primary_light: "#93C5FD",
  primary_dark: "#1D4ED8",
  secondary: "#111827",
  secondary_light: "#374151",
  accent: "#8B5CF6",
  header_bg: "#111827",
  header_text: "#FFFFFF",
  tab_active: "#3B82F6",
  tab_inactive: "#6B7280",
  tab_bar_bg: "#FFFFFF",
  status_bar_style: "light",
};

export const DEFAULT_FONTS: FranchiseThemeFonts = {
  heading: null,
  body: null,
};

export const DEFAULT_THEME: FranchiseTheme = {
  franchise_id: 0,
  brand_name: "MAXI",
  logo_url: null,
  icon_url: null,
  colors: DEFAULT_COLORS,
  fonts: DEFAULT_FONTS,
  updated_at: new Date().toISOString(),
};

/** Persisted / API payloads may omit `colors`; never expose undefined to UI. */
export function mergeFranchiseTheme(
  partial: Partial<FranchiseTheme> | FranchiseTheme | null | undefined,
): FranchiseTheme {
  if (!partial) return DEFAULT_THEME;
  return {
    ...DEFAULT_THEME,
    ...partial,
    colors: { ...DEFAULT_COLORS, ...partial.colors },
    fonts: { ...DEFAULT_FONTS, ...partial.fonts },
  };
}

interface ThemeState {
  theme: FranchiseTheme;
  isLoaded: boolean;
  isPreviewActive: boolean;
  previewTheme: FranchiseTheme | null;

  setTheme: (theme: FranchiseTheme) => Promise<void>;
  hydrateTheme: () => Promise<void>;
  resetToDefault: () => Promise<void>;

  startPreview: (preview: FranchiseTheme) => void;
  updatePreview: (colors: Partial<FranchiseThemeColors>) => void;
  commitPreview: () => Promise<void>;
  cancelPreview: () => void;

  resolvedTheme: () => FranchiseTheme;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: DEFAULT_THEME,
  isLoaded: false,
  isPreviewActive: false,
  previewTheme: null,

  setTheme: async (theme) => {
    const merged = mergeFranchiseTheme(theme);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(merged));
    set({ theme: merged, isLoaded: true });
  },

  hydrateTheme: async () => {
    try {
      const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as FranchiseTheme;
        set({ theme: mergeFranchiseTheme(parsed), isLoaded: true });
        return;
      }
    } catch {
      if (__DEV__) console.warn("[THEME] Failed to hydrate stored theme");
    }
    set({ isLoaded: true });
  },

  resetToDefault: async () => {
    await AsyncStorage.removeItem(THEME_STORAGE_KEY);
    set({
      theme: DEFAULT_THEME,
      isPreviewActive: false,
      previewTheme: null,
    });
  },

  startPreview: (preview) => {
    set({ isPreviewActive: true, previewTheme: mergeFranchiseTheme(preview) });
  },

  updatePreview: (colorPatch) => {
    const { previewTheme, theme } = get();
    const base = mergeFranchiseTheme(previewTheme ?? theme);
    set({
      previewTheme: {
        ...base,
        colors: { ...base.colors, ...colorPatch },
      },
    });
  },

  commitPreview: async () => {
    const { previewTheme } = get();
    if (previewTheme) {
      const merged = mergeFranchiseTheme(previewTheme);
      await AsyncStorage.setItem(
        THEME_STORAGE_KEY,
        JSON.stringify(merged)
      );
      set({
        theme: merged,
        isPreviewActive: false,
        previewTheme: null,
      });
    }
  },

  cancelPreview: () => {
    set({ isPreviewActive: false, previewTheme: null });
  },

  resolvedTheme: () => {
    const { isPreviewActive, previewTheme, theme } = get();
    const active =
      isPreviewActive && previewTheme ? previewTheme : theme;
    // Merge only when persisted/API data is incomplete. Do not merge on
    // every read — that allocates a new object and breaks Zustand selectors.
    return active.colors ? active : mergeFranchiseTheme(active);
  },
}));

/** Stable selector for React subscriptions (returns a cached store reference). */
export function selectThemeColors(state: ThemeState): FranchiseThemeColors {
  const active =
    state.isPreviewActive && state.previewTheme ? state.previewTheme : state.theme;
  return active.colors ?? DEFAULT_COLORS;
}

/**
 * Non-hook accessor for the resolved theme colors.
 * Use in StyleSheet factories or outside React components.
 */
export function getThemeColors(): FranchiseThemeColors {
  return selectThemeColors(useThemeStore.getState());
}
