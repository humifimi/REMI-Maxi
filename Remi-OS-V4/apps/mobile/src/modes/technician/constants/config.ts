import { Platform } from "react-native";
import Constants from "expo-constants";

const RENDER_URL = "https://remi-api-ij2v.onrender.com";

const getBaseUrl = () => {
  if (!__DEV__) {
    return RENDER_URL;
  }
  if (Platform.OS === "android" && !Constants.expoConfig?.hostUri) {
    return "http://10.0.2.2:3000";
  }
  const host = Constants.expoConfig?.hostUri?.split(":")[0] ?? "localhost";
  return `http://${host}:3000`;
};

export const Config = {
  API_BASE_URL: getBaseUrl(),
  API_PREFIX: "/api/v1/technician",
  FRANCHISE_API_PREFIX: "/api/v1/franchise",
  ADMIN_API_PREFIX: "/api/v1/admin",
  TOOLS_API_PREFIX: "/api/v1/tools",
  // Signal (in-app social feed) is mounted at the global root, not under
  // /technician — see REMIBackend src/routes/v1/index.ts. Keep this prefix
  // stable so signal hooks can compose against `Endpoints.signal.*` strings
  // without leaking the mount detail into the hook layer.
  SIGNAL_API_PREFIX: "/api/v1",
  // Web canonical origin used to build profit-model share URLs sent via the
  // native Share sheet. Recipients open them in a browser by default; the
  // remi:// deep-link variant is for in-app handoff between REMI apps.
  WEB_ORIGIN: "https://app.remi.com",
  // Stripe publishable key (safe to ship in the client bundle). Sourced from
  // the EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY env var: locally via
  // REMITechnician/.env.local (gitignored), on EAS via `eas env:create`.
  // Consumed by Chunk 1.2 (StripeProvider) — Phase 1 of the REMI 1.0 Field MVP
  // plan. Server-side Stripe calls (PaymentIntents, refunds) go through
  // REMIBackend with the secret key, never from this app.
  STRIPE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "",
  SECURE_STORE_ACCESS_TOKEN_KEY: "remi_access_token",
  SECURE_STORE_REFRESH_TOKEN_KEY: "remi_refresh_token",
  SECURE_STORE_USER_KEY: "remi_user",
  SECURE_STORE_BIOMETRIC_KEY: "remi_biometric_enabled",
  /**
   * Master FE-side gate for any path that auto-displays demo seed
   * data the user did NOT initiate. Defaulted **off** so the AI-
   * suggestion review feed (and any future demo-only auto-seed UI)
   * stays empty unless someone explicitly flips this back on for a
   * customer demo or pitch.
   *
   * Today the only consumer is `useAiSuggestionSessions` — when
   * `DEMO_MODE` is `false`, the hook returns an empty list with
   * `enabled: false` so the AI tab badge reads zero and the
   * realtime cascade for the BE's demo `005_pending_reality_demo`
   * seed is invisible to the FO user.
   *
   * Note: this does NOT turn off the BE-side demo seeder (controlled
   * by the `DEMO_MODE=true` env var on the Render service powering
   * `https://remi-api-ij2v.onrender.com`). The BE will still create
   * AI sessions on its own schedule; the FE just hides them. To
   * disable BE seeding entirely, flip the Render env var.
   *
   * The user-facing "demo" surfaces tagged with `@demo-start` /
   * `@demo-end` markers (Quick Login, Quick Fill VIN, the FO Demo
   * Mode panel in `app/(tabs)/more.tsx`) are intentionally NOT gated
   * by this constant — those are deliberate operator-facing
   * affordances that should stay visible whenever demo accounts are
   * in use. See `DEMO-CODE.md` for the full demo manifest and the
   * "Demo mode default" section for which paths this constant
   * gates vs. which are governed by the `@demo-*` tag system.
   */
  DEMO_MODE: false,
} as const;

if (__DEV__ && !Config.STRIPE_PUBLISHABLE_KEY) {
  console.warn(
    "[config] EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is empty. " +
      "Create REMITechnician/.env.local with the key and restart Metro. " +
      "Stripe SDK calls will fail until this is set.",
  );
}
