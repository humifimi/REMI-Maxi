import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { Config } from "@technician/constants/config";
import { queryClient } from "@technician/api/query-client";
import { useCalendarStore } from "@technician/stores/calendar";
import { usePendingRealityStore } from "@technician/stores/pending-reality";
import { useSheetDraftStore } from "@technician/stores/use-sheet-draft-store";
import { useJobFlowStore } from "@technician/stores/job-flow";
import { useDraftTriggerStore } from "@technician/stores/draft-trigger";
import { useProfitModelDraftStore } from "@technician/stores/profit-model-draft-store";
import { useActiveTimerStore } from "@technician/stores/active-timer";
import { useDispatchOfferStore } from "@technician/stores/dispatch-offer";
import type { AuthUser } from "@technician/types/api";
import { useAppModeStore } from "@/src/stores/app-mode";

/**
 * Reset every Zustand store + the React Query cache that holds
 * session-scoped data tied to the previous user.
 *
 * Stores that are intentionally NOT reset because they're
 * environmental (carry across logins on the same device): theme,
 * accessibility (preferred-hand), sound, demo settings, active job
 * timer, dispatch offer, rotate-back toast, bubble state.
 *
 * Why this lives next to `logout()`:
 *   The `useAuthStore.logout()` action is called from at least two
 *   places (the More tab, and the Axios 401 interceptor) and BOTH
 *   need the cache wiped. Centralizing it in the action means the
 *   interceptor path also benefits without each call site having to
 *   remember to clear caches.
 *
 * Cross-device note (2026-04-27):
 *   Clearing the cache here addresses single-device user-switching
 *   leaks (e.g. FO logs out on a phone, tech logs in on the same
 *   phone, would otherwise see FO's cached calendar). It does NOT
 *   address cross-device sync (FO modifies on device A, tech on
 *   device B sees stale data) — that's a real-time invalidation
 *   problem, not a logout-cleanup problem.
 */
