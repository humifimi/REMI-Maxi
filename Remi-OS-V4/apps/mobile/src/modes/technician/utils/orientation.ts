/**
 * Orientation lock helpers (P0-FE-3).
 *
 * Thin wrappers around `expo-screen-orientation` so the rest of the app
 * can request orientation transitions without re-importing the module
 * everywhere or re-stating the failure-handling pattern.
 *
 * Both helpers are defensive on purpose: if the native module fails to
 * load at runtime (very rare — only happens if a future build is
 * mis-linked, or if a hot-reload trips the autolinker), the helpers
 * fall back to a silent no-op so a calendar tab focus / blur transition
 * never throws into the React tree. We log to `console.warn` only in
 * `__DEV__` so production builds stay quiet.
 *
 * Consumers (Phase B onwards):
 * - `OrientationGate` in `app/(tabs)/index.tsx` uses these on tab focus
 *   / blur and on the calendar's portrait↔landscape transitions
 *   (master plan §5.1.2).
 * - Other tabs are portrait-only; they call `lockToPortrait()` once on
 *   focus to be safe even if a previous focus left landscape unlocked.
 *
 * The chunk that owns the install + the `app.json` change is `P0-FE-3`;
 * the chunk that wires these helpers into `OrientationGate` is
 * `P2-FE-4`. This file ships in `B-FULL-1` so the helpers are present
 * the moment Phase B starts referencing them.
 */

import * as ScreenOrientation from "expo-screen-orientation";

export async function lockToPortrait(): Promise<void> {
  try {
    await ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.PORTRAIT_UP,
    );
  } catch (err) {
    if (__DEV__) {
      console.warn("[orientation] lockToPortrait failed:", err);
    }
  }
}

export async function allowAllOrientations(): Promise<void> {
  try {
    await ScreenOrientation.unlockAsync();
  } catch (err) {
    if (__DEV__) {
      console.warn("[orientation] allowAllOrientations failed:", err);
    }
  }
}
