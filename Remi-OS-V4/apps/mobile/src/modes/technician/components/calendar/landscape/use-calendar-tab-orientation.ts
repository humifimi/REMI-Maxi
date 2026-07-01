/**
 * `useCalendarTabOrientation` — focus/blur orientation gate for the
 * calendar tab (P2-FE-4, master plan §5.1.2).
 *
 * Per master plan §5.1.2, the app is portrait-only **except** the
 * calendar tab. This hook implements the per-tab gate:
 *
 *   - On focus → `allowAllOrientations()` so the user can rotate the
 *     device into landscape and the system honours it.
 *   - On blur or unmount → `lockToPortrait()` so navigating to any
 *     other tab snaps back to portrait, even if we were in landscape
 *     when the user tabbed away.
 *
 * Both helpers come from `src/utils/orientation.ts` (P0-FE-3) which
 * silently no-ops if `expo-screen-orientation` isn't linked, so this
 * hook is safe to call in Expo Go and in tests.
 *
 * Tab-bar / calendar-header visibility is **not** managed here — that
 * lives in `app/(tabs)/_layout.tsx`, branched on
 * `useWindowDimensions()`. Splitting the concerns keeps this hook
 * pure orientation-side-effect, which makes it trivial to mock in
 * `app/(tabs)/index.tsx` tests later.
 *
 * Why a separate hook (rather than inlining `useFocusEffect` in the
 * tab screen): the calendar screen already has two large components
 * (`FranchiseOwnerCalendar`, `TechnicianCalendar`). Hoisting the
 * 8-line lifecycle into a dedicated hook keeps either branch from
 * accidentally diverging in how it locks/unlocks, and gives the
 * upcoming `OrientationGate` chunks (`P2-FE-5`+) a single seam to
 * extend.
 */

import { useCallback } from "react";
import { useFocusEffect } from "expo-router";

import {
  allowAllOrientations,
  lockToPortrait,
} from "@technician/utils/orientation";

interface Options {
  /**
   * When false, the gate becomes a no-op (no orientation calls fire).
   * Used by the calendar tab's `TechnicianCalendar` branch where the
   * tech role currently has no landscape canvas — wiring the hook
   * unconditionally avoids a duplicate `useFocusEffect` per branch.
   * Defaults to `true`.
   */
  enabled?: boolean;
}

export function useCalendarTabOrientation({ enabled = true }: Options = {}): void {
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;

      void allowAllOrientations();

      return () => {
        void lockToPortrait();
      };
    }, [enabled]),
  );
}
