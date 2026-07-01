/**
 * Multi-tenant franchise branding — Phase 2: extract theme tokens per franchise.
 */
export type FranchiseTheme = {
  primary: string;
  background: string;
};

export const defaultTheme: FranchiseTheme = {
  primary: '#2563eb',
  background: '#ffffff',
};
