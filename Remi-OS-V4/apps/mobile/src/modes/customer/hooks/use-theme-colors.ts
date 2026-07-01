import { useThemeStore } from '@/src/stores/customer-theme';
import type { ResolvedThemeColors, ResolvedBrand } from '@customer/types/theme';

/**
 * Returns the current franchise-resolved color palette. Falls back to
 * MAXI brand defaults when no franchise theme is active.
 *
 * Usage: const { colors, brand } = useThemeColors();
 */
export function useThemeColors(): {
  colors: ResolvedThemeColors;
  brand: ResolvedBrand;
  fontFamily: string | null;
  isCustom: boolean;
} {
  const colors = useThemeStore((s) => s.colors);
  const brand = useThemeStore((s) => s.brand);
  const fontFamily = useThemeStore((s) => s.fontFamily);
  const isCustom = useThemeStore((s) => s.isCustom);
  return { colors, brand, fontFamily, isCustom };
}
