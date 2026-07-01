import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { QueryClientProvider, focusManager } from "@tanstack/react-query";
import { useAuthStore } from "@/src/stores/auth";
import { useAppModeStore } from "@/src/stores/app-mode";
import { queryClient } from "@technician/api/query-client";
import { useBubbleState } from "@technician/hooks/utility/use-bubble-state";
import {
  useLocationTracking,
  LocationContextProvider,
} from "@technician/hooks/utility/use-location";
import { useTodayRoute } from "@technician/hooks/operations/use-routes";
import { UserRole, RouteStatus } from "@technician/types/enums";
import { FrustrationDetectionProvider } from "@technician/hooks/ai/use-frustration-detection";
import { useThemeSync } from "@technician/hooks/auth/use-theme";

/**
 * Query-key roots that we explicitly refetch when the app comes back
 * to the foreground. These are the keys whose data can change due to
 * actions taken on a *different* device since the user backgrounded
 * this one (FO reassignments, dispatcher overrides, reorganization
 * commits, route status changes, message arrivals).
 *
 * If you add a new query whose data is mutated by another device's
 * actions, add its root key here. Caches that are entirely the local
 * device's own state (job-flow drafts, profit-model drafts, sound
 * prefs) intentionally do NOT belong here — there's nothing for the
 * server to tell us about.
 *
 * The values are the FIRST element of each query-key array; TanStack
 * Query's prefix-match invalidation walks all sub-keys for free.
 */
// Verified against the actual `queryKey: [...]` literals in
// src/hooks/{schedule,communication,operations,jobs}/. Personal
// events nest under `["calendar", ...]` (see `use-personal-events.ts`
// invalidating `calendarKeys.all`) so the `calendar` root covers them.
const CROSS_DEVICE_QUERY_ROOTS: ReadonlyArray<readonly unknown[]> = [
  ["calendar"],
  ["franchise-calendar"],
  ["dispatch-overview"],
  ["dispatch-alerts"],
  ["tech-metrics"],
  ["routes"],
  ["reorganizations"],
  ["jobs"],
  ["messages"],
] as const;

/**
 * Bridge React Native's `AppState` to TanStack Query so
 * foreground/background transitions trigger refetches of
 * cross-device-relevant data, the way window-focus events do on
 * the web.
 *
 * Why this matters (2026-04-27):
 *
 *   The app sets `refetchOnWindowFocus: false` globally in
 *   `src/api/query-client.ts` — appropriate for the web (where focus
 *   events fire constantly and would thrash the API) but on native
 *   there is no analogue unless we explicitly tell the runtime
 *   whether the app is foregrounded.
 *
 *   Without this bridge, two-device flows (FO modifying an
 *   appointment on device A, technician viewing the same calendar
 *   on device B) leave device B with stale data until either the
 *   30s `staleTime` expires AND the screen re-mounts, or the user
 *   pulls to refresh. That's the symptom the user reported as "when
 *   I move an appointment for the tech from the FO side it doesn't
 *   move on the techs side."
 *
 *   With this bridge in place, swiping back to device B
 *   (background → active) does two things:
 *     1. `focusManager.setFocused(true)` — picks up any query that
 *        opts into `refetchOnWindowFocus: true` (none today, but
 *        future-proofed for easy per-query opt-in).
 *     2. Invalidates the explicit `CROSS_DEVICE_QUERY_ROOTS` set so
 *        any observed query under those roots refetches immediately,
 *        regardless of the global `refetchOnWindowFocus: false`
 *        default. This is the actually-effective half — without it
 *        no calendar data would refresh because no calendar query
 *        opts in.
 *
 *   This does NOT solve the case where both devices are foregrounded
 *   simultaneously and a change on one needs to push to the other —
 *   that requires a websocket fan-out for plain appointment moves
 *   (today only reorganization-flow events emit on a channel; see
 *   `src/hooks/realtime/use-realtime-reorganization.ts`). For
 *   two-device demo flows where the user actively switches between
 *   devices, the foreground-invalidation pattern is the correct,
 *   low-effort fix.
 *
 *   The first AppState event after subscribing fires immediately
 *   with the current state on iOS (it doesn't on Android), which
 *   would invalidate every cache on app start before any screen has
 *   even mounted. We track the previous state in a ref and skip the
 *   "background → active" path when there is no previous state — the
 *   real first foreground happens later, after a real backgrounding.
 *
 * Web behaviour is unchanged: `Platform.OS === "web"` short-circuits
 * the listener install so the existing browser focus-event handling
 * stays in charge.
 */
function useAppStateFocusBridge(): void {
  const previousStateRef = useRef<AppStateStatus | null>(null);

  useEffect(() => {
    if (Platform.OS === "web") return;

    function onAppStateChange(status: AppStateStatus): void {
      const previous = previousStateRef.current;
      previousStateRef.current = status;

      // `inactive` is the brief intermediate state on iOS during
      // app-switcher hover etc. — treat it as "not focused" so we
      // don't blast a refetch on every fleeting transition.
      focusManager.setFocused(status === "active");

      // Only invalidate when transitioning FROM a known
      // background-ish state TO active. Skip the implicit
      // initial-active event we observe on subscribe.
      const wasBackgrounded =
        previous === "background" || previous === "inactive";
      const becameActive = status === "active";
      if (!wasBackgrounded || !becameActive) return;

      if (__DEV__) {
        console.log("[AppStateFocusBridge] foreground → invalidate", {
          roots: CROSS_DEVICE_QUERY_ROOTS.map((k) => k[0]),
        });
      }
      for (const queryKey of CROSS_DEVICE_QUERY_ROOTS) {
        queryClient.invalidateQueries({ queryKey });
      }
    }

    const subscription = AppState.addEventListener(
      "change",
      onAppStateChange,
    );
    return () => subscription.remove();
  }, []);
}

function AuthHydration({ children }: { children: React.ReactNode }) {
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const hydrateAppMode = useAppModeStore((s) => s.hydrate);
  const hydrateBubble = useBubbleState().hydrate;

  useEffect(() => {
    hydrateAppMode();
    hydrateAuth();
    hydrateBubble();
  }, [hydrateAppMode, hydrateAuth, hydrateBubble]);

  useThemeSync();
  useAppStateFocusBridge();

  return <>{children}</>;
}

function LocationProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const isTechnician = user?.role === UserRole.TECHNICIAN;
  const routeQuery = useTodayRoute();
  const { isTracking, currentLocation, startTracking, stopTracking } =
    useLocationTracking();

  const hasActiveRoute =
    routeQuery.data != null &&
    (routeQuery.data.status === RouteStatus.ACTIVE ||
      routeQuery.data.status === RouteStatus.PLANNED);

  useEffect(() => {
    if (isTechnician && hasActiveRoute && !isTracking) {
      startTracking();
    } else if ((!isTechnician || !hasActiveRoute) && isTracking) {
      stopTracking();
    }
  }, [isTechnician, hasActiveRoute, isTracking, startTracking, stopTracking]);

  return (
    <LocationContextProvider value={currentLocation}>
      {children}
    </LocationContextProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthHydration>
        <LocationProvider>
          <FrustrationDetectionProvider>
            {children}
          </FrustrationDetectionProvider>
        </LocationProvider>
      </AuthHydration>
    </QueryClientProvider>
  );
}
