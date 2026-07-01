export interface FranchiseThemeResponse {
  franchise_id: number;
  primary_color: string;
  secondary_color: string;
  accent_color: string | null;
  background_color: string | null;
  surface_color: string | null;
  text_color: string | null;
  error_color: string | null;
  logo_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
  font_family_heading: string | null;
  font_family_body: string | null;
  font_overrides: Record<string, unknown> | null;
  custom_copy: Record<string, string> | null;
  app_name: string;
  tagline: string;
  support_phone: string;
  support_email: string;
  social_links: Record<string, string> | null;
  is_custom: boolean;
}

export interface ResolvedThemeColors {
  primary: string;
  primaryDark: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderLight: string;
  error: string;
  success: string;
  warning: string;
  white: string;
  black: string;
}

export interface ResolvedBrand {
  appName: string;
  tagline: string;
  logoUrl: string | null;
  logoDarkUrl: string | null;
  supportPhone: string;
  supportEmail: string;
  customCopy: Record<string, string> | null;
}

export interface CachedTheme {
  theme: FranchiseThemeResponse;
  fetchedAt: number;
}
