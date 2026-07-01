/**
 * Cross-component access to the FO portrait calendar's collapse-
 * progress shared value (PR-UX-6, 2026-05-08 follow-up to
 * `2026-05-08-portrait-week-hover-dwell-parity`).
 *
 * `<CollapsibleTop>` (defined locally inside `app/(tabs)/index.tsx`)
 * animates its child's height via Reanimated `useAnimatedStyle` over
 * a `collapseProgress` shared value driven by a Pan + tap. When the
 * progress flips from 0→1 (collapsing the briefing/header chrome)
 * or 1→0 (expanding it back) the workweek view that lives BELOW
 * `<CollapsibleTop>` slides up/down by ~150–200pt in window
 * coordinates without any of its descendants resizing — JS-side
 * `View.onLayout` does NOT fire on Reanimated-driven height changes,
 * so the avatar strip's bbox registration goes stale and the
 * drag-to-avatar hit-test misses every avatar in the collapsed
 * state.
 *
 * The fix: hoist the `collapseProgress` SV out of `<CollapsibleTop>`
 * into a context provider that wraps both the chrome AND the
 * calendar branches. Descendants that need to react to the collapse
 * (currently the portrait avatar strip's bbox-derivation hook —
 * `useAvatarStripBboxDerivation`) can subscribe via
 * `useCollapseProgress()` and run a `useAnimatedReaction` that
 * triggers a window-bbox remeasure when the animation settles to
 * either endpoint.
 *
 * Provider usage is ALL OR NOTHING: components that mount inside
 * `<CollapsibleTopProvider>` AND want collapse-aware behavior call
 * `useCollapseProgress()`; the hook returns `null` when no provider
 * is present (landscape route, tests, etc.) and the consumer is
 * expected to no-op the reaction in that branch.
 *
 * `<CollapsibleTop>` itself MUST be mounted inside this provider —
 * it asserts non-null on the SV. There is intentionally no fallback
 * `useSharedValue(0)` inside the component because that would let a
 * caller silently lose the wiring (the chrome would still animate,
 * but the strip's reaction would watch a different SV instance and
 * never see the edges).
 */

import { createContext, useContext, type ReactNode } from "react";
import {
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

const CollapsibleTopCtx = createContext<SharedValue<number> | null>(null);

interface CollapsibleTopProviderProps {
  children: ReactNode;
}

export function CollapsibleTopProvider({
  children,
}: CollapsibleTopProviderProps) {
  // 0 = fully expanded (chrome visible at natural height).
  // 1 = fully collapsed (chrome height interpolates to 0).
  // The Pan/tap gestures inside `<CollapsibleTop>` write through
  // `withSpring(0|1, ...)` so the SV settles cleanly at endpoints —
  // consumers can detect "settled" by reacting on edges that hit
  // exactly 0 or exactly 1.
  const collapseProgress = useSharedValue(0);
  return (
    <CollapsibleTopCtx.Provider value={collapseProgress}>
      {children}
    </CollapsibleTopCtx.Provider>
  );
}

/**
 * Read the FO portrait collapse-progress SV. Returns `null` outside
 * a `<CollapsibleTopProvider>` ancestor (landscape canvas, tests,
 * other tabs). Consumers should treat `null` as "no collapse to
 * react to" and skip their `useAnimatedReaction` registration.
 */
export function useCollapseProgress(): SharedValue<number> | null {
  return useContext(CollapsibleTopCtx);
}