function clearSessionScopedState() {
  queryClient.clear();
  useCalendarStore.getState().reset();
  usePendingRealityStore.getState().clear();
  useSheetDraftStore.getState().reset();
  useJobFlowStore.getState().reset();
  useDraftTriggerStore.getState().clear();
  useProfitModelDraftStore.getState().clear();
  useActiveTimerStore.getState().clearTimer();
  useDispatchOfferStore.getState().dismiss();
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  biometricRequired: boolean;
  demoFleetMode: boolean;
  demoFleetRole: "fleet_manager" | "fleet_driver" | null;

  setTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  setUser: (user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  getBiometricEnabled: () => Promise<boolean>;
  hasBiometricPreference: () => Promise<boolean>;
  completeBiometric: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
  isHydrated: false,
  biometricRequired: false,
  demoFleetMode: false,
  demoFleetRole: null,

  setTokens: async (accessToken, refreshToken) => {
    await SecureStore.setItemAsync(
      Config.SECURE_STORE_ACCESS_TOKEN_KEY,
      accessToken
    );
    await SecureStore.setItemAsync(
      Config.SECURE_STORE_REFRESH_TOKEN_KEY,
      refreshToken
    );
    set({
      accessToken,
      refreshToken,
      isAuthenticated: true,
      biometricRequired: false,
    });
  },

  setUser: async (user) => {
    await SecureStore.setItemAsync(
      Config.SECURE_STORE_USER_KEY,
      JSON.stringify(user)
    );
    set({ user });
    await useAppModeStore.getState().syncFromUser(user);
    // LDM-WAVE-1 CHUNK-2 — invalidate the capability cache on login so the
    // `useCapabilities` hook re-fetches `/auth/me/capabilities` for the new
    // user instead of reusing whatever was cached from a previous session.
    // Logout + refresh-failure paths already clear the entire `queryClient`
    // via `clearSessionScopedState()`, so this `setUser` call is the only
    // remaining seam that has to invalidate the cap cache explicitly.
    queryClient.invalidateQueries({ queryKey: ["auth", "capabilities"] });
  },

  logout: async () => {
    // Idempotency guard (2026-04-27): once auth state is cleared,
    // make subsequent calls a no-op. Without this guard a single
    // expired-token event triggers a cascade — each of the 4 axios
    // clients (`apiClient` / `franchiseClient` / `toolsClient` /
    // `signalClient`) has its own response interceptor that calls
    // `logout()` on a 401-with-no-refresh, and all in-flight queries
    // (calendar, AI suggestions, reorganization session, real-time
    // ping) fire 401s in parallel after the first refresh fails.
    // Each cascade call re-runs `clearSessionScopedState`, which
    // mints fresh `[]` array references in `usePendingRealityStore`
    // / `useSheetDraftStore` and re-renders every subscribing
    // screen, which in turn re-fires its query hooks → another
    // 401 → another logout. Result: a runaway loop that floods the
    // dev console with `[DEBUG:Store/PendingReality] clear` /
    // `[DEBUG:Store/SheetDraft] reset` until the user kills the
    // packager. Returning early once we're already unauthenticated
    // breaks the loop at the source — the first interceptor call
    // does the cleanup, the rest no-op until a new login.
    const prev = get();
    if (
      !prev.isAuthenticated &&
      !prev.accessToken &&
      !prev.refreshToken &&
      !prev.user
    ) {
      return;
    }
    await SecureStore.deleteItemAsync(Config.SECURE_STORE_ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(Config.SECURE_STORE_REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(Config.SECURE_STORE_USER_KEY);
    set({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      biometricRequired: false,
      demoFleetMode: false,
      demoFleetRole: null,
    });
    // Wipe React Query cache and session-scoped Zustand stores so a
    // subsequent login on this device starts from a clean slate.
    // See `clearSessionScopedState` above for what's reset and why.
    clearSessionScopedState();
  },

  setBiometricEnabled: async (enabled) => {
    await SecureStore.setItemAsync(
      Config.SECURE_STORE_BIOMETRIC_KEY,
      enabled ? "true" : "false"
    );
  },

  getBiometricEnabled: async () => {
    const value = await SecureStore.getItemAsync(
      Config.SECURE_STORE_BIOMETRIC_KEY
    );
    return value === "true";
  },

  hasBiometricPreference: async () => {
    const value = await SecureStore.getItemAsync(
      Config.SECURE_STORE_BIOMETRIC_KEY
    );
    return value !== null;
  },

  completeBiometric: () => {
    const { accessToken, refreshToken, user } = get();
    if (accessToken && refreshToken && user) {
      set({ isAuthenticated: true, biometricRequired: false });
    }
  },

  hydrate: async () => {
    async function readTokens() {
      const accessToken = await SecureStore.getItemAsync(
        Config.SECURE_STORE_ACCESS_TOKEN_KEY
      );
      const refreshToken = await SecureStore.getItemAsync(
        Config.SECURE_STORE_REFRESH_TOKEN_KEY
      );
      const userJson = await SecureStore.getItemAsync(
        Config.SECURE_STORE_USER_KEY
      );
      const user = userJson ? (JSON.parse(userJson) as AuthUser) : null;
      return { accessToken, refreshToken, user };
    }

    try {
      let { accessToken, refreshToken, user } = await readTokens();

      if (!accessToken && !refreshToken && !user) {
        await new Promise((r) => setTimeout(r, 500));
        ({ accessToken, refreshToken, user } = await readTokens());
      }

      const biometricFlag = await SecureStore.getItemAsync(
        Config.SECURE_STORE_BIOMETRIC_KEY
      );
      const biometricEnabled = biometricFlag === "true";

      if (__DEV__) {
        console.log("[AUTH HYDRATE]", {
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          hasUser: !!user,
          biometricFlag,
          biometricEnabled,
        });
      }

      if (accessToken && refreshToken && user) {
        const parsedUser = user as AuthUser;
        await useAppModeStore.getState().syncFromUser(parsedUser);
        if (biometricEnabled) {
          set({
            accessToken,
            refreshToken,
            user: parsedUser,
            isAuthenticated: false,
            biometricRequired: true,
            isHydrated: true,
          });
        } else {
          set({
            accessToken,
            refreshToken,
            user: parsedUser,
            isAuthenticated: true,
            isHydrated: true,
          });
        }
      } else {
        set({ isHydrated: true });
      }
    } catch (e) {
      if (__DEV__) {
        console.error("[AUTH HYDRATE] Error:", e);
      }
      set({ isHydrated: true });
    }
  },
}));
